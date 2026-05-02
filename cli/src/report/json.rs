use crate::error::ScanError;
use crate::finding::Finding;

pub fn render(findings: &[Finding]) -> Result<String, ScanError> {
    serde_json::to_string_pretty(findings).map_err(ScanError::from)
}

#[cfg(test)]
mod tests {
    use super::render;
    use crate::finding::{Finding, ScannerKind, Severity};

    #[test]
    fn renders_findings_as_json_array() {
        let findings = vec![Finding {
            id: "RUSTSEC-1".to_string(),
            title: "sample".to_string(),
            description: None,
            severity: Severity::Low,
            kind: ScannerKind::Sca,
            package: Some("serde".to_string()),
            version: Some("1.0.0".to_string()),
            location: None,
            remediation: None,
            references: vec![],
            source_scanners: vec!["cargo-audit".to_string()],
        }];

        let rendered = render(&findings).expect("json should render");
        assert!(rendered.starts_with("["));
        assert!(rendered.contains("\"id\": \"RUSTSEC-1\""));
    }
}
