use std::process::Command;

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, info};

use super::Scanner;
use crate::error::ScanError;
use crate::finding::{Finding, ScannerKind, Severity};
use crate::util::spdx_parser::parse_spdx_packages;

#[derive(Debug, Clone)]
pub struct CargoSbomScanner {
    cargo_bin: String,
    osv_query_url: String,
    http_client: Client,
}

impl Default for CargoSbomScanner {
    fn default() -> Self {
        Self {
            cargo_bin: "cargo".to_string(),
            osv_query_url: "https://api.osv.dev/v1/query".to_string(),
            http_client: Client::new(),
        }
    }
}

impl CargoSbomScanner {
    #[cfg(test)]
    pub(crate) fn with_cargo_bin(cargo_bin: impl Into<String>) -> Self {
        Self {
            cargo_bin: cargo_bin.into(),
            ..Self::default()
        }
    }
}

impl Scanner for CargoSbomScanner {
    fn name(&self) -> &'static str {
        "cargo-sbom"
    }

    fn kind(&self) -> ScannerKind {
        ScannerKind::Sca
    }

    fn preflight(&self) -> Result<(), ScanError> {
        let output = Command::new(&self.cargo_bin)
            .arg("sbom")
            .arg("--version")
            .output();

        match output {
            Ok(result) if result.status.success() => Ok(()),
            Ok(_) => Err(ScanError::MissingTool {
                scanner: self.name(),
                tool: "cargo-sbom",
                install_hint: "cargo install cargo-sbom",
            }),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Err(ScanError::MissingTool {
                scanner: self.name(),
                tool: "cargo",
                install_hint: "https://rustup.rs/",
            }),
            Err(err) => Err(ScanError::Io(err)),
        }
    }

    fn scan(&self) -> Result<Vec<Finding>, ScanError> {
        self.preflight()?;
        info!(scanner = self.name(), "generating SPDX JSON via cargo sbom");

        let output = Command::new(&self.cargo_bin)
            .arg("sbom")
            .arg("--output-format")
            .arg("spdx-json")
            .output()?;

        if !output.status.success() {
            return Err(ScanError::CommandFailed {
                scanner: self.name(),
                message: String::from_utf8_lossy(&output.stderr).to_string(),
            });
        }

        let sbom_json = String::from_utf8_lossy(&output.stdout);
        debug!(
            scanner = self.name(),
            "cargo sbom raw output: {}", sbom_json
        );
        let packages = parse_spdx_packages(&sbom_json)?;

        let mut all_findings = Vec::new();
        for (package_name, package_version) in packages {
            info!(
                scanner = self.name(),
                package = package_name,
                version = package_version,
                "querying osv"
            );
            let request = OsvRequest {
                package: OsvPackage {
                    name: package_name.clone(),
                    ecosystem: "crates.io".to_string(),
                },
                version: package_version.clone(),
            };

            let response = self
                .http_client
                .post(&self.osv_query_url)
                .json(&request)
                .send()?
                .error_for_status()?;
            let body: OsvResponse = response.json()?;
            debug!(scanner = self.name(), "osv response for package received");
            all_findings.extend(map_osv_response_to_findings(
                &body,
                self.name(),
                &package_name,
                &package_version,
            ));
        }

        Ok(all_findings)
    }
}

#[derive(Debug, Serialize)]
struct OsvRequest {
    package: OsvPackage,
    version: String,
}

#[derive(Debug, Serialize)]
struct OsvPackage {
    name: String,
    ecosystem: String,
}

#[derive(Debug, Deserialize)]
struct OsvResponse {
    #[serde(default)]
    vulns: Vec<OsvVulnerability>,
}

#[derive(Debug, Deserialize)]
struct OsvVulnerability {
    id: String,
    summary: Option<String>,
    details: Option<String>,
    #[serde(default)]
    aliases: Vec<String>,
    #[serde(default)]
    references: Vec<OsvReference>,
    #[serde(default)]
    severity: Vec<OsvSeverity>,
    database_specific: Option<OsvDatabaseSpecific>,
    #[serde(default)]
    affected: Vec<OsvAffected>,
}

