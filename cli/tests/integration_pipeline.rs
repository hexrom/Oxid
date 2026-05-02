use std::path::Path;

use oxid::error::ScanError;
use oxid::finding::{Finding, ScannerKind, Severity};
use oxid::report::{json, sarif};
use oxid::runner::run_scanners;
use oxid::scanner::Scanner;

#[derive(Clone)]
struct FixtureScanner {
    name: &'static str,
    kind: ScannerKind,
    findings: Vec<Finding>,
    preflight_ok: bool,
}

impl Scanner for FixtureScanner {
    fn name(&self) -> &'static str {
        self.name
    }

    fn kind(&self) -> ScannerKind {
        self.kind.clone()
    }

    fn preflight(&self) -> Result<(), ScanError> {
        if self.preflight_ok {
            Ok(())
        } else {
            Err(ScanError::MissingTool {
                scanner: self.name,
                tool: "fixture-tool",
                install_hint: "n/a",
            })
        }
    }

    fn scan(&self) -> Result<Vec<Finding>, ScanError> {
        Ok(self.findings.clone())
    }
}

fn finding(id: &str, scanner: &str, severity: Severity) -> Finding {
    Finding {
        id: id.to_string(),
        title: format!("Issue {id}"),
        description: Some("fixture finding".to_string()),
        severity,
        kind: ScannerKind::Sca,
        package: Some("chrono".to_string()),
        version: Some("0.4.19".to_string()),
        location: None,
        remediation: Some("Upgrade dependency".to_string()),
        references: vec!["https://rustsec.org".to_string()],
        source_scanners: vec![scanner.to_string()],
    }
}

#[test]
fn full_pipeline_runs_on_fixture_project() {
    let fixture = Path::new("tests/fixtures/vulnerable-project/Cargo.toml");
    assert!(fixture.exists(), "fixture project must exist");

    let scanners: Vec<Box<dyn Scanner>> = vec![
        Box::new(FixtureScanner {
            name: "cargo-audit",
            kind: ScannerKind::Sca,
            findings: vec![finding("RUSTSEC-2020-0159", "cargo-audit", Severity::High)],
            preflight_ok: true,
        }),
        Box::new(FixtureScanner {
            name: "cargo-sbom",
            kind: ScannerKind::Sca,
            findings: vec![finding("RUSTSEC-2020-0159", "cargo-sbom", Severity::Medium)],
            preflight_ok: true,
        }),
        Box::new(FixtureScanner {
            name: "clippy",
            kind: ScannerKind::Sast,
            findings: vec![finding(
                "clippy::suspicious_arithmetic_impl",
                "clippy",
                Severity::Medium,
            )],
            preflight_ok: true,
        }),
    ];

    let result = run_scanners(scanners);
    assert!(result.warnings.is_empty());
    assert_eq!(result.findings.len(), 2);
    assert_eq!(result.findings[0].severity, Severity::High);
    assert_eq!(result.findings[0].source_scanners.len(), 2);
}

#[test]
fn json_and_sarif_renderers_produce_valid_output() {
    let findings = vec![finding("RUSTSEC-2020-0159", "cargo-audit", Severity::High)];

    let json_report = json::render(&findings).expect("json report should render");
    let parsed_json: serde_json::Value =
        serde_json::from_str(&json_report).expect("json output should be valid");
    assert!(parsed_json.is_array());

    let sarif_report = sarif::render(&findings).expect("sarif report should render");
    let parsed_sarif: serde_json::Value =
        serde_json::from_str(&sarif_report).expect("sarif output should be valid JSON");
    assert_eq!(parsed_sarif["version"], "2.1.0");
    assert!(parsed_sarif["runs"].is_array());
}
