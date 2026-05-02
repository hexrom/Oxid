use std::collections::{BTreeMap, BTreeSet};

use owo_colors::OwoColorize;

use crate::finding::{Finding, Severity};

pub fn render(findings: &[Finding]) -> String {
    let counts = severity_counts(findings);
    let scanner_count = findings
        .iter()
        .flat_map(|finding| finding.source_scanners.iter())
        .collect::<BTreeSet<_>>()
        .len();

    let mut lines = vec![format!(
        "Found {} critical, {} high, {} medium findings across {} scanners.",
        counts
            .get(&Severity::Critical)
            .copied()
            .unwrap_or_default()
            .to_string()
            .red()
            .bold(),
        counts
            .get(&Severity::High)
            .copied()
            .unwrap_or_default()
            .to_string()
            .yellow()
            .bold(),
        counts
            .get(&Severity::Medium)
            .copied()
            .unwrap_or_default()
            .to_string()
            .cyan()
            .bold(),
        scanner_count.to_string().bold(),
    )];

    for severity in [
        Severity::Critical,
        Severity::High,
        Severity::Medium,
        Severity::Low,
        Severity::Info,
    ] {
        let severity_findings = findings
            .iter()
            .filter(|finding| finding.severity == severity)
            .collect::<Vec<_>>();

        if severity_findings.is_empty() {
            continue;
        }

        lines.push(String::new());
        lines.push(colorize_severity_label(
            &severity,
            &format!("{severity:?} findings"),
        ));

        for finding in severity_findings {
            let package = finding
                .package
                .as_ref()
                .zip(finding.version.as_ref())
                .map(|(name, version)| format!("{name}@{version}"))
                .unwrap_or_else(|| "n/a".to_string());
            let scanners = finding.source_scanners.join(", ");
            lines.push(format!(
                "- [{}] {} ({}) [{}]",
                finding.id.bold(),
                finding.title,
                package,
                scanners
            ));
            if let Some(location) = &finding.location {
                let line = location
                    .line
                    .map(|value| value.to_string())
                    .unwrap_or_default();
                lines.push(format!(
                    "  location: {}{}",
                    location.file,
                    format_line(&line)
                ));
            }
            if let Some(remediation) = &finding.remediation {
                lines.push(format!("  remediation: {remediation}"));
            }
        }
    }

    lines.join("\n")
}

fn severity_counts(findings: &[Finding]) -> BTreeMap<Severity, usize> {
    let mut counts = BTreeMap::new();
    for finding in findings {
        *counts.entry(finding.severity.clone()).or_default() += 1;
    }
    counts
}

fn colorize_severity_label(severity: &Severity, label: &str) -> String {
    match severity {
        Severity::Critical => label.red().bold().to_string(),
        Severity::High => label.yellow().bold().to_string(),
        Severity::Medium => label.cyan().bold().to_string(),
        Severity::Low => label.blue().bold().to_string(),
        Severity::Info => label.white().bold().to_string(),
    }
}

fn format_line(line: &str) -> String {
    if line.is_empty() {
        String::new()
    } else {
        format!(":{line}")
    }
}

#[cfg(test)]
mod tests {
    use super::render;
    use crate::finding::{Finding, ScannerKind, Severity};

    #[test]
    fn renders_summary_and_group_headers() {
        let findings = vec![Finding {
            id: "RUSTSEC-1".to_string(),
            title: "sample".to_string(),
            description: None,
            severity: Severity::High,
            kind: ScannerKind::Sca,
            package: Some("serde".to_string()),
            version: Some("1.0.0".to_string()),
            location: None,
            remediation: None,
            references: vec![],
            source_scanners: vec!["cargo-audit".to_string()],
        }];

        let rendered = render(&findings);
        assert!(rendered.contains("Found"));
        assert!(rendered.contains("High findings"));
        assert!(rendered.contains("RUSTSEC-1"));
    }
}
