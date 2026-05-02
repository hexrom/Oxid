pub mod cargo_audit;
pub mod cargo_deny;
pub mod cargo_geiger;
pub mod cargo_sbom;
pub mod clippy_lint;

use crate::error::ScanError;
use crate::finding::{Finding, ScannerKind};
use cargo_audit::CargoAuditScanner;
use cargo_deny::CargoDenyScanner;
use cargo_geiger::CargoGeigerScanner;
use cargo_sbom::CargoSbomScanner;
use clippy_lint::ClippyScanner;

pub trait Scanner: Send + Sync {
    fn name(&self) -> &'static str;
    fn kind(&self) -> ScannerKind;
    fn preflight(&self) -> Result<(), ScanError>;
    fn scan(&self) -> Result<Vec<Finding>, ScanError>;
}

pub fn all_scanners() -> Vec<Box<dyn Scanner>> {
    vec![
        Box::new(CargoAuditScanner::default()),
        Box::new(ClippyScanner::default()),
        Box::new(CargoSbomScanner::default()),
        Box::new(CargoDenyScanner::default()),
        Box::new(CargoGeigerScanner::default()),
    ]
}

pub fn scanner_names() -> Vec<String> {
    all_scanners()
        .into_iter()
        .map(|scanner| scanner.name().to_string())
        .collect()
}
