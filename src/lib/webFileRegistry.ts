// In-memory registry mapping a MediaClip id to the browser File it came from.
// Kept outside the zustand store because File objects aren't JSON-serializable
// and the store's undo/redo history round-trips state through JSON.stringify.
const registry = new Map<string, File>()

export function registerWebFile(clipId: string, file: File): void {
  registry.set(clipId, file)
}

export function getWebFile(clipId: string): File | undefined {
  return registry.get(clipId)
}

export function unregisterWebFile(clipId: string): void {
  registry.delete(clipId)
}
