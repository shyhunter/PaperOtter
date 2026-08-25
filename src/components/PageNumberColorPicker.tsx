import { cn } from '@/lib/utils';
import { COLOR_PRESETS } from '@/lib/pageNumberColors';

interface PageNumberColorPickerProps {
  /** Current colour as #RRGGBB. */
  value: string;
  onChange: (hex: string) => void;
}

/** Shared by the standalone Page Numbers tool and the editor's page-numbers panel,
 * so both offer the same colours and agree on what each one means. */
export function PageNumberColorPicker({ value, onChange }: PageNumberColorPickerProps) {
  // <input type="color"> normalises to lowercase, so compare case-insensitively.
  const selected = value.toLowerCase();

  return (
    <div className="flex items-center gap-1.5">
      {COLOR_PRESETS.map((preset) => {
        const isSelected = preset.hex.toLowerCase() === selected;
        return (
          <button
            key={preset.hex}
            type="button"
            aria-label={preset.label}
            aria-pressed={isSelected}
            title={preset.label}
            onClick={() => onChange(preset.hex)}
            // Every swatch carries a border so White stays visible against a light panel.
            className={cn(
              'h-5 w-5 rounded border border-border transition-shadow',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
            )}
            style={{ backgroundColor: preset.hex }}
          />
        );
      })}

      <input
        type="color"
        aria-label="Custom colour"
        title="Custom colour"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-5 w-7 cursor-pointer rounded border border-border bg-background p-0"
      />
    </div>
  );
}
