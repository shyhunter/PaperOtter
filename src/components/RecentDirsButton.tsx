import { Clock } from 'lucide-react';
import { open } from '@/lib/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { extensionsForFormats } from '@/lib/fileValidation';
import type { SupportedFormat } from '@/types/file';
import { t } from '@/i18n';

interface RecentDirButtonProps {
  dirs: string[];
  onFileSelected: (filePath: string) => void;
  disabled?: boolean;
  /**
   * What the open tool works on. This sits beside the Open button on the same
   * screen, so a wider list here would just reopen the door the picker closed.
   */
  acceptedFormats?: readonly SupportedFormat[];
}

async function openFromDir(dir: string, formats: readonly SupportedFormat[]): Promise<string | null> {
  const result = await open({
    multiple: false,
    directory: false,
    defaultPath: dir,
    filters: [{ name: t('filter.supportedFiles'), extensions: extensionsForFormats(formats) }],
  });
  return typeof result === 'string' ? result : null;
}

export function RecentDirsButton({
  dirs,
  onFileSelected,
  disabled,
  acceptedFormats = ['pdf', 'image'],
}: RecentDirButtonProps) {
  if (dirs.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          aria-label={t('recentDirs.recentFolders')}
        >
          <Clock className="h-3.5 w-3.5" />
          <span className="text-xs">{t('recentDirsButton.recent')}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1" align="start">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{t('recentDirsButton.recentFolders')}</p>
        <div className="space-y-0.5">
          {dirs.map((dir) => {
            // Show only the last path segment as the label, full path as tooltip
            const label = dir.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? dir;
            return (
              <button
                key={dir}
                title={dir}
                onClick={async () => {
                  const filePath = await openFromDir(dir, acceptedFormats);
                  if (filePath) onFileSelected(filePath);
                }}
                className={cn(
                  'w-full text-start px-2 py-1.5 rounded-sm text-sm',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  'truncate',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
