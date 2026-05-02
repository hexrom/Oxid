use std::collections::HashMap;
use std::time::{Duration, Instant};

use indicatif::{ProgressBar, ProgressStyle};
use rayon::prelude::*;
use tracing::{info, warn};

use crate::finding::{Finding, Severity};
use crate::scanner::Scanner;

#[derive(Debug, Clone, Copy, Default)]
pub struct RunOptions {
    pub show_progress: bool,
}

#[derive(Debug, Clone)]
pub enum ScannerRunStatus {
    Completed { finding_count: usize },
    Skipped { reason: String },
    Failed { reason: String },
}

#[derive(Debug, Clone)]
pub struct ScannerTiming {
    pub scanner: String,
    pub duration: Duration,
    pub status: ScannerRunStatus,
}

#[derive(Debug, Default)]
pub struct RunResult {
    pub findings: Vec<Finding>,
    pub warnings: Vec<String>,
    pub scanner_timings: Vec<ScannerTiming>,
    pub total_duration: Duration,
}

pub fn run_scanners(scanners: Vec<Box<dyn Scanner>>) -> RunResult {
    run_scanners_with_options(scanners, RunOptions::default())
}

pub fn run_scanners_with_options(
    scanners: Vec<Box<dyn Scanner>>,
    options: RunOptions,
) -> RunResult {
    let run_start = Instant::now();
    let mut runnable = Vec::new();
    let mut warnings = Vec::new();
    let mut scanner_timings = Vec::new();

    for scanner in scanners {
        let preflight_start = Instant::now();
        info!(scanner = scanner.name(), "running preflight");
        match scanner.preflight() {
            Ok(()) => runnable.push(scanner),
            Err(err) => {
                let warning = format!("Skipping {}: {}", scanner.name(), err);
                warn!("{warning}");
                warnings.push(warning.clone());
                scanner_timings.push(ScannerTiming {
                    scanner: scanner.name().to_string(),
                    duration: preflight_start.elapsed(),
                    status: ScannerRunStatus::Skipped { reason: warning },
                });
            }
        }
    }

    let progress = if options.show_progress && !runnable.is_empty() {
        let bar = ProgressBar::new(runnable.len() as u64);
        let style = ProgressStyle::with_template(
            "{spinner:.green} scanning [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} {msg}",
        )
        .unwrap_or_else(|_| ProgressStyle::default_bar())
        .progress_chars("#>-");
        bar.set_style(style);
        Some(bar)
    } else {
        None
    };

    #[derive(Debug)]
    struct ScannerRunOutcome {
        findings: Vec<Finding>,
        timing: ScannerTiming,
        warning: Option<String>,
    }

    let outcomes = runnable
        .into_par_iter()
        .map(|scanner| {
            let started_at = Instant::now();
            info!(scanner = scanner.name(), "starting scan");
            let outcome = match scanner.scan() {
                Ok(findings) => ScannerRunOutcome {
                    timing: ScannerTiming {
                        scanner: scanner.name().to_string(),
                        duration: started_at.elapsed(),
                        status: ScannerRunStatus::Completed {
                            finding_count: findings.len(),
                        },
                    },
                    findings,
                    warning: None,
                },
                Err(err) => {
                    let warning = format!("Scan failed for {}: {}", scanner.name(), err);
                    warn!("{warning}");
                    ScannerRunOutcome {
                        findings: Vec::new(),
                        timing: ScannerTiming {
                            scanner: scanner.name().to_string(),
                            duration: started_at.elapsed(),
                            status: ScannerRunStatus::Failed {
                                reason: warning.clone(),
                            },
                        },
                        warning: Some(warning),
                    }
                }
            };

            if let Some(bar) = &progress {
                bar.inc(1);
            }
            outcome
        })
        .collect::<Vec<_>>();

    if let Some(bar) = progress {
        bar.finish_and_clear();
    }

    let mut findings = Vec::new();
    for outcome in outcomes {
        findings.extend(outcome.findings);
        if let Some(warning) = outcome.warning {
            warnings.push(warning);
        }
        scanner_timings.push(outcome.timing);
    }

    let deduped_sorted = dedupe_and_sort(findings);
    RunResult {
        findings: deduped_sorted,
        warnings,
        scanner_timings,
        total_duration: run_start.elapsed(),
    }
}

