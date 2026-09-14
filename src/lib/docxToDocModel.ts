/**
 * DOCX → DocModel.
 *
 * DOCX is already structured (OOXML), so unlike PDF we don't infer layout — we
 * let mammoth map Word styles to semantic HTML (Heading 1 → <h1>, lists → <li>,
 * etc.) and then fold that HTML into the shared DocModel.
 *
 * `htmlToDocModel` is pure (no DOM, no mammoth) so it runs in both the app and
 * node tests. mammoth is loaded via dynamic import so it only enters the app
 * bundle when a DOCX is actually converted.
 */

import type { Block, DocModel } from '@/types/docModel';

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
};

/**
 * Strip inline tags and decode entities from a block's inner HTML.
 *
 * The two steps are in this order on purpose, and swapping them is a bug that
 * looks like a fix. A document showing the literal text `<b>` encodes it as
 * `&lt;b&gt;`; decode first and the stripper then eats it as markup, losing
 * content the document actually displayed.
 *
 * The consequence is that this returns plain text which may legitimately
 * contain `<` and `>`. It is not HTML-safe and is not meant to be: every
 * consumer that puts it into an HTML context escapes it, which is what
 * renderers/html.ts does and says it does. SEC-01 to SEC-04 in
 * docxToDocModel.fixture.test.ts hold that guarantee end to end, because
 * nothing else would fail if a future renderer forgot to escape.
 *
 * A single stripping pass is enough, which is not obvious. `[^>]+` spans a
 * nested `<`, so the greedy match already swallows `<a<b>c>` whole and no tag
 * can be reassembled by an earlier removal. Looping it was tried and reverted:
 * it provably changed no input.
 */
function toText(inner: string): string {
  return inner
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fold mammoth's block-level HTML (h1–h6, p, li) into a DocModel, in order. */
export function htmlToDocModel(html: string): DocModel {
  const blocks: Block[] = [];
  const re = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const text = toText(m[2]);
    if (!text) continue;
    if (tag === 'li') {
      blocks.push({ type: 'listItem', text, page: 1 });
    } else if (tag === 'p') {
      blocks.push({ type: 'paragraph', text, page: 1 });
    } else {
      blocks.push({ type: 'heading', level: Number(tag[1]), text, page: 1 });
    }
  }
  return { blocks };
}

/** Parse a .docx file's bytes into a DocModel. */
export async function docxBytesToDocModel(docxBytes: Uint8Array): Promise<DocModel> {
  // Browser build avoids Node built-ins in the app bundle; dynamic so it's lazy-loaded.
  const mammoth = await import('mammoth/mammoth.browser.js');
  const buf = docxBytes.buffer.slice(docxBytes.byteOffset, docxBytes.byteOffset + docxBytes.byteLength);
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });
  return htmlToDocModel(html);
}
