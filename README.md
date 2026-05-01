# Oxid

[![CI](https://github.com/hexrom/oxid/actions/workflows/ci.yml/badge.svg)](https://github.com/hexrom/oxid/actions/workflows/ci.yml)

`oxid` is a Rust-native security scanner aggregator. It runs multiple Rust ecosystem scanners and emits a single report in human, JSON, or SARIF formats.

## Installation

### Build locally

```bash
cargo build --release
```

### Install from source

```bash
cargo install --path .
```

## Quick start

Run all scanners in the current project:

```bash
oxid scan
```

Run only specific scanners:

```bash
oxid scan --only cargo-audit,cargo-sbom
oxid scan --exclude clippy
```

Machine-readable output:

```bash
oxid scan --format json
oxid scan --format sarif
```

CI-style fail threshold:

```bash
oxid scan --fail-on high
```

Generate default config:

```bash
oxid --init
```

## Scanner support

| Scanner | Kind | Status | Notes |
|---|---|---|---|
| `cargo-audit` | SCA | Implemented | Uses RustSec advisory database |
| `clippy` | SAST | Implemented | Parses JSON diagnostics |
| `cargo-sbom` | SCA | Implemented | Parses SPDX JSON and queries OSV |
| `cargo-deny` | SCA/License | Implemented | Parses advisory and license findings |
| `cargo-geiger` | Unsafe | Implemented | Reports unsafe usage per crate |

## Config file (`.oxid.toml`)

```toml
[scanners]
only = []
exclude = []

[thresholds]
fail_on = "high"

[ignore]
finding_ids = ["RUSTSEC-2020-0159"]
```

CLI flags override config defaults.

## Example output

Place a screenshot at `docs/images/scan-output.png` and reference it here:

`![Oxid scan output](docs/images/scan-output.png)`
