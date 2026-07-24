/** DocModel → Markdown renderer. */

import type { DocModel } from '@/types/docModel';

export function renderMarkdown(doc: DocModel): string {
  const out: string[] = [];
  for (const b of doc.blocks) {
    switch (b.type) {
      case 'heading':
        out.push(`${'#'.repeat(Math.min(b.level, 6))} ${b.text}`);
        break;
      case 'listItem':
        out.push(`- ${b.text}`);
        break;
      case 'paragraph':
        out.push(b.text);
        break;
    }
  }
  return out.join('\n\n') + '\n';
}
