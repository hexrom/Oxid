use std::process::Command;

use serde_json::Value;
use tracing::{debug, info};

use super::Scanner;
use crate::error::ScanError;
use crate::finding::{Finding, ScannerKind, Severity};

#[derive(Debug, Clone)]
pub struct CargoGeigerScanner {
    cargo_bin: String,
}

impl Default for CargoGeigerScanner {
    fn default() -> Self {
        Self {
            cargo_bin: "cargo".to_string(),
        }
    }
}

impl CargoGeigerScanner {
    #[cfg(test)]
    pub(crate) fn with_cargo_bin(cargo_bin: impl Into<String>) -> Self {
        Self {
            cargo_bin: cargo_bin.into(),
        }
    }
}

impl Scanner for CargoGeigerScanner {
    fn name(&self) -> &'static str {
        "cargo-geiger"
    }

    fn kind(&self) -> ScannerKind {
        ScannerKind::Unsafe
    }

    fn preflight(&self) -> Result<(), ScanError> {
        let output = Command::new(&self.cargo_bin)
            .arg("geiger")
            .arg("--version")
            .output();

        match output {
            Ok(result) if result.status.success() => Ok(()),
            Ok(_) => Err(ScanError::MissingTool {
                scanner: self.name(),
                tool: "cargo-geiger",
                install_hint: "cargo install cargo-geiger",
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
        info!(scanner = self.name(), "running cargo geiger");

        let output = Command::new(&self.cargo_bin)
            .arg("geiger")
            .arg("--output-format")
            .arg("json")
            .output()?;

        if !output.status.success() {
            return Err(ScanError::CommandFailed {
                scanner: self.name(),
                message: String::from_utf8_lossy(&output.stderr).to_string(),
            });
        }

        let raw = String::from_utf8_lossy(&output.stdout).to_string();
        debug!(scanner = self.name(), "cargo geiger raw output: {}", raw);
        parse_cargo_geiger_output(&raw, self.name())
    }
}

pub(crate) fn parse_cargo_geiger_output(
    raw: &str,
    scanner_name: &str,
) -> Result<Vec<Finding>, ScanError> {
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }

    let value: Value = serde_json::from_str(raw)?;
    let packages = value
        .get("packages")
        .and_then(Value::as_array)
        .cloned()
        .or_else(|| value.get("crates").and_then(Value::as_array).cloned())
        .unwrap_or_default();

    let findings = packages
        .iter()
        .filter_map(|package| {
            let name = package
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("unknown-crate");
            let version = package
                .get("version")
                .and_then(Value::as_str)
                .unwrap_or("unknown-version");
            let unsafe_count = unsafe_count_from_value(package);
            if unsafe_count == 0 {
                return None;
            }

            Some(Finding {
                id: format!("unsafe-usage-{name}"),
                title: format!("Unsafe usage detected in {name}"),
                description: Some(format!(
                    "cargo-geiger reported {unsafe_count} unsafe usage(s) for {name}@{version}."
                )),
                severity: Severity::Info,
                kind: ScannerKind::Unsafe,
                package: Some(name.to_string()),
                version: Some(version.to_string()),
                location: None,
                remediation: Some(
                    "Review unsafe blocks and document invariants for each usage.".to_string(),
                ),
                references: vec!["https://github.com/geiger-rs/cargo-geiger".to_string()],
                source_scanners: vec![scanner_name.to_string()],
            })
        })
        .collect::<Vec<_>>();

    Ok(findings)
}

fn unsafe_count_from_value(value: &Value) -> u64 {
    match value {
        Value::Object(map) => map
            .iter()
            .map(|(key, nested)| {
                if key.to_lowercase().contains("unsafe") {
                    nested
                        .as_u64()
                        .unwrap_or_else(|| unsafe_count_from_value(nested))
                } else {
                    unsafe_count_from_value(nested)
                }
            })
            .sum(),
        Value::Array(items) => items.iter().map(unsafe_count_from_value).sum(),
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_cargo_geiger_output, CargoGeigerScanner};
    use crate::finding::ScannerKind;
    use crate::scanner::Scanner;

    #[test]
    fn maps_unsafe_counts_to_findings() {
        let raw = r#"
        {
          "packages": [
            {
              "name": "foo",
              "version": "0.1.0",
              "metrics": { "unsafe": 3 }
            },
            {
              "name": "bar",
              "version": "0.2.0",
              "metrics": { "unsafe": 0 }
            }
          ]
        }"#;

        let findings = parse_cargo_geiger_output(raw, "cargo-geiger").expect("parsing should work");
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].kind, ScannerKind::Unsafe);
        assert_eq!(findings[0].package.as_deref(), Some("foo"));
    }

    #[test]
    fn returns_zero_findings_for_clean_output() {
        let raw = r#"{ "packages": [ { "name": "foo", "version": "0.1.0", "unsafe": 0 } ] }"#;
        let findings = parse_cargo_geiger_output(raw, "cargo-geiger").expect("parsing should work");
        assert!(findings.is_empty());
    }

    #[test]
    fn preflight_fails_for_missing_binary() {
        let scanner = CargoGeigerScanner::with_cargo_bin("definitely-missing-binary-xyz");
        let result = scanner.preflight();
        assert!(result.is_err());
    }
}
