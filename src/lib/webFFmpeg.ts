import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL, fetchFile } from '@ffmpeg/util'

// Pinned so the CDN URLs stay valid; bump deliberately, ffmpeg-core is a separate
// WASM binary from the @ffmpeg/ffmpeg JS package.
const CORE_VERSION = '0.12.6'
// Must be the ESM build: @ffmpeg/ffmpeg's worker runs as a module worker, so its
// fallback loader does `import()` on this URL, which only works for ESM output.
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`

let instance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null
let progressCallback: ((progress: number) => void) | null = null

export function setFFmpegProgressCallback(cb: ((progress: number) => void) | null): void {
  progressCallback = cb
}

export async function loadFFmpeg(onLog?: (message: string) => void): Promise<FFmpeg> {
  if (instance) return instance
  if (!loadPromise) {
    loadPromise = (async () => {
      const ffmpeg = new FFmpeg()
      ffmpeg.on('log', ({ message }) => onLog?.(message))
      ffmpeg.on('progress', ({ progress }) => progressCallback?.(Math.max(0, Math.min(1, progress))))
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      instance = ffmpeg
      return ffmpeg
    })().catch(err => {
      loadPromise = null
      throw err
    })
  }
  return loadPromise
}

export function isFFmpegLoaded(): boolean {
  return instance !== null
}

/** Kills the worker. A later loadFFmpeg() call will spin up (and download) a fresh one. */
export function terminateFFmpeg(): void {
  instance?.terminate()
  instance = null
  loadPromise = null
}

export { fetchFile }
