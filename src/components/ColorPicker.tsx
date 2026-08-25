import { cn } from '@/lib/utils';
import { COLOR_PRESETS } from '@/lib/colorPresets';
import { t } from '@/i18n';

interface ColorPickerProps {
  /** Current colour as #RRGGBB. */
  value: string;
  onChange: (hex: string) => void;
}

/**
 * The one colour control, shared by every feature where the user picks a colour:
 * page numbers (standalone and editor panel), watermarks (both), and text.
 *
 * A single component rather than a shared list alone, so the features cannot
 * drift back apart in how a colour is chosen -- only in what they do with it.
 */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  // <input type="color"> normalises to lowercase, so compare case-insensitively.
  const selected = value.toLowerCase();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
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
        aria-label={t('colorPicker.customColour')}
        title={t('colorPicker.customColour')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-5 w-7 cursor-pointer rounded border border-border bg-background p-0"
      />
    </div>
  );
}
