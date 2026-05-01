use std::process::Command;

use serde::Deserialize;
use tracing::{debug, info};

use super::Scanner;
use crate::error::ScanError;
use crate::finding::{Finding, Location, ScannerKind, Severity};

#[derive(Debug, Clone)]
pub struct ClippyScanner {
    cargo_bin: String,
}

impl Default for ClippyScanner {
    fn default() -> Self {
        Self {
            cargo_bin: "cargo".to_string(),
        }
    }
}

impl ClippyScanner {
    #[cfg(test)]
    pub(crate) fn with_cargo_bin(cargo_bin: impl Into<String>) -> Self {
        Self {
            cargo_bin: cargo_bin.into(),
        }
    }
}

impl Scanner for ClippyScanner {
    fn name(&self) -> &'static str {
        "clippy"
    }

    fn kind(&self) -> ScannerKind {
        ScannerKind::Sast
    }

    fn preflight(&self) -> Result<(), ScanError> {
        let output = Command::new(&self.cargo_bin)
            .arg("clippy")
            .arg("--version")
            .output();

        match output {
            Ok(result) if result.status.success() => Ok(()),
            Ok(_) => Err(ScanError::MissingTool {
                scanner: self.name(),
                tool: "cargo-clippy",
                install_hint: "rustup component add clippy",
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
        info!(scanner = self.name(), "running cargo clippy diagnostics");

        let output = Command::new(&self.cargo_bin)
            .arg("clippy")
            .arg("--message-format=json")
            .arg("--")
            .arg("-W")
            .arg("clippy::suspicious")
            .output()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        debug!(scanner = self.name(), "clippy raw output: {}", stdout);
        parse_clippy_json_stream(&stdout, self.name())
    }
}

#[derive(Debug, Deserialize)]
struct CargoMessage {
    reason: Option<String>,
    message: Option<CompilerMessage>,
}

#[derive(Debug, Deserialize)]
struct CompilerMessage {
    message: String,
    level: String,
    code: Option<DiagnosticCode>,
    #[serde(default)]
    spans: Vec<DiagnosticSpan>,
}

#[derive(Debug, Deserialize)]
struct DiagnosticCode {
    code: String,
}

#[derive(Debug, Deserialize)]
struct DiagnosticSpan {
    file_name: String,
    line_start: Option<u64>,
    column_start: Option<u64>,
    is_primary: Option<bool>,
}

pub(crate) fn parse_clippy_json_stream(
    stream: &str,
    scanner_name: &str,
) -> Result<Vec<Finding>, ScanError> {
    let mut findings = Vec::new();

    for line in stream.lines().filter(|line| !line.trim().is_empty()) {
        let parsed = serde_json::from_str::<CargoMessage>(line);
        let Ok(message) = parsed else {
            continue;
        };

        if message.reason.as_deref() != Some("compiler-message") {
            continue;
        }

        let Some(diagnostic) = message.message else {
            continue;
        };

        let id = diagnostic
            .code
            .as_ref()
            .map(|code| code.code.clone())
            .unwrap_or_else(|| "clippy::diagnostic".to_string());

        let location = diagnostic
            .spans
            .iter()
            .find(|span| span.is_primary.unwrap_or(false))
            .or_else(|| diagnostic.spans.first())
            .map(|span| Location {
                file: span.file_name.clone(),
                line: span.line_start,
                column: span.column_start,
            });

        let severity = if diagnostic.level.eq_ignore_ascii_case("error") {
            Severity::High
        } else {
            Severity::Medium
        };

        findings.push(Finding {
            id,
            title: diagnostic.message.clone(),
            description: Some(diagnostic.message),
            severity,
            kind: ScannerKind::Sast,
            package: None,
            version: None,
            location,
            remediation: Some("Address the lint or suppress with a justified allow.".to_string()),
            references: vec!["https://rust-lang.github.io/rust-clippy/".to_string()],
            source_scanners: vec![scanner_name.to_string()],
        });
    }

    Ok(findings)
}

#[cfg(test)]
mod tests {
    use super::{parse_clippy_json_stream, ClippyScanner};
    use crate::finding::Severity;
    use crate::scanner::Scanner;

    #[test]
    fn parses_compiler_messages_to_findings() {
        let stream = r#"{"reason":"compiler-message","message":{"message":"suspicious arithmetic impl","level":"warning","code":{"code":"clippy::suspicious_arithmetic_impl"},"spans":[{"file_name":"src/lib.rs","line_start":17,"column_start":9,"is_primary":true}]}}
{"reason":"compiler-artifact","package_id":"foo 0.1.0"}"#;

        let findings = parse_clippy_json_stream(stream, "clippy").expect("parse should succeed");
        assert_eq!(findings.len(), 1);
        let finding = &findings[0];
        assert_eq!(finding.id, "clippy::suspicious_arithmetic_impl");
        assert_eq!(finding.severity, Severity::Medium);
        assert_eq!(
            finding.location.as_ref().map(|loc| loc.file.as_str()),
            Some("src/lib.rs")
        );
    }

    #[test]
    fn returns_empty_on_non_diagnostic_stream() {
        let stream = r#"{"reason":"build-finished","success":true}"#;
        let findings = parse_clippy_json_stream(stream, "clippy").expect("parse should succeed");
        assert!(findings.is_empty());
    }

    #[test]
    fn preflight_fails_for_missing_binary() {
        let scanner = ClippyScanner::with_cargo_bin("definitely-missing-binary-xyz");
        let result = scanner.preflight();
        assert!(result.is_err());
    }
}
