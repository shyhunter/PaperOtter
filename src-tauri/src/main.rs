// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Collect CLI args: macOS "Open with" passes the file path as an argument.
    let args: Vec<String> = std::env::args().collect();
    let open_file = args.get(1).and_then(|arg| {
        // Only treat as a file path if it looks like an absolute path to a PDF
        if arg.ends_with(".pdf") && std::path::Path::new(arg).is_absolute() {
            Some(arg.clone())
        } else {
            None
        }
    });

    // `--selftest` proves the installed layout can actually run Ghostscript, and
    // exits. It exists so REL-01 can be answered by the CI Windows runner, which
    // already installs the real artifact, instead of requiring a Windows machine
    // nobody has. Checked here rather than treated as a file path above: it is
    // not a PDF, so the filter would drop it silently.
    let selftest = args.iter().any(|a| a == "--selftest");

    tauri_app_lib::run_with_file(open_file, selftest)
}
