import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Info,
  X,
  FileText,
  ImageIcon,
  FileType,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TOOL_REGISTRY } from '@/types/tools';
import type { ToolDefinition, ToolCategory } from '@/types/tools';
import { useToolContext } from '@/context/ToolContext';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { detectFormat, isSupportedFile } from '@/lib/fileValidation';
import type { SupportedFormat } from '@/types/file';
import { RecentDirsButton } from '@/components/RecentDirsButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useRecentDirs } from '@/hooks/useRecentDirs';
import { useFavorites } from '@/hooks/useFavorites';
import { useDependencies } from '@/hooks/useDependencies';
import { AboutDialog } from '@/components/AboutDialog';
import { FeedbackButton } from '@/components/FeedbackButton';

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

interface StagedFile {
  path: string;
  name: string;
  format: SupportedFormat;
}

const FORMAT_ICONS: Record<SupportedFormat, LucideIcon> = {
  pdf: FileText,
  image: ImageIcon,
  document: FileType,
};

const FORMAT_LABELS: Record<SupportedFormat, string> = {
  pdf: 'PDF',
  image: 'Image',
  document: 'Document',
};


function groupByCategory(): Record<ToolCategory, ToolDefinition[]> {
  const groups: Record<ToolCategory, ToolDefinition[]> = { pdf: [], image: [], document: [] };
  for (const tool of Object.values(TOOL_REGISTRY)) {
    groups[tool.category].push(tool);
  }
  return groups;
}


function ToolCard({
  tool,
  onClick,
  isFavorite,
  onToggleFavorite,
  disabled,
  disabledHint,
}: {
  tool: ToolDefinition;
  onClick: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const Icon = ICON_MAP[tool.icon];
  return (
    <div className="relative group/card">
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        title={disabled ? disabledHint : undefined}
        className={`w-full flex flex-col items-center gap-3 border rounded-xl p-5 bg-card text-card-foreground transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm dark:shadow-none ${
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer hover:border-primary/50 hover:shadow-lg hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 dark:hover:shadow-lg dark:hover:shadow-primary/5'
        }`}
      >
        {Icon && <Icon className={`h-7 w-7 transition-transform duration-200 ${disabled ? 'text-muted-foreground' : 'text-primary'}`} />}
        <div className="text-center">
          <h3 className="text-sm font-medium text-foreground">{tool.name}</h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {disabled ? disabledHint : tool.description}
          </p>
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
  isSwapSource,
  swapModeActive,
  onGripClick,
  onSwapTarget,
  onRemove,
  disabled,
  disabledHint,
}: {
  tool: ToolDefinition;
  onClick: () => void;
  index: number;
  isSwapSource: boolean;
  swapModeActive: boolean;
  onGripClick: (index: number) => void;
  onSwapTarget: (index: number) => void;
  onRemove: () => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const Icon = ICON_MAP[tool.icon];
  const isTarget = swapModeActive && !isSwapSource;
  return (
    <div
      className={`relative group/fav transition-all duration-200 ${
        isSwapSource ? 'ring-2 ring-primary scale-95' : ''
      } ${isTarget ? 'ring-1 ring-primary/30 hover:ring-primary hover:scale-[1.02]' : ''}`}
    >
      <button
        type="button"
        onClick={disabled ? undefined : (isTarget ? () => onSwapTarget(index) : onClick)}
        disabled={disabled}
        title={disabled ? disabledHint : undefined}
        className={`w-full flex flex-col items-center gap-3 border rounded-xl p-5 bg-card text-card-foreground transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm dark:shadow-none ${
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : `cursor-pointer hover:border-primary/50 hover:shadow-lg hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 dark:hover:shadow-lg dark:hover:shadow-primary/5 ${isTarget ? 'opacity-50' : ''}`
        }`}
      >
        {Icon && <Icon className={`h-7 w-7 ${disabled ? 'text-muted-foreground' : 'text-primary'}`} />}
        <div className="text-center">
          <h3 className="text-sm font-medium text-foreground">{tool.name}</h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {disabled ? disabledHint : tool.description}
          </p>
        </div>
      </button>
      {/* Reorder grip handle — click to enter swap mode */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onGripClick(index); }}
        className={`absolute top-2 left-2 p-1 rounded transition-all duration-200 cursor-grab z-10 ${
          isSwapSource
            ? 'text-primary opacity-100 bg-primary/10'
            : 'text-muted-foreground/30 opacity-0 group-hover/fav:opacity-100 hover:text-muted-foreground'
        }`}
        title={isSwapSource ? 'Click another card to swap' : 'Click to reorder'}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {/* Swap hint overlay — clickable */}
      {isTarget && (
        <button
          type="button"
          onClick={() => onSwapTarget(index)}
          className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-xl z-10 cursor-pointer"
        >
          <span className="text-xs font-medium text-primary bg-background/80 px-3 py-1 rounded-md">Swap here</span>
        </button>
      )}
      {/* Remove star */}
      {!swapModeActive && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute top-2 right-2 p-1.5 rounded-lg text-yellow-500 opacity-100 hover:text-yellow-600 transition-all duration-200"
          title="Remove from favorites"
        >
          <Star className="h-4 w-4 fill-yellow-500" />
        </button>
      )}
    </div>
  );
}

