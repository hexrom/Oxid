use std::path::PathBuf;

use rustsec::report::Settings;
use rustsec::{Database, Report};
use serde_json::Value;
use tracing::{debug, info};

use super::Scanner;
use crate::error::ScanError;
use crate::finding::{Finding, ScannerKind, Severity};

#[derive(Debug, Clone)]
pub struct CargoAuditScanner {
    lockfile_path: PathBuf,
}

impl Default for CargoAuditScanner {
    fn default() -> Self {
        Self {
            lockfile_path: PathBuf::from("Cargo.lock"),
        }
    }
}

impl CargoAuditScanner {
    #[cfg(test)]
    pub(crate) fn with_lockfile_path(path: impl AsRef<std::path::Path>) -> Self {
        Self {
            lockfile_path: path.as_ref().to_path_buf(),
        }
    }
}

impl Scanner for CargoAuditScanner {
    fn name(&self) -> &'static str {
        "cargo-audit"
    }

    fn kind(&self) -> ScannerKind {
        ScannerKind::Sca
    }

    fn preflight(&self) -> Result<(), ScanError> {
        if self.lockfile_path.exists() {
            Ok(())
        } else {
            Err(ScanError::MissingFile {
                path: self.lockfile_path.display().to_string(),
            })
        }
    }

    fn scan(&self) -> Result<Vec<Finding>, ScanError> {
        self.preflight()?;

        info!(scanner = self.name(), "fetching RustSec advisory database");
        let database = Database::fetch().map_err(|err| ScanError::Other(err.to_string()))?;
        let lockfile = rustsec::lockfile::Lockfile::load(&self.lockfile_path)
            .map_err(|err| ScanError::Other(err.to_string()))?;
        let settings = Settings::default();
        let report = Report::generate(&database, &lockfile, &settings);
        let report_json = serde_json::to_value(report)?;
        debug!(
            scanner = self.name(),
            "cargo-audit raw report: {}", report_json
        );

        map_report_to_findings(&report_json)
    }
}

pub(crate) fn map_report_to_findings(report: &Value) -> Result<Vec<Finding>, ScanError> {
    let vulnerabilities = report
        .get("vulnerabilities")
        .and_then(|v| v.get("list"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let findings = vulnerabilities
        .iter()
        .map(|entry| {
            let advisory = entry.get("advisory").unwrap_or(&Value::Null);
            let package = entry.get("package").unwrap_or(&Value::Null);
            let versions = entry.get("versions").unwrap_or(&Value::Null);

            let patched_versions = versions
                .get("patched")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .filter(|s| !s.is_empty());

            let references = advisory
                .get("url")
                .and_then(Value::as_str)
                .map(|url| vec![url.to_string()])
                .unwrap_or_default();

            Finding {
                id: advisory
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("RUSTSEC-UNKNOWN")
                    .to_string(),
                title: advisory
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or("RustSec advisory")
                    .to_string(),
                description: advisory
                    .get("description")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                severity: advisory
                    .get("cvss")
                    .map(map_cvss_to_severity)
                    .unwrap_or(Severity::Medium),
                kind: ScannerKind::Sca,
                package: package
                    .get("name")
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
                    .or_else(|| {
                        advisory
                            .get("package")
                            .and_then(Value::as_str)
                            .map(ToString::to_string)
                    }),
                version: package
                    .get("version")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                location: None,
                remediation: patched_versions.map(|patched| format!("Upgrade to: {patched}")),
                references,
                source_scanners: vec!["cargo-audit".to_string()],
            }
        })
        .collect::<Vec<_>>();

    Ok(findings)
}

fn map_cvss_to_severity(cvss_value: &Value) -> Severity {
    let score = cvss_value
        .as_f64()
        .or_else(|| cvss_value.as_str().and_then(|raw| raw.parse::<f64>().ok()))
        .or_else(|| cvss_value.get("score").and_then(Value::as_f64))
        .unwrap_or(0.0);

    if score >= 9.0 {
        Severity::Critical
    } else if score >= 7.0 {
        Severity::High
    } else if score >= 4.0 {
        Severity::Medium
    } else if score > 0.0 {
        Severity::Low
    } else {
        Severity::Info
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{map_report_to_findings, CargoAuditScanner};
    use crate::finding::Severity;
    use crate::scanner::Scanner;

    #[test]
    fn maps_rustsec_json_to_findings() {
        let report = json!({
            "vulnerabilities": {
                "list": [
                    {
                        "package": {"name": "chrono", "version": "0.4.19"},
                        "advisory": {
                            "id": "RUSTSEC-2020-0159",
                            "title": "Potential segfault in localtime_r invocations",
                            "description": "Chrono has UB on some glibc versions.",
                            "url": "https://rustsec.org/advisories/RUSTSEC-2020-0159.html",
                            "cvss": 9.8,
                            "package": "chrono"
                        },
                        "versions": {"patched": [">=0.4.20"]}
                    }
                ]
            }
        });

        let findings = map_report_to_findings(&report).expect("mapping should succeed");
        assert_eq!(findings.len(), 1);
        let finding = &findings[0];
        assert_eq!(finding.id, "RUSTSEC-2020-0159");
        assert_eq!(finding.package.as_deref(), Some("chrono"));
        assert_eq!(finding.version.as_deref(), Some("0.4.19"));
        assert_eq!(finding.severity, Severity::Critical);
        assert!(finding.references[0].contains("rustsec"));
    }

    #[test]
    fn returns_empty_when_report_has_no_vulns() {
        let report = json!({
            "vulnerabilities": { "list": [] }
        });
        let findings = map_report_to_findings(&report).expect("mapping should succeed");
        assert!(findings.is_empty());
    }

    #[test]
    fn preflight_fails_when_lockfile_missing() {
        let scanner = CargoAuditScanner::with_lockfile_path("does-not-exist.lock");
        let result = scanner.preflight();
        assert!(result.is_err());
    }
}
