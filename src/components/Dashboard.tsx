import {
  FileDown,
  ImageDown,
  Merge,
  Scissors,
  RotateCw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TOOL_REGISTRY } from '@/types/tools';
import type { ToolDefinition, ToolCategory } from '@/types/tools';
import { useToolContext } from '@/context/ToolContext';

const ICON_MAP: Record<string, LucideIcon> = {
  FileDown,
  ImageDown,
  Merge,
  Scissors,
  RotateCw,
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

export function Dashboard() {
  const { selectTool } = useToolContext();
  const groups = groupByCategory();

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
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
    </div>
  );
}
