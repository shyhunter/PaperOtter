import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  FileEdit,
  Search,
  Star,
  GripVertical,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TOOL_REGISTRY } from '@/types/tools';
import type { ToolDefinition, ToolCategory, ToolId } from '@/types/tools';
import { useToolContext } from '@/context/ToolContext';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { detectFormat, isSupportedFile } from '@/lib/fileValidation';
import { RecentDirsButton } from '@/components/RecentDirsButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useRecentDirs } from '@/hooks/useRecentDirs';
import { useFavorites } from '@/hooks/useFavorites';

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
  FileEdit,
};

const CATEGORY_LABELS: Record<ToolCategory, string> = {
  pdf: 'PDF Tools',
  image: 'Image Tools',
  document: 'Document Tools',
};

const CATEGORY_ORDER: ToolCategory[] = ['pdf', 'image', 'document'];


function groupByCategory(): Record<ToolCategory, ToolDefinition[]> {
  const groups: Record<ToolCategory, ToolDefinition[]> = { pdf: [], image: [], document: [] };
  for (const tool of Object.values(TOOL_REGISTRY)) {
    groups[tool.category].push(tool);
  }
  return groups;
}

function getCompatibleTools(filePath: string): ToolDefinition[] {
  const format = detectFormat(filePath);
  if (!format) return [];
  return Object.values(TOOL_REGISTRY).filter((tool) =>
    tool.acceptsFormats.includes(format),
  );
}