#[derive(Debug, Deserialize)]
struct OsvReference {
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OsvSeverity {
    score: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OsvDatabaseSpecific {
    severity: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OsvAffected {
    #[serde(default)]
    ranges: Vec<OsvRange>,
}

#[derive(Debug, Deserialize)]
struct OsvRange {
    #[serde(default)]
    events: Vec<OsvEvent>,
}

#[derive(Debug, Deserialize)]
struct OsvEvent {
    fixed: Option<String>,
}

fn map_osv_response_to_findings(
    response: &OsvResponse,
    scanner_name: &str,
    package_name: &str,
    package_version: &str,
) -> Vec<Finding> {
    response
        .vulns
        .iter()
        .map(|vuln| {
            let mut references = vuln
                .references
                .iter()
                .filter_map(|reference| reference.url.clone())
                .collect::<Vec<_>>();
            references.extend(vuln.aliases.clone());

            let fixed_versions = vuln
                .affected
                .iter()
                .flat_map(|affected| affected.ranges.iter())
                .flat_map(|range| range.events.iter())
                .filter_map(|event| event.fixed.as_ref())
                .cloned()
                .collect::<Vec<_>>();

            Finding {
                id: vuln.id.clone(),
                title: vuln
                    .summary
                    .clone()
                    .unwrap_or_else(|| "OSV vulnerability".to_string()),
                description: vuln.details.clone(),
                severity: map_osv_severity(vuln),
                kind: ScannerKind::Sca,
                package: Some(package_name.to_string()),
                version: Some(package_version.to_string()),
                location: None,
                remediation: if fixed_versions.is_empty() {
                    None
                } else {
                    Some(format!(
                        "Upgrade to fixed version(s): {}",
                        fixed_versions.join(", ")
                    ))
                },
                references,
                source_scanners: vec![scanner_name.to_string()],
            }
        })
        .collect()
}

fn map_osv_severity(vuln: &OsvVulnerability) -> Severity {
    if let Some(severity) = vuln
        .database_specific
        .as_ref()
        .and_then(|db| db.severity.as_ref())
    {
        return match severity.to_uppercase().as_str() {
            "CRITICAL" => Severity::Critical,
            "HIGH" => Severity::High,
            "MEDIUM" => Severity::Medium,
            "LOW" => Severity::Low,
            _ => Severity::Info,
        };
    }

    for score in vuln
        .severity
        .iter()
        .filter_map(|severity| severity.score.as_ref())
    {
        if let Some(numeric) = extract_first_number(score) {
            if numeric >= 9.0 {
                return Severity::Critical;
            }
            if numeric >= 7.0 {
                return Severity::High;
            }
            if numeric >= 4.0 {
                return Severity::Medium;
            }
            if numeric > 0.0 {
                return Severity::Low;
            }
        }
    }

    Severity::Medium
}

fn extract_first_number(value: &str) -> Option<f64> {
    let token = value
        .split(|ch: char| !(ch.is_ascii_digit() || ch == '.'))
        .find(|piece| !piece.is_empty())?;
    token.parse::<f64>().ok()
}

#[cfg(test)]
mod tests {
    use super::{map_osv_response_to_findings, CargoSbomScanner, OsvResponse};
    use crate::finding::Severity;
    use crate::scanner::Scanner;

    #[test]
    fn maps_osv_response_to_findings() {
        let payload = r#"
        {
          "vulns": [
            {
              "id": "RUSTSEC-2020-0159",
              "summary": "chrono vulnerability",
              "details": "Potential segfault in localtime_r invocations",
              "aliases": ["CVE-2020-26235"],
              "database_specific": { "severity": "HIGH" },
              "references": [{ "url": "https://osv.dev/vulnerability/RUSTSEC-2020-0159" }],
              "affected": [
                {
                  "ranges": [
                    { "events": [ {"fixed": "0.4.20"} ] }
                  ]
                }
              ]
            }
          ]
        }"#;

        let response: OsvResponse = serde_json::from_str(payload).expect("valid JSON");
        let findings = map_osv_response_to_findings(&response, "cargo-sbom", "chrono", "0.4.19");
        assert_eq!(findings.len(), 1);

        let finding = &findings[0];
        assert_eq!(finding.id, "RUSTSEC-2020-0159");
        assert_eq!(finding.package.as_deref(), Some("chrono"));
        assert_eq!(finding.version.as_deref(), Some("0.4.19"));
        assert_eq!(finding.severity, Severity::High);
        assert!(finding
            .references
            .iter()
            .any(|reference| reference.contains("osv.dev")));
    }

    #[test]
    fn maps_empty_osv_response_to_zero_findings() {
        let response: OsvResponse = serde_json::from_str(r#"{"vulns":[]}"#).expect("valid JSON");
        let findings = map_osv_response_to_findings(&response, "cargo-sbom", "serde", "1.0.0");
        assert!(findings.is_empty());
    }

    #[test]
    fn preflight_fails_for_missing_binary() {
        let scanner = CargoSbomScanner::with_cargo_bin("definitely-missing-binary-xyz");
        let result = scanner.preflight();
        assert!(result.is_err());
    }
}
