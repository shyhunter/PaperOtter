// ToolSidebar: collapsible right sidebar with tool icon strip and expandable panel.
// Collapsed: thin icon strip (~48px). Expanded: icon strip + settings panel (~280px total).
// Clicking an icon expands/toggles that tool's panel. Similar to VS Code activity bar.
import { useState, useMemo } from 'react';
import {
  FileDown,
  RotateCw,
  Hash,
  Stamp,
  Crop,
  LayoutGrid,
  PenTool,
  EyeOff,
  Archive,
  Wrench,
  Lock,
  Unlock,
  PanelRightClose,
  PanelRightOpen,
  type LucideIcon,
} from 'lucide-react';
import type { ToolId } from '@/types/tools';
import { EDITOR_SIDEBAR_TOOLS, TOOL_REGISTRY } from '@/types/tools';
import { ToolSidebarPanel } from './ToolSidebarPanel';

// Map icon names from TOOL_REGISTRY to Lucide components
const ICON_MAP: Record<string, LucideIcon> = {
  FileDown,
  RotateCw,
  Hash,
  Stamp,
  Crop,
  LayoutGrid,
  PenTool,
  EyeOff,
  Archive,
  Wrench,
  Lock,
  Unlock,
};

export function ToolSidebar() {
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const isExpanded = activeTool !== null && !collapsed;

  const tools = useMemo(
    () =>
      EDITOR_SIDEBAR_TOOLS.map((id) => ({
        id,
        def: TOOL_REGISTRY[id],
        Icon: ICON_MAP[TOOL_REGISTRY[id].icon],
      })),
    [],
  );

  function handleIconClick(toolId: ToolId) {
    if (collapsed) {
      setCollapsed(false);
      setActiveTool(toolId);
    } else if (activeTool === toolId) {
      setActiveTool(null); // collapse panel
    } else {
      setActiveTool(toolId);
    }
  }

  return (
    <div className="flex h-full flex-none">
      {/* Expanded panel */}
      {isExpanded && (
        <div className="w-[232px] border-l bg-background overflow-y-auto p-3">
          <ToolSidebarPanel toolId={activeTool} />
        </div>
      )}

      {/* Icon strip */}
      <div className="w-[48px] flex-none border-l bg-muted/30 flex flex-col items-center py-1">
        {tools.map(({ id, def, Icon }) => {
          const isActive = activeTool === id && !collapsed;
          return (
            <button
              key={id}
              onClick={() => handleIconClick(id)}
              title={def.name}
              className={`relative w-10 h-10 flex items-center justify-center rounded-sm transition-colors ${
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {/* Active indicator — left border highlight */}
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
              )}
              {Icon ? <Icon className="h-4 w-4" /> : <span className="text-[10px]">{id}</span>}
            </button>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Collapse/expand toggle */}
        <button
          onClick={() => {
            if (isExpanded) {
              setActiveTool(null);
            } else {
              setCollapsed(!collapsed);
            }
          }}
          title={isExpanded ? 'Close panel' : 'Open panel'}
          className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-sm transition-colors"
        >
          {isExpanded ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
