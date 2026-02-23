import { Clock } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RecentDirButtonProps {
  dirs: string[];
  onFileSelected: (filePath: string) => void;
  disabled?: boolean;
}

async function openFromDir(dir: string): Promise<string | null> {
  const result = await open({
    multiple: false,
    directory: false,
    defaultPath: dir,
    filters: [{ name: 'Supported Files', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'] }],
  });
  return typeof result === 'string' ? result : null;
}

export function RecentDirsButton({ dirs, onFileSelected, disabled }: RecentDirButtonProps) {
  if (dirs.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          aria-label="Recent folders"
        >
          <Clock className="h-3.5 w-3.5" />
          <span className="text-xs">Recent</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1" align="start">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Recent folders</p>
        <div className="space-y-0.5">
          {dirs.map((dir) => {
            // Show only the last path segment as the label, full path as tooltip
            const label = dir.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? dir;
            return (
              <button
                key={dir}
                title={dir}
                onClick={async () => {
                  const filePath = await openFromDir(dir);
                  if (filePath) onFileSelected(filePath);
                }}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded-sm text-sm',
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
