use std::{env, fs, path::PathBuf};

fn main() {
    let manifest_dir =
        PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("缺少 Cargo 清单目录"));
    let version_path = manifest_dir.join("../version.json");
    println!("cargo:rerun-if-changed={}", version_path.display());

    let version_json = fs::read_to_string(&version_path).expect("无法读取 version.json");
    let version_file: serde_json::Value =
        serde_json::from_str(&version_json).expect("version.json 格式无效");
    let version = version_file
        .get("version")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.trim().is_empty() && *value == value.trim())
        .expect("version.json 缺少有效的 version 字段");
    println!("cargo:rustc-env=CODEX_DESK_VERSION={version}");

    tauri_build::build()
}
