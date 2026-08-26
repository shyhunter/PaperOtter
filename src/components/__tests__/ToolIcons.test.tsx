import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TOOL_REGISTRY, EDITOR_SIDEBAR_TOOLS } from '@/types/tools';
import * as lucide from 'lucide-react';

/**
 * [UI-02] Every tool resolves to a real icon.
 *
 * TOOL_REGISTRY names its icon as a string, and two separate components map that
 * string to a Lucide component: the dashboard's ICON_MAP and the editor
 * sidebar's. Nothing connects the three, so adding a tool and forgetting a map
 * is silent -- and it was: 'ocr-pdf' declared `ScanText`, which neither map had.
 *
 * The two failure modes are different and both are ugly. The dashboard renders
 * `{Icon && <Icon />}`, so the card simply had no icon, sitting shorter than
 * every card beside it. The sidebar falls back to `<span>{id}</span>`, so the
 * icon strip showed the literal text "ocr-pdf".
 */
describe('tool icons', () => {
  /** The icon names each component actually maps, read from its source. */
  function mappedIcons(file: string): Set<string> {
    const source = readFileSync(file, 'utf8');
    const block = source.match(/ICON_MAP: Record<string, LucideIcon> = \{([\s\S]*?)\n\};/);
    if (!block) throw new Error(`no ICON_MAP found in ${file}`);
    return new Set(block[1].split(',').map((line) => line.trim()).filter(Boolean));
  }

  it('[UI-02a] every registered icon name is a real Lucide export', () => {
    const missing = Object.values(TOOL_REGISTRY)
      .map((tool) => tool.icon)
      .filter((icon) => !(icon in lucide));

    expect(missing, 'icon names with no Lucide component').toEqual([]);
  });

  it('[UI-02b] the dashboard can render every tool icon', () => {
    const mapped = mappedIcons('src/components/Dashboard.tsx');
    const missing = Object.values(TOOL_REGISTRY)
      .filter((tool) => !mapped.has(tool.icon))
      .map((tool) => `${tool.id} needs ${tool.icon}`);

    expect(missing, 'tools that would render with no icon').toEqual([]);
  });

  it('[UI-02c] the editor sidebar can render every tool icon it shows', () => {
    const mapped = mappedIcons('src/components/pdf-editor/ToolSidebar.tsx');
    const missing = EDITOR_SIDEBAR_TOOLS
      .filter((id) => !mapped.has(TOOL_REGISTRY[id].icon))
      .map((id) => `${id} needs ${TOOL_REGISTRY[id].icon}`);

    expect(missing, 'tools that would render their id as text').toEqual([]);
  });
});
