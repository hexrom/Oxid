use std::process::Command;

use serde_json::Value;
use tracing::{debug, info};

use super::Scanner;
use crate::error::ScanError;
use crate::finding::{Finding, ScannerKind, Severity};

#[derive(Debug, Clone)]
pub struct CargoDenyScanner {
    cargo_bin: String,
}

impl Default for CargoDenyScanner {
    fn default() -> Self {
        Self {
            cargo_bin: "cargo".to_string(),
        }
    }
}

impl CargoDenyScanner {
    #[cfg(test)]
    pub(crate) fn with_cargo_bin(cargo_bin: impl Into<String>) -> Self {
        Self {
            cargo_bin: cargo_bin.into(),
        }
    }
}

impl Scanner for CargoDenyScanner {
    fn name(&self) -> &'static str {
        "cargo-deny"
    }

    fn kind(&self) -> ScannerKind {
        ScannerKind::Sca
    }

    fn preflight(&self) -> Result<(), ScanError> {
        let output = Command::new(&self.cargo_bin)
            .arg("deny")
            .arg("--version")
            .output();

        match output {
            Ok(result) if result.status.success() => Ok(()),
            Ok(_) => Err(ScanError::MissingTool {
                scanner: self.name(),
                tool: "cargo-deny",
                install_hint: "cargo install cargo-deny",
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
        info!(scanner = self.name(), "running cargo deny");

        let output = Command::new(&self.cargo_bin)
            .arg("deny")
            .arg("check")
            .arg("--format")
            .arg("json")
            .output()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let raw = if stdout.trim().is_empty() {
            stderr.to_string()
        } else {
            stdout.to_string()
        };
        debug!(scanner = self.name(), "cargo deny raw output: {}", raw);

        parse_cargo_deny_output(&raw, self.name())
    }
}

pub(crate) fn parse_cargo_deny_output(
    raw: &str,
    scanner_name: &str,
) -> Result<Vec<Finding>, ScanError> {
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }

    let entries = if raw.trim_start().starts_with('[') || raw.trim_start().starts_with('{') {
        let value: Value = serde_json::from_str(raw)?;
        normalize_cargo_deny_json(&value)
    } else {
        raw.lines()
            .filter_map(|line| serde_json::from_str::<Value>(line).ok())
            .collect::<Vec<_>>()
    };

    let findings = entries
        .iter()
        .filter_map(|entry| {
            let issue_type = entry
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let is_advisory = issue_type.contains("advisory");
            let is_license = issue_type.contains("license");

            if !is_advisory && !is_license {
                return None;
            }

            let fields = entry.get("fields").unwrap_or(entry);
            let advisory = fields.get("advisory").unwrap_or(fields);
            let package = fields.get("package").unwrap_or(fields);

            let id = advisory
                .get("id")
                .and_then(Value::as_str)
                .or_else(|| entry.get("code").and_then(Value::as_str))
                .unwrap_or("cargo-deny-issue")
                .to_string();
            let title = advisory
                .get("title")
                .and_then(Value::as_str)
                .or_else(|| fields.get("message").and_then(Value::as_str))
                .unwrap_or("cargo-deny finding")
                .to_string();
            let description = advisory
                .get("description")
                .and_then(Value::as_str)
                .map(ToString::to_string)
                .or_else(|| {
                    fields
                        .get("message")
                        .and_then(Value::as_str)
                        .map(ToString::to_string)
                });
            let references = advisory
                .get("url")
                .and_then(Value::as_str)
                .map(|url| vec![url.to_string()])
                .unwrap_or_default();

            Some(Finding {
                id,
                title,
                description,
                severity: map_cargo_deny_severity(entry),
                kind: if is_license {
                    ScannerKind::License
                } else {
                    ScannerKind::Sca
                },
                package: package
                    .get("name")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                version: package
                    .get("version")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                location: None,
                remediation: None,
                references,
                source_scanners: vec![scanner_name.to_string()],
            })
        })
        .collect::<Vec<_>>();

    Ok(findings)
}

fn normalize_cargo_deny_json(value: &Value) -> Vec<Value> {
    match value {
        Value::Array(items) => items.clone(),
        Value::Object(map) => {
            if let Some(items) = map.get("diagnostics").and_then(Value::as_array) {
                items.clone()
            } else {
                vec![value.clone()]
            }
        }
        _ => Vec::new(),
    }
}

fn map_cargo_deny_severity(entry: &Value) -> Severity {
    let severity = entry
        .get("severity")
        .and_then(Value::as_str)
        .or_else(|| {
            entry
                .get("fields")
                .and_then(|fields| fields.get("severity"))
                .and_then(Value::as_str)
        })
        .unwrap_or("warning")
        .to_lowercase();

    match severity.as_str() {
        "error" => Severity::High,
        "warning" => Severity::Medium,
        "note" => Severity::Low,
        _ => Severity::Info,
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_cargo_deny_output, CargoDenyScanner};
    use crate::finding::ScannerKind;
    use crate::scanner::Scanner;

    #[test]
    fn maps_advisories_and_licenses() {
        let raw = r#"
        [
          {
            "type":"advisory",
            "severity":"error",
            "fields":{
              "advisory":{"id":"RUSTSEC-2020-0159","title":"chrono vuln","url":"https://rustsec.org/advisories/RUSTSEC-2020-0159.html"},
              "package":{"name":"chrono","version":"0.4.19"}
            }
          },
          {
            "type":"license",
            "severity":"warning",
            "fields":{
              "message":"GPL-3.0 detected",
              "package":{"name":"foo","version":"0.1.0"},
              "advisory":{"id":"LICENSE-GPL-3.0","title":"disallowed license"}
            }
          }
        ]"#;

        let findings = parse_cargo_deny_output(raw, "cargo-deny").expect("parsing should work");
        assert_eq!(findings.len(), 2);
        assert_eq!(findings[0].id, "RUSTSEC-2020-0159");
        assert_eq!(findings[1].kind, ScannerKind::License);
    }

    #[test]
    fn returns_zero_findings_for_clean_input() {
        let findings = parse_cargo_deny_output("[]", "cargo-deny").expect("parsing should work");
        assert!(findings.is_empty());
    }

    #[test]
    fn preflight_fails_for_missing_binary() {
        let scanner = CargoDenyScanner::with_cargo_bin("definitely-missing-binary-xyz");
        let result = scanner.preflight();
        assert!(result.is_err());
    }
}
