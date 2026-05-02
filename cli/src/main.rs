use std::collections::BTreeSet;
use std::io::{self, Write};
use std::path::Path;
use std::process::Command as ProcessCommand;

use anyhow::{bail, Result};
use clap::{Arg, ArgAction, ArgMatches, Command, ValueEnum};
use oxid::config::{OxidConfig, OXID_CONFIG_FILE};
use oxid::finding::{Finding, Severity};
use oxid::report::{human, json, sarif};
use oxid::runner::{
    has_findings_at_or_above_threshold, run_scanners_with_options, RunOptions, ScannerRunStatus,
};
use oxid::scanner::{all_scanners, scanner_names};

fn main() -> Result<()> {
    let _ = tracing_subscriber::fmt().with_target(false).try_init();

    let matches = Command::new("oxid")
        .disable_version_flag(true)
        .about("Unified Rust security scanner")
        .arg(
            Arg::new("version")
                .long("version")
                .action(ArgAction::SetTrue)
                .help("Show oxid version and discovered external tool versions"),
        )
        .arg(
            Arg::new("init")
                .long("init")
                .action(ArgAction::SetTrue)
                .help("Create a default .oxid.toml in the current directory"),
        )
        .subcommand(
            Command::new("scan")
                .about("Run scanners and emit a unified report")
                .arg(
                    Arg::new("scan")
                        .long("scan")
                        .short('s')
                        .required(false)
                        .help("Run only one scanner (alias for --only)"),
                )
                .arg(
                    Arg::new("only")
                        .long("only")
                        .value_delimiter(',')
                        .num_args(1..)
                        .help("Run only these scanners (comma separated)"),
                )
                .arg(
                    Arg::new("exclude")
                        .long("exclude")
                        .value_delimiter(',')
                        .num_args(1..)
                        .help("Exclude scanners by name (comma separated)"),
                )
                .arg(
                    Arg::new("format")
                        .long("format")
                        .value_parser(clap::builder::EnumValueParser::<OutputFormat>::new())
                        .default_value("human")
                        .help("Output format"),
                )
                .arg(
                    Arg::new("fail-on")
                        .long("fail-on")
                        .value_parser(clap::builder::EnumValueParser::<CliSeverity>::new())
                        .required(false)
                        .help("Exit with code 1 when findings meet or exceed the threshold"),
                )
                .arg(
                    Arg::new("fix")
                        .long("fix")
                        .action(ArgAction::SetTrue)
                        .help("Apply available cargo-audit remediations with cargo update"),
                )
                .arg(
                    Arg::new("yes")
                        .long("yes")
                        .action(ArgAction::SetTrue)
                        .help("Skip confirmation prompt when used with --fix"),
                ),
        )
        .get_matches();

    if matches.get_flag("version") {
        print_version_info();
        return Ok(());
    }

    if matches.get_flag("init") {
        let project_root = std::env::current_dir()?;
        let path = OxidConfig::write_default(&project_root)?;
        println!("Generated {}", path.display());
        return Ok(());
    }

    let scan_matches = matches.subcommand_matches("scan").unwrap_or(&matches);
    run_scan(scan_matches)
}