function ToolCard({
  tool,
  onClick,
  isFavorite,
  onToggleFavorite,
}: {
  tool: ToolDefinition;
  onClick: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  const Icon = ICON_MAP[tool.icon];
  return (
    <div className="relative group/card">
      <button
        type="button"
        onClick={onClick}
        className="w-full flex flex-col items-center gap-3 border rounded-xl p-5 bg-card text-card-foreground cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-lg hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm dark:shadow-none dark:hover:shadow-lg dark:hover:shadow-primary/5"
      >
        {Icon && <Icon className="h-7 w-7 text-primary transition-transform duration-200" />}
        <div className="text-center">
          <h3 className="text-sm font-medium text-foreground">{tool.name}</h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{tool.description}</p>
        </div>
      </button>
      {onToggleFavorite && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all duration-200 ${
            isFavorite
              ? 'text-yellow-500 opacity-100'
              : 'text-muted-foreground/40 opacity-0 group-hover/card:opacity-100 hover:text-yellow-500'
          }`}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star className={`h-4 w-4 ${isFavorite ? 'fill-yellow-500' : ''}`} />
        </button>
      )}
    </div>
  );
}

function FavoriteCard({
  tool,
  onClick,
  index,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  onRemove,
}: {
  tool: ToolDefinition;
  onClick: () => void;
  index: number;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  onRemove: () => void;
}) {
  const Icon = ICON_MAP[tool.icon];
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      className={`relative group/fav transition-all duration-200 ${isDragging ? 'opacity-40 scale-95' : ''}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full flex flex-col items-center gap-3 border rounded-xl p-5 bg-card text-card-foreground cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-lg hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm dark:shadow-none dark:hover:shadow-lg dark:hover:shadow-primary/5"
      >
        {Icon && <Icon className="h-7 w-7 text-primary" />}
        <div className="text-center">
          <h3 className="text-sm font-medium text-foreground">{tool.name}</h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{tool.description}</p>
        </div>
      </button>
      {/* Drag handle */}
      <div className="absolute top-2 left-2 p-1 text-muted-foreground/30 opacity-0 group-hover/fav:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4" />
      </div>
      {/* Remove star */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-2 right-2 p-1.5 rounded-lg text-yellow-500 opacity-100 hover:text-yellow-600 transition-all duration-200"
        title="Remove from favorites"
      >
        <Star className="h-4 w-4 fill-yellow-500" />
      </button>
    </div>
  );
}

export function Dashboard() {
  const { selectTool, setPendingFiles } = useToolContext();
  const { dirs: recentDirs } = useRecentDirs();
  const { favorites, toggleFavorite, reorderFavorites, isFavorite } = useFavorites();
  const groups = groupByCategory();

  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const [compatibleTools, setCompatibleTools] = useState<ToolDefinition[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Drag-and-drop state for favorites reordering
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [, setDragOverIndex] = useState<number | null>(null);
  const internalDragRef = useRef(false);

  // Filter tools by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;

    const q = searchQuery.toLowerCase();
    const result: Record<ToolCategory, ToolDefinition[]> = { pdf: [], image: [], document: [] };
    for (const category of CATEGORY_ORDER) {
      result[category] = groups[category].filter(
        (tool) =>
          tool.name.toLowerCase().includes(q) ||
          tool.description.toLowerCase().includes(q),
      );
    }
    return result;
  }, [groups, searchQuery]);

  const hasSearchResults = CATEGORY_ORDER.some((c) => filteredGroups[c].length > 0);

  // Favorite tools resolved from IDs
  const favoriteTools = useMemo(
    () => favorites.map((id) => TOOL_REGISTRY[id]).filter(Boolean),
    [favorites],
  );

  // Drag handlers for favorite reordering
  const handleFavDragStart = useCallback((e: React.DragEvent, index: number) => {
    internalDragRef.current = true;
    setDragIndex(index);
    // Set transfer data so the browser treats this as a valid drag
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleFavDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleFavDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragIndex !== null && dragIndex !== toIndex) {
      reorderFavorites(dragIndex, toIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
    internalDragRef.current = false;
  }, [dragIndex, reorderFavorites]);

  const handleFavDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
    internalDragRef.current = false;
  }, []);

  // Listen for drag-drop events on the dashboard
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const { type } = event.payload;

        if (type === 'enter' || type === 'over') {
          // Suppress overlay during internal favorites reorder
          if (!internalDragRef.current) {
            setIsDragOver(true);
          }
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
    <div className="flex-1 overflow-y-auto px-6 py-6 relative animate-fade-slide-in">
      <div className="max-w-5xl mx-auto w-full space-y-8">
        {/* Header with search */}
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-baseline gap-2">
                <h1 className="text-[clamp(1.3rem,2.5vw,2rem)] font-bold text-foreground tracking-tight">
                  Papercut
                </h1>
                <span className="text-[clamp(0.6rem,0.8vw,0.75rem)] text-muted-foreground/50 font-medium">
                  v1.0.0-beta.1
                </span>
              </div>
              <p className="text-[clamp(0.8rem,1vw,0.95rem)] text-muted-foreground">
                Your local document toolkit — private, fast, offline.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {/* Recent Folder */}
              {recentDirs.length > 0 && (
                <RecentDirsButton
                dirs={recentDirs}
                onFileSelected={(filePath) => {
                  const tools = getCompatibleTools(filePath);
                  if (tools.length === 1) {
                    setPendingFiles([filePath]);
                    selectTool(tools[0].id);
                  } else if (tools.length > 1) {
                    setDroppedFiles([filePath]);
                    setCompatibleTools(tools);
                  }
                  }}
                />
              )}
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools..."
              className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
          </div>
        </div>

        {/* My Favorites — hidden when searching */}
        {!searchQuery.trim() && favoriteTools.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                My Favorites
              </h2>
              <p className="text-[10px] text-muted-foreground/50">
                Drag to reorder &middot; Click &#9733; on any tool to add
              </p>
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {favoriteTools.map((tool, idx) => (
                <FavoriteCard
                  key={tool.id}
                  tool={tool}
                  index={idx}
                  onClick={() => selectTool(tool.id)}
                  onDragStart={handleFavDragStart}
                  onDragOver={handleFavDragOver}
                  onDrop={handleFavDrop}
                  onDragEnd={handleFavDragEnd}
                  isDragging={dragIndex === idx}
                  onRemove={() => toggleFavorite(tool.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Tool sections by category */}
        {CATEGORY_ORDER.map((category) => {
          const tools = filteredGroups[category];
          if (tools.length === 0) return null;

          return (
            <section key={category} className="space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                {CATEGORY_LABELS[category]}
              </h2>
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
              >
                {tools.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    onClick={() => selectTool(tool.id)}
                    isFavorite={isFavorite(tool.id)}
                    onToggleFavorite={() => toggleFavorite(tool.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {/* No search results */}
        {searchQuery.trim() && !hasSearchResults && (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">
              No tools match &ldquo;{searchQuery}&rdquo;
            </p>
          </div>
        )}
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
