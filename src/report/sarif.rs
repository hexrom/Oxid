use std::collections::BTreeSet;

use serde::Serialize;

use crate::error::ScanError;
use crate::finding::{Finding, Severity};

pub fn render(findings: &[Finding]) -> Result<String, ScanError> {
    let scanners = findings
        .iter()
        .flat_map(|finding| finding.source_scanners.iter().cloned())
        .collect::<BTreeSet<_>>();

    let runs = scanners
        .into_iter()
        .map(|scanner_name| {
            let results = findings
                .iter()
                .filter(|finding| {
                    finding
                        .source_scanners
                        .iter()
                        .any(|name| name == &scanner_name)
                })
                .map(map_finding_to_result)
                .collect::<Vec<_>>();

            SarifRun {
                tool: SarifTool {
                    driver: SarifDriver {
                        name: scanner_name,
                        information_uri: Some("https://github.com/hexrom/oxid".to_string()),
                    },
                },
                results,
            }
        })
        .collect::<Vec<_>>();

    let document = SarifLog {
        version: "2.1.0".to_string(),
        schema: "https://json.schemastore.org/sarif-2.1.0.json".to_string(),
        runs,
    };

    serde_json::to_string_pretty(&document).map_err(ScanError::from)
}

fn map_finding_to_result(finding: &Finding) -> SarifResult {
    let message = if let Some(description) = &finding.description {
        format!("{}: {}", finding.title, description)
    } else {
        finding.title.clone()
    };

    let locations = finding.location.as_ref().map(|location| {
        vec![SarifLocation {
            physical_location: SarifPhysicalLocation {
                artifact_location: SarifArtifactLocation {
                    uri: location.file.clone(),
                },
                region: location.line.map(|line| SarifRegion {
                    start_line: line,
                    start_column: location.column,
                }),
            },
        }]
    });

    SarifResult {
        rule_id: finding.id.clone(),
        level: map_severity_to_sarif_level(&finding.severity).to_string(),
        message: SarifMessage { text: message },
        locations,
    }
}

fn map_severity_to_sarif_level(severity: &Severity) -> &'static str {
    match severity {
        Severity::Critical | Severity::High => "error",
        Severity::Medium | Severity::Low => "warning",
        Severity::Info => "note",
    }
}

#[derive(Debug, Serialize)]
struct SarifLog {
    version: String,
    #[serde(rename = "$schema")]
    schema: String,
    runs: Vec<SarifRun>,
}

#[derive(Debug, Serialize)]
struct SarifRun {
    tool: SarifTool,
    results: Vec<SarifResult>,
}

#[derive(Debug, Serialize)]
struct SarifTool {
    driver: SarifDriver,
}

#[derive(Debug, Serialize)]
struct SarifDriver {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    information_uri: Option<String>,
}

#[derive(Debug, Serialize)]
struct SarifResult {
    #[serde(rename = "ruleId")]
    rule_id: String,
    level: String,
    message: SarifMessage,
    #[serde(skip_serializing_if = "Option::is_none")]
    locations: Option<Vec<SarifLocation>>,
}

#[derive(Debug, Serialize)]
struct SarifMessage {
    text: String,
}

#[derive(Debug, Serialize)]
struct SarifLocation {
    #[serde(rename = "physicalLocation")]
    physical_location: SarifPhysicalLocation,
}

#[derive(Debug, Serialize)]
struct SarifPhysicalLocation {
    #[serde(rename = "artifactLocation")]
    artifact_location: SarifArtifactLocation,
    #[serde(skip_serializing_if = "Option::is_none")]
    region: Option<SarifRegion>,
}

#[derive(Debug, Serialize)]
struct SarifArtifactLocation {
    uri: String,
}

#[derive(Debug, Serialize)]
struct SarifRegion {
    #[serde(rename = "startLine")]
    start_line: u64,
    #[serde(rename = "startColumn", skip_serializing_if = "Option::is_none")]
    start_column: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::render;
    use crate::finding::{Finding, Location, ScannerKind, Severity};

    #[test]
    fn renders_valid_sarif_shape() {
        let findings = vec![Finding {
            id: "RUSTSEC-1".to_string(),
            title: "sample".to_string(),
            description: Some("details".to_string()),
            severity: Severity::Critical,
            kind: ScannerKind::Sca,
            package: Some("serde".to_string()),
            version: Some("1.0.0".to_string()),
            location: Some(Location {
                file: "src/main.rs".to_string(),
                line: Some(12),
                column: Some(4),
            }),
            remediation: None,
            references: vec![],
            source_scanners: vec!["cargo-audit".to_string()],
        }];

        let sarif = render(&findings).expect("sarif should render");
        assert!(sarif.contains("\"version\": \"2.1.0\""));
        assert!(sarif.contains("\"ruleId\": \"RUSTSEC-1\""));
        assert!(sarif.contains("\"level\": \"error\""));
    }
}
