import { ArrowLeft } from 'lucide-react';
import { StepBar } from '@/components/StepBar';
import { RecentDirsButton } from '@/components/RecentDirsButton';
import { useToolContext } from '@/context/ToolContext';

interface ToolHeaderProps {
  currentStep: number;
  onBackToDashboard: () => void;
  /** Recent directories for the global Recent Folder button */
  recentDirs?: string[];
  /** Called when a file is selected from a recent folder */
  onRecentFileSelected?: (filePath: string) => void;
}

export function ToolHeader({ currentStep, onBackToDashboard, recentDirs, onRecentFileSelected }: ToolHeaderProps) {
  const { activeToolDef } = useToolContext();

  if (!activeToolDef) return null;

  return (
    <div>
      {/* Breadcrumb row */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background/95 backdrop-blur-sm">
        <button
          type="button"
          onClick={onBackToDashboard}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to Dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-[clamp(0.75rem,0.9vw,0.9rem)]">Dashboard</span>
        </button>
        <span className="text-muted-foreground/50 text-[clamp(0.75rem,0.9vw,0.9rem)]">/</span>
        <span className="text-[clamp(0.75rem,0.9vw,0.9rem)] text-foreground font-medium">
          {activeToolDef.name}
        </span>
        {/* Recent Folder — right-aligned, always visible */}
        {recentDirs && onRecentFileSelected && (
          <div className="ml-auto">
            <RecentDirsButton dirs={recentDirs} onFileSelected={onRecentFileSelected} />
          </div>
        )}
      </div>

      {/* Adaptive StepBar */}
      <StepBar steps={activeToolDef.steps} current={currentStep} />
    </div>
  );
}
