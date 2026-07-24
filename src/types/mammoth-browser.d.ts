// mammoth ships types for its main entry but not the prebuilt browser bundle,
// which we import in the app to avoid Node built-ins. Minimal surface we use.
declare module 'mammoth/mammoth.browser.js' {
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
  ): Promise<{ value: string; messages: unknown[] }>;
}
