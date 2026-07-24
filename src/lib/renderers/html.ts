/** DocModel → HTML renderer. Escapes all extracted text (untrusted PDF/DOCX content). */

import type { Block, DocModel } from '@/types/docModel';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderHtml(doc: DocModel): string {
  const body: string[] = [];
  let list: string[] | null = null;

  const flushList = () => {
    if (list) {
      body.push(`<ul>\n${list.join('\n')}\n</ul>`);
      list = null;
    }
  };

  for (const b of doc.blocks as Block[]) {
    if (b.type === 'listItem') {
      (list ??= []).push(`  <li>${escapeHtml(b.text)}</li>`);
      continue;
    }
    flushList();
    if (b.type === 'heading') {
      const lvl = Math.min(b.level, 6);
      body.push(`<h${lvl}>${escapeHtml(b.text)}</h${lvl}>`);
    } else {
      body.push(`<p>${escapeHtml(b.text)}</p>`);
    }
  }
  flushList();

  return `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
${body.join('\n')}
</body>
</html>
`;
}
