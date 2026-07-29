export type EffectType =
  | 'blackAndWhite'
  | 'filmNoise'
  | 'noise'
  | 'vignette'
  | 'brightness'
  | 'saturation'
  | 'sepia'
  | 'lut'
  | 'blur'
  | 'flipHorizontal'

export interface Effect {
  id: string
  type: EffectType
  label: string
  params: Record<string, number | string | boolean>
  enabled: boolean
}

export type MediaType = 'video' | 'audio'

export interface MediaClip {
  id: string
  /** Electron: absolute OS path. Web: virtual ffmpeg.wasm filename (e.g. "abc123.mp4"). */
  filePath: string
  fileName: string
  type: MediaType
  duration: number
  width?: number
  height?: number
  fps?: number
  thumbnailPath?: string
  format?: string
  bitrate?: number
  audioCodec?: string
  videoCodec?: string
  sampleRate?: number
  channels?: number
  /** Web only: blob: URL used as <video>/<audio> src for preview. */
  previewUrl?: string
}

export interface TimelineClip {
  id: string
  sourceClipId: string
  startTime: number     // position on timeline in seconds
  duration: number      // display duration on timeline
  trimStart: number     // trim from start of source clip
  trimEnd: number       // trim from end of source clip
  effects: Effect[]
  volume: number        // 0–2 (0%–200%)
  muted: boolean
  fadeIn: number        // fade in duration in seconds
  fadeOut: number       // fade out duration in seconds
  playbackRate: number  // playback speed (default 1)
  track: 'video' | 'audio'
}

export interface TextClip {
  id: string
  text: string
  startTime: number
  duration: number
  x: number           // percentage 0-100 (from left)
  y: number           // percentage 0-100 (from top)
  fontSize: number    // pixels or logical unit
  color: string       // hex color
  fontFamily?: string // e.g. "Arial", "Impact", "Courier New"
  scaleX?: number
  scaleY?: number
}

export interface ExportSettings {
  format: 'mp4' | 'mov' | 'webm'
  resolution: 'original' | '1080p' | '720p' | '480p'
  quality: 18 | 23 | 28    // CRF
  fps: 'original' | 24 | 30 | 60
  audio: 'aac_320' | 'mp3_192' | 'none'
  fileName: string
  outputFolder: string
}

export interface HistoryEntry {
  clips: MediaClip[]
  timeline: {
    video: TimelineClip[]
    audio: TimelineClip[]
    text: TextClip[]
  }
  description: string
}

export interface ProjectState {
  name: string
  clips: MediaClip[]
  timeline: {
    video: TimelineClip[]
    audio: TimelineClip[]
    text: TextClip[]
  }
  currentTime: number
  duration: number
  selectedClipIds: string[]
  isPlaying: boolean
  isBuffering: boolean
  exportSettings: ExportSettings
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | 'original'
  timelineZoom: number
  history: HistoryEntry[]
  historyIndex: number
  ffmpegAvailable: boolean
  tempDir: string
  globalMute: boolean
}

export type ProjectAction =
  | { type: 'ADD_CLIP'; clip: MediaClip }
  | { type: 'REMOVE_CLIP'; id: string }
  | { type: 'ADD_TO_TIMELINE'; clip: TimelineClip }
  | { type: 'REMOVE_FROM_TIMELINE'; id: string; track: 'video' | 'audio' }
  | { type: 'UPDATE_TIMELINE_CLIP'; id: string; changes: Partial<TimelineClip> }
  | { type: 'SET_CURRENT_TIME'; time: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_SELECTED_CLIPS'; ids: string[] }
  | { type: 'SET_TIMELINE_ZOOM'; zoom: number }
  | { type: 'SET_EXPORT_SETTINGS'; settings: Partial<ExportSettings> }
  | { type: 'UNDO' }
  | { type: 'REDO' }

// Electron API types
declare global {
  interface Window {
    electronAPI: {
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
      openFileDialog: () => Promise<string[]>
      saveFileDialog: (name: string) => Promise<string | null>
      openFolderDialog: () => Promise<string | null>
      openMediaFolderDialog: () => Promise<string[]>
      saveProject: (data: string) => Promise<boolean>
      loadProject: () => Promise<string | null>
      openFolder: (folderPath: string) => Promise<void>
      openFile: (filePath: string) => Promise<void>
      probeFile: (filePath: string) => Promise<FFprobeResult>
      runFFmpeg: (args: string[]) => Promise<{ success: boolean; error?: string }>
      cancelFFmpeg: () => Promise<boolean>
      generateThumbnail: (filePath: string, outputPath: string, time?: number) => Promise<boolean>
      checkFFmpeg: () => Promise<{ ffmpeg: boolean; ffprobe: boolean; ffmpegPath: string; ffprobePath: string }>
      getTempDir: () => Promise<string>
      onFFmpegProgress: (callback: (data: string) => void) => () => void
      onFFmpegStdout: (callback: (data: string) => void) => () => void
    }
  }
}

export interface FFprobeStream {
  codec_type: 'video' | 'audio'
  codec_name: string
  width?: number
  height?: number
  r_frame_rate?: string
  duration?: string
  sample_rate?: string
  channels?: number
  bit_rate?: string
  disposition?: {
    attached_pic?: number
  }
}

export interface FFprobeFormat {
  duration: string
  bit_rate: string
  format_name: string
  size: string
}

export interface FFprobeResult {
  streams: FFprobeStream[]
  format: FFprobeFormat
}
