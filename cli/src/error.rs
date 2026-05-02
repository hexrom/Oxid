use thiserror::Error;

#[derive(Debug, Error)]
pub enum ScanError {
    #[error("{scanner} requires {tool}. Install with: {install_hint}")]
    MissingTool {
        scanner: &'static str,
        tool: &'static str,
        install_hint: &'static str,
    },
    #[error("required file missing: {path}")]
    MissingFile { path: String },
    #[error("command failed for {scanner}: {message}")]
    CommandFailed {
        scanner: &'static str,
        message: String,
    },
    #[error("failed to parse scan output: {message}")]
    Parse { message: String },
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("{0}")]
    Other(String),
}
