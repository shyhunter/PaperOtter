import { useState, useEffect, useCallback } from 'react';
import {
  FileDown,
  ImageDown,
  Merge,
  Scissors,
  RotateCw,
  FileImage,
  FilePlus2,
  Lock,
  Unlock,
  ArrowLeftRight,
  Hash,
  Stamp,
  Crop,
  LayoutGrid,
  PenTool,
  EyeOff,
  Archive,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TOOL_REGISTRY } from '@/types/tools';
import type { ToolDefinition, ToolCategory, ToolId } from '@/types/tools';
import { useToolContext } from '@/context/ToolContext';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { detectFormat } from '@/lib/fileValidation';
import { isSupportedFile } from '@/lib/fileValidation';

const ICON_MAP: Record<string, LucideIcon> = {
  FileDown,
  ImageDown,
  Merge,
  Scissors,
  RotateCw,
  FileImage,
  FilePlus2,
  Lock,
  Unlock,
  ArrowLeftRight,
  Hash,
  Stamp,
  Crop,
  LayoutGrid,
  PenTool,
  EyeOff,
  Archive,
  Wrench,
};

const CATEGORY_LABELS: Record<ToolCategory, string> = {
  pdf: 'PDF Tools',
  image: 'Image Tools',
};

const CATEGORY_ORDER: ToolCategory[] = ['pdf', 'image'];

function groupByCategory(): Record<ToolCategory, ToolDefinition[]> {
  const groups: Record<ToolCategory, ToolDefinition[]> = { pdf: [], image: [] };
  for (const tool of Object.values(TOOL_REGISTRY)) {
    groups[tool.category].push(tool);
  }
  return groups;
}

function getCompatibleTools(filePath: string): ToolDefinition[] {
  const format = detectFormat(filePath);
  if (!format) return [];
  // format is 'pdf' or 'image' — match against acceptsFormats
  return Object.values(TOOL_REGISTRY).filter((tool) =>
    tool.acceptsFormats.includes(format),
  );
}

export function Dashboard() {
  const { selectTool, setPendingFiles } = useToolContext();
  const groups = groupByCategory();

  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const [compatibleTools, setCompatibleTools] = useState<ToolDefinition[]>([]);

  // Listen for drag-drop events on the dashboard
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const { type } = event.payload;

        if (type === 'enter' || type === 'over') {
          setIsDragOver(true);
        } else if (type === 'drop') {
          setIsDragOver(false);
          const paths = (event.payload as { paths?: string[] }).paths ?? [];
          const validPaths = paths.filter((p) => isSupportedFile(p));
          if (validPaths.length === 0) return;

          let tools = getCompatibleTools(validPaths[0]);
          if (validPaths.length > 1) {
            tools = tools.filter((t) => t.acceptsMultipleFiles);
          }
          if (tools.length > 0) {
            setDroppedFiles(validPaths);
            setCompatibleTools(tools);
          }
        } else {
          // leave or cancelled
          setIsDragOver(false);
        }
      })
      .then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);

  // Dismiss tool picker on Escape
  useEffect(() => {
    if (droppedFiles.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDroppedFiles([]);
        setCompatibleTools([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [droppedFiles]);

  const handleToolSelect = useCallback((toolId: ToolId) => {
    if (droppedFiles.length > 0) {
      setPendingFiles(droppedFiles);
    }
    setDroppedFiles([]);
    setCompatibleTools([]);
    selectTool(toolId);
  }, [droppedFiles, selectTool, setPendingFiles]);

  const handleDismissPicker = useCallback(() => {
    setDroppedFiles([]);
    setCompatibleTools([]);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 relative">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-[clamp(1.5rem,3vw,2.5rem)] font-bold text-foreground tracking-tight">
            Papercut
          </h1>
          <p className="text-[clamp(0.85rem,1.2vw,1.1rem)] text-muted-foreground">
            Your local document toolkit — private, fast, offline.
          </p>
        </div>

        {/* Tool sections by category */}
        {CATEGORY_ORDER.map((category) => {
          const tools = groups[category];
          if (tools.length === 0) return null;

          return (
            <section key={category} className="space-y-3">
              <h2 className="text-[clamp(0.9rem,1.1vw,1.15rem)] font-semibold text-foreground">
                {CATEGORY_LABELS[category]}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {tools.map((tool) => {
                  const Icon = ICON_MAP[tool.icon];
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => selectTool(tool.id)}
                      className="flex flex-col items-center gap-3 border rounded-xl p-6 bg-card text-card-foreground hover:border-primary/50 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {Icon && (
                        <Icon className="h-8 w-8 text-primary" />
                      )}
                      <div className="text-center">
                        <h3 className="text-sm font-medium text-foreground">{tool.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{tool.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-primary/5 border-2 border-dashed border-primary/40 rounded-xl flex items-center justify-center z-40 pointer-events-none">
          <div className="bg-background/90 backdrop-blur-sm rounded-lg px-6 py-4 shadow-lg">
            <p className="text-lg font-medium text-foreground">Drop to choose a tool</p>
          </div>
        </div>
      )}

      {/* Tool picker overlay */}
      {droppedFiles.length > 0 && compatibleTools.length > 0 && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={handleDismissPicker}
          onKeyDown={(e) => { if (e.key === 'Escape') handleDismissPicker(); }}
          role="dialog"
          aria-modal="true"
          aria-label="Choose a tool for the dropped file"
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="text-center space-y-1">
              <h2 className="text-lg font-semibold text-foreground">What do you want to do?</h2>
              <p className="text-sm text-muted-foreground truncate">
                {droppedFiles.length === 1
                  ? (droppedFiles[0].split('/').pop() ?? droppedFiles[0])
                  : `${droppedFiles.length} files selected`}
              </p>
            </div>

            <div className="space-y-2">
              {compatibleTools.map((tool) => {
                const Icon = ICON_MAP[tool.icon];
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => handleToolSelect(tool.id)}
                    className="w-full flex items-center gap-3 border rounded-lg px-4 py-3 bg-background hover:border-primary/50 hover:bg-accent transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {Icon && <Icon className="h-5 w-5 text-primary flex-shrink-0" />}
                    <div>
                      <p className="text-sm font-medium text-foreground">{tool.name}</p>
                      <p className="text-xs text-muted-foreground">{tool.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleDismissPicker}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
