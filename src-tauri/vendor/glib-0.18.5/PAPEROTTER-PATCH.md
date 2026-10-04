# Patched glib 0.18.5

Unmodified `glib` 0.18.5 from crates.io (MIT, gtk-rs/gtk-rs-core), plus one fix:

- `src/variant_iter.rs`, `VariantStrIter::impl_get`: the out-pointer is passed as
  `&mut p` instead of `&p`. This is the upstream fix for RUSTSEC-2024-0429 /
  GHSA-wrw7-89jp-8q8g, shipped in glib 0.19 and 0.20 but never in 0.18.

Why it is here: Tauri 2's Linux GTK3 stack pins glib 0.18, so upgrading is not
possible from this repo. Wired in through `[patch.crates-io]` in `src-tauri/Cargo.toml`.

Remove this directory and the `[patch.crates-io]` entry once `cargo tree -i glib`
shows 0.20 or later.

Check it still matches upstream apart from the fix:
`diff -r ~/.cargo/registry/src/*/glib-0.18.5 src-tauri/vendor/glib-0.18.5`