fn run_scan(matches: &ArgMatches) -> Result<()> {
    let config = OxidConfig::load_from_project(Path::new("."))?;
    let known_scanners = scanner_names();
    let selected_scanner = matches
        .get_one::<String>("scan")
        .map(|value| value.to_string());
    let mut only_scanners = matches
        .get_many::<String>("only")
        .map(|values| values.cloned().collect::<Vec<_>>())
        .unwrap_or_else(|| config.scanners.only.clone());
    let mut excluded_scanners = matches
        .get_many::<String>("exclude")
        .map(|values| values.cloned().collect::<Vec<_>>())
        .unwrap_or_else(|| config.scanners.exclude.clone());
    let format = matches
        .get_one::<OutputFormat>("format")
        .cloned()
        .unwrap_or(OutputFormat::Human);
    let fail_on = matches
        .get_one::<CliSeverity>("fail-on")
        .cloned()
        .map(CliSeverity::into_severity)
        .or(config.thresholds.fail_on.clone());
    let apply_fixes = matches.get_flag("fix");
    let assume_yes = matches.get_flag("yes");

    if let Some(scanner_name) = selected_scanner {
        only_scanners.push(scanner_name);
    }
    only_scanners.sort();
    only_scanners.dedup();
    excluded_scanners.sort();
    excluded_scanners.dedup();

    for scanner_name in only_scanners.iter().chain(excluded_scanners.iter()) {
        if !known_scanners.iter().any(|name| name == scanner_name) {
            bail!("unknown scanner requested: {scanner_name}");
        }
    }

    let mut scanners = all_scanners();
    if !only_scanners.is_empty() {
        scanners.retain(|scanner| only_scanners.iter().any(|name| name == scanner.name()));
    }

    if !excluded_scanners.is_empty() {
        scanners.retain(|scanner| !excluded_scanners.iter().any(|name| name == scanner.name()));
    }

    if scanners.is_empty() {
        bail!("no scanners selected after applying --scan/--only/--exclude filters");
    }

    let mut run_result = run_scanners_with_options(
        scanners,
        RunOptions {
            show_progress: true,
        },
    );
    if !config.ignore.finding_ids.is_empty() {
        let ignored = config.ignore.finding_ids.iter().collect::<BTreeSet<_>>();
        run_result
            .findings
            .retain(|finding| !ignored.contains(&finding.id));
    }

    for warning in &run_result.warnings {
        eprintln!("{warning}");
    }

    let rendered = match format {
        OutputFormat::Human => human::render(&run_result.findings),
        OutputFormat::Json => json::render(&run_result.findings)?,
        OutputFormat::Sarif => sarif::render(&run_result.findings)?,
    };
    println!("{rendered}");

    print_scan_timing(&run_result);

    if apply_fixes {
        apply_cargo_audit_fixes(&run_result.findings, assume_yes)?;
    }

    if let Some(severity) = fail_on {
        if has_findings_at_or_above_threshold(&run_result.findings, &severity) {
            std::process::exit(1);
        }
    }

    Ok(())
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum OutputFormat {
    Human,
    Json,
    Sarif,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum CliSeverity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}

impl CliSeverity {
    fn into_severity(self) -> Severity {
        match self {
            Self::Critical => Severity::Critical,
            Self::High => Severity::High,
            Self::Medium => Severity::Medium,
            Self::Low => Severity::Low,
            Self::Info => Severity::Info,
        }
    }
}

fn print_scan_timing(run_result: &oxid::runner::RunResult) {
    eprintln!("Scanner timings:");
    for timing in &run_result.scanner_timings {
        let status = match &timing.status {
            ScannerRunStatus::Completed { finding_count } => {
                format!("ok ({finding_count} findings)")
            }
            ScannerRunStatus::Skipped { reason } => format!("skipped ({reason})"),
            ScannerRunStatus::Failed { reason } => format!("failed ({reason})"),
        };
        eprintln!("- {}: {:.2?} [{}]", timing.scanner, timing.duration, status);
    }
    eprintln!("Total scan time: {:.2?}", run_result.total_duration);
}

fn apply_cargo_audit_fixes(findings: &[Finding], assume_yes: bool) -> Result<()> {
    let mut packages = findings
        .iter()
        .filter(|finding| {
            finding
                .source_scanners
                .iter()
                .any(|scanner| scanner == "cargo-audit")
                && finding.remediation.is_some()
        })
        .filter_map(|finding| finding.package.clone())
        .collect::<Vec<_>>();
    packages.sort();
    packages.dedup();

    if packages.is_empty() {
        eprintln!("No cargo-audit findings with actionable remediations found.");
        return Ok(());
    }

    if !assume_yes && !prompt_for_confirmation(&packages)? {
        eprintln!("Skipped applying fixes.");
        return Ok(());
    }

    for package in &packages {
        let status = ProcessCommand::new("cargo")
            .arg("update")
            .arg("-p")
            .arg(package)
            .status()?;
        if !status.success() {
            eprintln!("cargo update -p {} failed", package);
        }
    }

    Ok(())
}

fn prompt_for_confirmation(packages: &[String]) -> Result<bool> {
    eprintln!("Apply cargo update for the following package(s)?");
    for package in packages {
        eprintln!("- {}", package);
    }
    eprint!("Proceed? [y/N]: ");
    io::stderr().flush()?;

    let mut response = String::new();
    io::stdin().read_line(&mut response)?;
    let normalized = response.trim().to_lowercase();
    Ok(normalized == "y" || normalized == "yes")
}

fn print_version_info() {
    println!("oxid {}", env!("CARGO_PKG_VERSION"));
    for (tool, command, args) in [
        ("cargo", "cargo", vec!["--version"]),
        ("clippy", "cargo", vec!["clippy", "--version"]),
        ("cargo-sbom", "cargo", vec!["sbom", "--version"]),
        ("cargo-deny", "cargo", vec!["deny", "--version"]),
        ("cargo-geiger", "cargo", vec!["geiger", "--version"]),
    ] {
        println!("{tool}: {}", detect_tool_version(command, &args));
    }
    println!("config: {}", OXID_CONFIG_FILE);
}

fn detect_tool_version(command: &str, args: &[&str]) -> String {
    match ProcessCommand::new(command).args(args).output() {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            stdout.lines().next().unwrap_or("detected").to_string()
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.trim().is_empty() {
                "not detected".to_string()
            } else {
                format!("not detected ({})", stderr.trim())
            }
        }
        Err(_) => "not detected".to_string(),
    }
}
