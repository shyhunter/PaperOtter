import type { ToolDefinition } from '@/types/tools';

/** The three platforms Papercut ships for. */
export type Platform = 'macos' | 'windows' | 'linux';

/**
 * Which platform the app is running on.
 *
 * Read from the user agent rather than from Rust, deliberately. The gate is
 * consulted during render, and an async answer means a card appears and then
 * vanishes a frame later -- worse than never showing it. `navigator.userAgent`
 * is synchronous and stable, and `isHeicDecodable` in fileValidation.ts already
 * gates the HEIC input path the same way.
 *
 * Architecture is not derivable this way (every Mac reports "MacIntel"), but no
 * platform requirement needs it; getSystemInfo() in systemInfo.ts asks Rust when
 * the architecture genuinely matters.
 */
export function currentPlatform(): Platform {
  const ua = navigator.userAgent;
  if (ua.includes('Macintosh') || ua.includes('Mac OS')) return 'macos';
  if (ua.includes('Windows')) return 'windows';
  return 'linux';
}

/**
 * Whether this tool can work on the platform it is being rendered on.
 *
 * A tool with no `requiresPlatform` runs everywhere -- the common case, and the
 * reason the field is optional rather than a list every tool must maintain.
 */
export function isToolAvailableHere(tool: ToolDefinition): boolean {
  if (!tool.requiresPlatform) return true;
  return tool.requiresPlatform.includes(currentPlatform());
}

/**
 * Drops the tools this platform cannot run.
 *
 * Hide, do not disable. `requiresDependency` greys a tool out with an install
 * hint because the user can act on it -- installing Ghostscript is a real
 * option. Vision cannot be installed on Windows, so a greyed Make Searchable
 * card would advertise something permanently unattainable.
 */
export function availableTools(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.filter(isToolAvailableHere);
}

/**
 * Which translation key names "reveal this file in the file manager".
 *
 * Finder is a macOS application, and the label was hardcoded to it on every
 * platform -- a Linux user was told to look in Finder. Windows has File
 * Explorer. Linux has no single answer: Nautilus, Dolphin and Thunar are all
 * "Files" to the people using them, so neutral wording is the honest choice
 * rather than naming one and being wrong for the others.
 */
export function revealLabelKey(): 'save.showInFinder' | 'save.showInExplorer' | 'save.showInFiles' {
  switch (currentPlatform()) {
    case 'macos':
      return 'save.showInFinder';
    case 'windows':
      return 'save.showInExplorer';
    default:
      return 'save.showInFiles';
  }
}
