use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::ScanError;
use crate::finding::Severity;

pub const OXID_CONFIG_FILE: &str = ".oxid.toml";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OxidConfig {
    #[serde(default)]
    pub scanners: ScannerConfig,
    #[serde(default)]
    pub thresholds: ThresholdConfig,
    #[serde(default)]
    pub ignore: IgnoreConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScannerConfig {
    #[serde(default)]
    pub only: Vec<String>,
    #[serde(default)]
    pub exclude: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ThresholdConfig {
    #[serde(default)]
    pub fail_on: Option<Severity>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IgnoreConfig {
    #[serde(default)]
    pub finding_ids: Vec<String>,
}

impl Default for OxidConfig {
    fn default() -> Self {
        Self {
            scanners: ScannerConfig::default(),
            thresholds: ThresholdConfig { fail_on: None },
            ignore: IgnoreConfig::default(),
        }
    }
}

impl OxidConfig {
    pub fn load_from_project(project_root: &Path) -> Result<Self, ScanError> {
        let path = project_root.join(OXID_CONFIG_FILE);
        if !path.exists() {
            return Ok(Self::default());
        }
        let content = fs::read_to_string(path)?;
        toml::from_str(&content).map_err(|err| ScanError::Parse {
            message: format!("invalid .oxid.toml: {err}"),
        })
    }

    pub fn write_default(project_root: &Path) -> Result<PathBuf, ScanError> {
        let path = project_root.join(OXID_CONFIG_FILE);
        if path.exists() {
            return Ok(path);
        }

        let content = toml::to_string_pretty(&Self::default()).map_err(|err| ScanError::Parse {
            message: format!("failed to render default config: {err}"),
        })?;
        fs::write(&path, content)?;
        Ok(path)
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::{OxidConfig, OXID_CONFIG_FILE};
    use crate::finding::Severity;

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!("oxid-config-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("temp dir should exist");
        path
    }

    #[test]
    fn writes_default_config_file() {
        let dir = temp_dir();
        let path = OxidConfig::write_default(&dir).expect("config write should work");
        assert!(path.ends_with(OXID_CONFIG_FILE));
        assert!(path.exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn loads_existing_config_values() {
        let dir = temp_dir();
        let config_path = dir.join(OXID_CONFIG_FILE);
        fs::write(
            &config_path,
            r#"
                [scanners]
                only = ["cargo-audit"]
                exclude = ["clippy"]
                [thresholds]
                fail_on = "high"
                [ignore]
                finding_ids = ["RUSTSEC-2020-0159"]
            "#,
        )
        .expect("config write should work");

        let config = OxidConfig::load_from_project(&dir).expect("config should parse");
        assert_eq!(config.scanners.only, vec!["cargo-audit".to_string()]);
        assert_eq!(config.thresholds.fail_on, Some(Severity::High));
        let _ = fs::remove_dir_all(dir);
    }
}