pub fn dedupe_and_sort(findings: Vec<Finding>) -> Vec<Finding> {
    let mut merged: HashMap<(String, String, String), Finding> = HashMap::new();

    for finding in findings {
        let key = (
            finding.id.clone(),
            finding.package.clone().unwrap_or_default(),
            finding.version.clone().unwrap_or_default(),
        );

        if let Some(existing) = merged.get_mut(&key) {
            if richer_description(&finding.description, &existing.description) {
                existing.description = finding.description.clone();
            }

            if finding.severity < existing.severity {
                existing.severity = finding.severity.clone();
            }

            if existing.remediation.is_none() && finding.remediation.is_some() {
                existing.remediation = finding.remediation.clone();
            }

            for reference in &finding.references {
                if !existing.references.iter().any(|item| item == reference) {
                    existing.references.push(reference.clone());
                }
            }

            for scanner in &finding.source_scanners {
                if !existing.source_scanners.iter().any(|item| item == scanner) {
                    existing.source_scanners.push(scanner.clone());
                }
            }
            existing.source_scanners.sort();
        } else {
            merged.insert(key, finding);
        }
    }

    let mut deduped = merged.into_values().collect::<Vec<_>>();
    deduped.sort_by(|left, right| {
        left.severity
            .cmp(&right.severity)
            .then_with(|| left.kind.cmp(&right.kind))
            .then_with(|| left.id.cmp(&right.id))
    });
    deduped
}

fn richer_description(candidate: &Option<String>, current: &Option<String>) -> bool {
    candidate.as_ref().map_or(0, String::len) > current.as_ref().map_or(0, String::len)
}

pub fn has_findings_at_or_above_threshold(findings: &[Finding], threshold: &Severity) -> bool {
    findings
        .iter()
        .any(|finding| finding.severity.meets_or_exceeds(threshold))
}

#[cfg(test)]
mod tests {
    use super::{
        dedupe_and_sort, has_findings_at_or_above_threshold, run_scanners_with_options, RunOptions,
        ScannerRunStatus,
    };
    use crate::finding::{Finding, ScannerKind, Severity};
    use crate::scanner::Scanner;

    fn sample_finding(id: &str, scanner: &str, severity: Severity) -> Finding {
        Finding {
            id: id.to_string(),
            title: id.to_string(),
            description: None,
            severity,
            kind: ScannerKind::Sca,
            package: Some("serde".to_string()),
            version: Some("1.0.0".to_string()),
            location: None,
            remediation: None,
            references: vec![],
            source_scanners: vec![scanner.to_string()],
        }
    }

    #[test]
    fn dedupes_by_id_package_version_and_merges_sources() {
        let first = sample_finding("RUSTSEC-1", "cargo-audit", Severity::High);
        let second = sample_finding("RUSTSEC-1", "cargo-sbom", Severity::Medium);
        let deduped = dedupe_and_sort(vec![first, second]);

        assert_eq!(deduped.len(), 1);
        assert_eq!(deduped[0].severity, Severity::High);
        assert_eq!(
            deduped[0].source_scanners,
            vec!["cargo-audit".to_string(), "cargo-sbom".to_string()]
        );
    }

    #[test]
    fn checks_threshold_correctly() {
        let findings = vec![
            sample_finding("A", "cargo-audit", Severity::Low),
            sample_finding("B", "clippy", Severity::High),
        ];
        assert!(has_findings_at_or_above_threshold(
            &findings,
            &Severity::High
        ));
        assert!(!has_findings_at_or_above_threshold(
            &findings,
            &Severity::Critical
        ));
    }

    #[derive(Clone)]
    struct FixtureScanner {
        name: &'static str,
        findings: Vec<Finding>,
        preflight_ok: bool,
    }

    impl Scanner for FixtureScanner {
        fn name(&self) -> &'static str {
            self.name
        }

        fn kind(&self) -> ScannerKind {
            ScannerKind::Sca
        }

        fn preflight(&self) -> Result<(), crate::error::ScanError> {
            if self.preflight_ok {
                Ok(())
            } else {
                Err(crate::error::ScanError::MissingTool {
                    scanner: self.name,
                    tool: "fixture",
                    install_hint: "n/a",
                })
            }
        }

        fn scan(&self) -> Result<Vec<Finding>, crate::error::ScanError> {
            Ok(self.findings.clone())
        }
    }

    #[test]
    fn records_scanner_timings_and_statuses() {
        let scanners: Vec<Box<dyn Scanner>> = vec![
            Box::new(FixtureScanner {
                name: "a",
                findings: vec![sample_finding("A", "a", Severity::Low)],
                preflight_ok: true,
            }),
            Box::new(FixtureScanner {
                name: "b",
                findings: Vec::new(),
                preflight_ok: false,
            }),
        ];

        let result = run_scanners_with_options(
            scanners,
            RunOptions {
                show_progress: false,
            },
        );
        assert_eq!(result.findings.len(), 1);
        assert_eq!(result.scanner_timings.len(), 2);
        assert!(result
            .scanner_timings
            .iter()
            .any(|timing| matches!(timing.status, ScannerRunStatus::Skipped { .. })));
    }
}
