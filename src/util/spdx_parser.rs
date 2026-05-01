use serde::Deserialize;

use crate::error::ScanError;

#[derive(Debug, Deserialize)]
struct SpdxDocument {
    #[serde(default)]
    packages: Vec<SpdxPackage>,
}

#[derive(Debug, Deserialize)]
struct SpdxPackage {
    name: Option<String>,
    #[serde(rename = "versionInfo")]
    version_info: Option<String>,
}

pub fn parse_spdx_packages(spdx_json: &str) -> Result<Vec<(String, String)>, ScanError> {
    let document: SpdxDocument = serde_json::from_str(spdx_json)?;
    let packages = document
        .packages
        .into_iter()
        .filter_map(|pkg| match (pkg.name, pkg.version_info) {
            (Some(name), Some(version)) if !name.is_empty() && !version.is_empty() => {
                Some((name, version))
            }
            _ => None,
        })
        .collect();

    Ok(packages)
}

#[cfg(test)]
mod tests {
    use super::parse_spdx_packages;

    #[test]
    fn parses_packages_from_spdx_json() {
        let json = r#"
        {
            "spdxVersion":"SPDX-2.3",
            "packages":[
                {"name":"serde","versionInfo":"1.0.197"},
                {"name":"reqwest","versionInfo":"0.12.4"}
            ]
        }"#;

        let packages = parse_spdx_packages(json).expect("should parse");
        assert_eq!(
            packages,
            vec![
                ("serde".to_string(), "1.0.197".to_string()),
                ("reqwest".to_string(), "0.12.4".to_string())
            ]
        );
    }

    #[test]
    fn ignores_packages_missing_name_or_version() {
        let json = r#"
        {
            "packages":[
                {"name":"serde"},
                {"versionInfo":"1.0.0"},
                {"name":"tokio","versionInfo":"1.38.0"}
            ]
        }"#;

        let packages = parse_spdx_packages(json).expect("should parse");
        assert_eq!(packages, vec![("tokio".to_string(), "1.38.0".to_string())]);
    }
}
