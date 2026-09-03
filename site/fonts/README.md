# Fonts

Committed rather than fetched from `fonts.googleapis.com`. The page's claim is
that Papercut sends nothing anywhere; a stylesheet that hands Google the IP
address of every visitor would undercut that on the download page itself.

Each file is the **latin subset** Google serves for the weights the page uses.
That subset covers every character on the page except `→` (U+2192), which no
Google subset of these families contains — it falls back to a system font here
exactly as it did over the CDN.

`bricolage-var.woff2` and `plex-sans-var.woff2` are variable fonts: one file
serves several `@font-face` weights, and the browser fetches it once.

| File | Family | Weights used | SHA-256 |
|---|---|---|---|
| `bricolage-var.woff2` | Bricolage Grotesque | 500, 700, 800 | `85f55a58a31e61a2e19e8bb25fed503181bf2a6b4cab76c589992cfaac377447` |
| `plex-sans-var.woff2` | IBM Plex Sans | 400, 500, 600 | `056e4e2459f57a0033c8c9c844ff19d6e42ac8602027803d4345823bcc939818` |
| `plex-mono-400.woff2` | IBM Plex Mono | 400 | `c36f509c0a8f9f85f29cb44bc8701d8a9e0b14c499e77a884f789ead7093a7ac` |
| `plex-mono-500.woff2` | IBM Plex Mono | 500 | `a76f53ca6612e7b3828eec2311098675b7f9849ae4169a8bcef6302aec02a6c0` |

## Source URLs

Retrieved 2026-09-03 from the Google Fonts CSS API (`css2`, latin subset):

```
bricolage-var.woff2   https://fonts.gstatic.com/s/bricolagegrotesque/v9/3y9K6as8bTXq_nANBjzKo3IeZx8z6up5BeSl9D4dj_x9PpZBMlGIInHWVyNJ.woff2
plex-sans-var.woff2   https://fonts.gstatic.com/s/ibmplexsans/v23/zYXzKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1syxeKYbSB4Zh.woff2
plex-mono-400.woff2   https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n1i8q131nj-o.woff2
plex-mono-500.woff2   https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3twJwlBFgsAXHNk.woff2
```

Those URLs are content-addressed and change when Google reissues a family, which
is why the hashes above are recorded: they identify the exact bytes served.

## Licences

Both families are under the SIL Open Font License 1.1, which permits
redistribution with the copyright notice retained.

- **Bricolage Grotesque** — Copyright 2022 The Bricolage Grotesque Project
  Authors (<https://github.com/ateliertriay/bricolage>). Designer: Mathieu Triay.
- **IBM Plex Sans / IBM Plex Mono** — Copyright 2017, 2019 IBM Corp.
  (<https://github.com/googlefonts/plex>). Designers: Mike Abbink, Bold Monday.

Full licence text: <https://openfontlicense.org/open-font-license-official-text/>

## Icons

The page's icons are inlined SVGs from [lucide](https://lucide.dev) v0.469.0
(ISC licence), taken from the `lucide-static` package. They were inlined for the
same reason the fonts are committed: the previous version pulled the whole
lucide UMD bundle from jsDelivr on every page load.

Two names in the design predate a lucide rename and are aliases the JS bundle
resolves but the static package does not ship: `file-edit` is `file-pen`, and
`unlock` is `lock-open`.
