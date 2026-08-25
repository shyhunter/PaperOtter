// AppChrome: the strip that is present on every screen.
//
// Theme, About and Buy me a coffee used to live only on the dashboard, so
// reaching any of them meant abandoning whatever tool you were in. They belong
// to the app, not to one screen, so they sit here -- rendered once, above
// everything, opposite the window controls.
import { useCallback, useState } from 'react';
import { FolderOpen, Info } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AboutDialog } from '@/components/AboutDialog';
import { BuyMeACoffeeButton } from '@/components/BuyMeACoffeeButton';
import { useToolContext } from '@/context/ToolContext';
import { t } from '@/i18n';

/** Every format any tool accepts, so the picker never hides a file the app can open. */
const OPEN_FILTERS = [
  { name: 'Documents & Images', extensions: [
    'pdf', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'bmp', 'gif', 'heic', 'heif',
    'docx', 'doc', 'odt', 'epub', 'mobi', 'azw3', 'txt', 'rtf', 'html',
  ] },
];

const ICON_BUTTON =
  'inline-flex items-center justify-center rounded-lg border border-border bg-card p-2 ' +
  'text-muted-foreground transition-colors hover:text-foreground hover:border-primary/50 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

export function AppChrome() {
  const { activeTool, editorFilePath, openEditor, replaceDocument } = useToolContext();
  const [aboutOpen, setAboutOpen] = useState(false);

  // The dashboard is already a file picker -- drag-and-drop, recent folders and
  // its own Open buttons -- so a second one there would just be noise.
  const canReplaceDocument = editorFilePath !== null || activeTool !== null;

  const handleOpen = useCallback(async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const result = await open({ multiple: false, directory: false, filters: OPEN_FILTERS });
    if (typeof result !== 'string') return;

    if (editorFilePath !== null) {
      // Goes through the navigation guard, so unsaved edits are asked about
      // rather than dropped.
      openEditor(result);
      return;
    }

    // Inside a tool, staying in that tool is the whole point of the button.
    // replaceDocument stages the file and bumps the epoch the flows are keyed
    // on, which is what actually makes them pick it up.
    replaceDocument(result);
  }, [editorFilePath, openEditor, replaceDocument]);

  return (
    <>
      <div className="flex flex-none items-center justify-end gap-2 border-b border-border bg-background/95 px-3 py-1.5 backdrop-blur-sm">
        {canReplaceDocument && (
          <button
            type="button"
            onClick={handleOpen}
            className={ICON_BUTTON}
            title={t('chrome.openAnother')}
            aria-label={t('chrome.openAnother')}
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className={ICON_BUTTON}
          title={t('chrome.about')}
          aria-label={t('chrome.about')}
        >
          <Info className="h-4 w-4" />
        </button>
        <BuyMeACoffeeButton />
        <ThemeToggle />
      </div>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}
