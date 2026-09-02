//! A one-shot check that the *installed* app can actually run Ghostscript.
//!
//! REL-01 exists because five tools ride on Ghostscript and nobody has ever
//! confirmed it resolves on Windows in the installed layout — where `gs.exe`
//! sits beside `Papercut.exe` and `gsdll64.dll` lands under `resources\`. The
//! gate item asked for a person with a Windows machine. There is no Windows
//! machine, and the check does not actually need one: CI already installs the
//! real artifact on a real Windows runner, it just has no way to ask the app a
//! question.
//!
//! This is the question. `Papercut.exe --selftest` resolves `resource_dir()`
//! exactly as the app does, runs the bundled Ghostscript through the same
//! sidecar path and the same `with_windows_dll_path` wrapper, makes it produce
//! a real PDF, and exits non-zero if any of that fails.
//!
//! **What it does not cover:** the webview. If Ghostscript resolves but the UI
//! never reaches it, this passes and the app is still broken. That is a smaller
//! and different risk than the one REL-01 was written for, and worth stating
//! rather than papering over.
use tauri::Manager;

/// Exit code when every check passes.
pub const OK: i32 = 0;
/// Exit code when any check fails. Distinct from a panic so CI can tell them apart.
pub const FAILED: i32 = 1;

fn pass(what: &str, detail: &str) {
    println!("PASS  {what}: {detail}");
}

fn fail(what: &str, detail: &str) {
    println!("FAIL  {what}: {detail}");
}

/// Run every check. Prints a line per check and returns the process exit code.
pub async fn run(app: &tauri::AppHandle) -> i32 {
    println!("Papercut self-test");
    println!("platform: {}", std::env::consts::OS);
    let mut ok = true;

    // 1. The resource directory resolves at all.
    //
    // On Windows this is where `gsdll64.dll` is expected to be, and
    // `with_windows_dll_path` prepends it to PATH for the sidecar. If it does
    // not resolve, Ghostscript cannot load its DLL and every compress fails.
    match app.path().resource_dir() {
        Ok(dir) => {
            pass("resource_dir", &dir.display().to_string());
            if cfg!(target_os = "windows") {
                let dll = dir.join("gsdll64.dll");
                if dll.exists() {
                    pass("gsdll64.dll", &dll.display().to_string());
                } else {
                    // Not fatal on its own: a statically linked gs would not
                    // need it. The version probe below is the real verdict.
                    println!("NOTE  gsdll64.dll not found at {}", dll.display());
                }
            }
        }
        Err(e) => {
            fail("resource_dir", &e.to_string());
            ok = false;
        }
    }

    // 2. The bundled Ghostscript starts and reports a version.
    //
    // Through the sidecar and the same PATH wrapper the app uses, so a
    // resolution bug shows up here rather than only in the running UI.
    match crate::spawn_gs_version(app).await {
        Ok(version) => pass("ghostscript --version", version.trim()),
        Err(e) => {
            fail("ghostscript --version", &e);
            ok = false;
        }
    }

    // 3. It can actually write a PDF.
    //
    // A version string proves the binary loads; it does not prove `pdfwrite`
    // works, which is the device every compress depends on. This asks for a
    // one-page document with no input file, then checks the bytes really are a
    // PDF rather than an empty file left behind by a failed run.
    let out = std::env::temp_dir().join("papercut-selftest.pdf");
    let _ = std::fs::remove_file(&out);
    match crate::spawn_gs_pdfwrite(app, &out).await {
        Ok(()) => match std::fs::read(&out) {
            Ok(bytes) if bytes.starts_with(b"%PDF") => {
                pass("ghostscript pdfwrite", &format!("{} bytes", bytes.len()));
            }
            Ok(bytes) => {
                fail("ghostscript pdfwrite", &format!("wrote {} bytes, not a PDF", bytes.len()));
                ok = false;
            }
            Err(e) => {
                fail("ghostscript pdfwrite", &format!("no output file: {e}"));
                ok = false;
            }
        },
        Err(e) => {
            fail("ghostscript pdfwrite", &e);
            ok = false;
        }
    }
    let _ = std::fs::remove_file(&out);

    println!("{}", if ok { "self-test PASSED" } else { "self-test FAILED" });
    if ok { OK } else { FAILED }
}