export function Dashboard() {
  const { selectTool, setPendingFiles } = useToolContext();
  const { dirs: recentDirs } = useRecentDirs();
  const { favorites, toggleFavorite, reorderFavorites, isFavorite } = useFavorites();
  const { isAvailable, getHint } = useDependencies();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('1.0.0-beta.8');

  useEffect(() => {
    import('@tauri-apps/api/app')
      .then((mod) => mod.getVersion())
      .then(setAppVersion)
      .catch(() => {});
  }, []);
  const groups = groupByCategory();

  const [isDragOver, setIsDragOver] = useState(false);
  const [stagedFile, setStagedFile] = useState<StagedFile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Swap-mode state for favorites reordering
  const [swapSourceIndex, setSwapSourceIndex] = useState<number | null>(null);

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

  // Swap-mode handlers for favorite reordering
  // Click grip → enter swap mode (card highlighted), click another card → swap positions
  const handleGripClick = useCallback((index: number) => {
    setSwapSourceIndex((prev) => (prev === index ? null : index));
  }, []);

  const handleSwapTarget = useCallback((toIndex: number) => {
    if (swapSourceIndex !== null && swapSourceIndex !== toIndex) {
      reorderFavorites(swapSourceIndex, toIndex);
    }
    setSwapSourceIndex(null);
  }, [swapSourceIndex, reorderFavorites]);

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

          const filePath = validPaths[0];
          const format = detectFormat(filePath);
          if (!format) return;

          setStagedFile({
            path: filePath,
            name: filePath.split('/').pop() ?? filePath,
            format,
          });
        } else {
          setIsDragOver(false);
        }
      })
      .then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);

  // Dismiss staged file on Escape
  useEffect(() => {
    if (!stagedFile) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStagedFile(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stagedFile]);

  const handleToolClick = useCallback((tool: ToolDefinition) => {
    if (stagedFile && tool.acceptsFormats.includes(stagedFile.format)) {
      setPendingFiles([stagedFile.path]);
      setStagedFile(null);
    }
    selectTool(tool.id);
  }, [stagedFile, selectTool, setPendingFiles]);

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
                  v{appVersion}
                </span>
              </div>
              <p className="text-[clamp(0.8rem,1vw,0.95rem)] text-muted-foreground">
                Your local document toolkit — private, fast, offline.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAboutOpen(true)}
                className="inline-flex items-center justify-center rounded-lg border border-border bg-card p-2 text-muted-foreground transition-colors hover:text-foreground hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title="About Papercut"
              >
                <Info className="h-4 w-4" />
              </button>
              <FeedbackButton />
              <ThemeToggle />
              {/* Recent Folder */}
              {recentDirs.length > 0 && (
                <RecentDirsButton
                dirs={recentDirs}
                onFileSelected={(filePath) => {
                  const format = detectFormat(filePath);
                  if (!format) return;
                  setStagedFile({
                    path: filePath,
                    name: filePath.split('/').pop() ?? filePath,
                    format,
                  });
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

        {/* Staged file banner */}
        {stagedFile && (
          <div className="flex items-center gap-3 border border-primary/30 bg-primary/5 rounded-lg px-4 py-3">
            {(() => { const FormatIcon = FORMAT_ICONS[stagedFile.format]; return <FormatIcon className="h-5 w-5 text-primary flex-shrink-0" />; })()}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{stagedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium mr-1.5">
                  {FORMAT_LABELS[stagedFile.format]}
                </span>
                Ready to process — choose a tool below
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStagedFile(null)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* My Favorites — hidden when searching */}
        {!searchQuery.trim() && favoriteTools.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                My Favorites
              </h2>
              <p className="text-[10px] text-muted-foreground/50">
                Click ⠿ to reorder &middot; Click &#9733; on any tool to add
              </p>
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {favoriteTools.map((tool, idx) => {
                const formatIncompat = stagedFile != null && !tool.acceptsFormats.includes(stagedFile.format);
                return (
                <FavoriteCard
                  key={tool.id}
                  tool={tool}
                  index={idx}
                  onClick={() => handleToolClick(tool)}
                  isSwapSource={swapSourceIndex === idx}
                  swapModeActive={swapSourceIndex !== null}
                  onGripClick={handleGripClick}
                  onSwapTarget={handleSwapTarget}
                  onRemove={() => toggleFavorite(tool.id)}
                  disabled={formatIncompat}
                  disabledHint={
                    formatIncompat
                      ? `Not compatible with ${FORMAT_LABELS[stagedFile!.format]} files`
                      : undefined
                  }
                />
                );
              })}
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
                {tools.map((tool) => {
                  const depMissing = !isAvailable(tool.requiresDependency);
                  const formatIncompat = stagedFile != null && !tool.acceptsFormats.includes(stagedFile.format);
                  const isToolDisabled = depMissing || formatIncompat;
                  return (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      onClick={() => handleToolClick(tool)}
                      isFavorite={isFavorite(tool.id)}
                      onToggleFavorite={() => toggleFavorite(tool.id)}
                      disabled={isToolDisabled}
                      disabledHint={
                        depMissing
                          ? (tool.requiresDependency ? getHint(tool.requiresDependency) : undefined)
                          : formatIncompat
                            ? `Not compatible with ${FORMAT_LABELS[stagedFile!.format]} files`
                            : undefined
                      }
                    />
                  );
                })}
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
            <p className="text-lg font-medium text-foreground">Drop file to get started</p>
          </div>
        </div>
      )}

      {/* About dialog */}
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
