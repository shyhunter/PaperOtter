export function getCurrentWindow() {
  return {
    onCloseRequested: async (_cb: unknown) => () => {},
    destroy: async () => {}, close: async () => {},
    setTitle: async () => {}, isMaximized: async () => false,
  };
}
