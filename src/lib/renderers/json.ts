/** DocModel → JSON renderer. Emits the structured document tree for programmatic use. */

import type { DocModel } from '@/types/docModel';

export function renderJson(doc: DocModel): string {
  return JSON.stringify({ blocks: doc.blocks }, null, 2) + '\n';
}
