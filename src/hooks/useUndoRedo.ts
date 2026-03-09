import { useCallback, useRef } from 'react';

/**
 * Simple undo/redo stack for editor state.
 * Stores snapshots as JSON strings to avoid reference issues.
 */
export function useUndoRedo<T>(maxHistory = 50) {
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);

  /** Push current state onto undo stack before making a change */
  const pushState = useCallback((state: T) => {
    undoStack.current.push(JSON.stringify(state));
    if (undoStack.current.length > maxHistory) {
      undoStack.current.shift();
    }
    // Any new change clears the redo stack
    redoStack.current = [];
  }, [maxHistory]);

  /** Undo: pop from undo stack, push current to redo, return previous state */
  const undo = useCallback((currentState: T): T | null => {
    const prev = undoStack.current.pop();
    if (!prev) return null;
    redoStack.current.push(JSON.stringify(currentState));
    return JSON.parse(prev);
  }, []);

  /** Redo: pop from redo stack, push current to undo, return next state */
  const redo = useCallback((currentState: T): T | null => {
    const next = redoStack.current.pop();
    if (!next) return null;
    undoStack.current.push(JSON.stringify(currentState));
    return JSON.parse(next);
  }, []);

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  return { pushState, undo, redo, canUndo, canRedo };
}
