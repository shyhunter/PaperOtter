import { ArrowLeft } from 'lucide-react';
import { StepBar } from '@/components/StepBar';
import { RecentDirsButton } from '@/components/RecentDirsButton';
import { useToolContext } from '@/context/ToolContext';
import { t } from '@/i18n';

interface ToolHeaderProps {
  currentStep: number;
  onBackToDashboard: () => void;
  /** Recent directories for the global Recent Folder button */
  recentDirs?: string[];
  /** Called when a file is selected from a recent folder */
  onRecentFileSelected?: (filePath: string) => void;
}

export function ToolHeader({ currentStep, onBackToDashboard, recentDirs, onRecentFileSelected }: ToolHeaderProps) {
  const { activeToolDef, jobComplete } = useToolContext();

  if (!activeToolDef) return null;

  return (
    <div>
      {/* Breadcrumb row */}
      <div className="flex items-center gap-2 px-4 py-2 border-b-[3px] border-border bg-background/95 backdrop-blur-sm">
        <button
          type="button"
          data-testid="back-to-dashboard"
          onClick={onBackToDashboard}
          className="inline-flex items-center gap-1.5 border-2 border-border bg-card px-2.5 py-1 [border-radius:11px_4px_12px_5px_/_5px_12px_4px_11px] shadow-[3px_3px_0_var(--border)] text-foreground transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          aria-label={t('pdfEditor.backToDashboard')}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-[clamp(0.75rem,0.9vw,0.9rem)]">{t('pdfEditor.dashboard')}</span>
        </button>
        <span className="text-muted-foreground/50 text-[clamp(0.75rem,0.9vw,0.9rem)]">/</span>
        <span data-testid="current-tool" className="text-[clamp(0.75rem,0.9vw,0.9rem)] text-foreground font-medium">
          {t(activeToolDef.name)}
        </span>
        {/* Recent Folder — right-aligned, always visible */}
        {recentDirs && onRecentFileSelected && (
          <div className="ms-auto">
            {/* The header sits inside a tool, so its picker is that tool's picker. */}
            <RecentDirsButton
              dirs={recentDirs}
              onFileSelected={onRecentFileSelected}
              acceptedFormats={activeToolDef.acceptsFormats}
            />
          </div>
        )}
      </div>

      {/* Adaptive StepBar */}
      <StepBar steps={activeToolDef.steps} current={currentStep} complete={jobComplete} />
    </div>
  );
}
