import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// ─── Rust static analysis ────────────────────────────────────────────────────
//
// Reads src-tauri/src/lib.rs and verifies security measures are in place.
// These tests prevent regressions in hardening work from Plans 01-03.

describe('Security — Rust static analysis', () => {
  let libRs: string;

  beforeAll(() => {
    libRs = readFileSync(
      path.join(__dirname, '../../../src-tauri/src/lib.rs'),
      'utf-8'
    );
  });

  it('every path-accepting command calls validate_source_path', () => {
    // Commands that accept source_path and must validate it
    const commands = [
      'compress_pdf', 'protect_pdf', 'unlock_pdf', 'convert_pdfa',
      'repair_pdf', 'convert_with_libreoffice', 'convert_with_calibre',
      'convert_with_textutil', 'convert_with_word', 'process_image',
    ];

    for (const cmd of commands) {
      // Find the function body (from fn declaration to next #[tauri::command] or end)
      const fnPattern = new RegExp(
        `fn ${cmd}\\b[\\s\\S]*?(?=#\\[tauri::command\\]|fn run\\(|$)`
      );
      const match = libRs.match(fnPattern);
      expect(match, `Function ${cmd} not found`).toBeTruthy();
      expect(
        match![0],
        `${cmd} does not call validate_source_path`
      ).toContain('validate_source_path');
    }
  });

  it('no subsec_nanos temp file naming remains', () => {
    expect(libRs).not.toContain('subsec_nanos');
  });

  it('Calibre extra_args are validated', () => {
    expect(libRs).toContain('validate_calibre_extra_args');
  });

  it('password redaction function exists', () => {
    expect(libRs).toContain('fn redact_gs_passwords');
  });

  it('startup temp sweep function exists and is called', () => {
    expect(libRs).toContain('fn sweep_papercut_temp_files');
    // Called in setup hook
    expect(libRs).toContain('sweep_papercut_temp_files()');
  });

  it('no println/eprintln/dbg with password variables', () => {
    // Check that no debug output contains password-related content
    const lines = libRs.split('\n');
    for (const line of lines) {
      if (line.match(/println!|eprintln!|dbg!/)) {
        expect(line.toLowerCase()).not.toMatch(/password/);
      }
    }
  });
});

// ─── Tauri config assertions ─────────────────────────────────────────────────

describe('Security — Tauri config', () => {
  it('CSP is configured (not null)', () => {
    const confPath = path.join(__dirname, '../../../src-tauri/tauri.conf.json');
    const conf = JSON.parse(readFileSync(confPath, 'utf-8'));
    expect(conf.app.security.csp).not.toBeNull();
    expect(conf.app.security.csp).toContain("script-src 'self'");
  });

  it('no HTTP permissions in capabilities', () => {
    const capPath = path.join(__dirname, '../../../src-tauri/capabilities/default.json');
    const config = JSON.parse(readFileSync(capPath, 'utf-8'));
    const ids = config.permissions.map((e: string | { identifier: string }) =>
      typeof e === 'string' ? e : e.identifier
    );
    expect(ids.filter((id: string) => id.startsWith('http:'))).toHaveLength(0);
  });
});
