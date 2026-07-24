/** DocModel → plain text renderer. Structure stripped; blocks separated by blank lines. */

import type { DocModel } from '@/types/docModel';

export function renderText(doc: DocModel): string {
  return doc.blocks
    .map((b) => (b.type === 'listItem' ? `- ${b.text}` : b.text))
    .join('\n\n') + '\n';
}
