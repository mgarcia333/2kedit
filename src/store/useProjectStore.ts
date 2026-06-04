import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  ProjectState,
  MediaClip,
  TimelineClip,
  ExportSettings,
  Effect,
  EffectType,
  HistoryEntry,
} from '../types/project'

const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: 'mp4',
  resolution: 'original',
  quality: 18,
  fps: 'original',
  audio: 'aac_320',
  fileName: '2kedit_export.mp4',
  outputFolder: '',
}

interface ProjectStore extends ProjectState {
  // Clips management
  addClip: (clip: MediaClip) => void
  removeClip: (id: string) => void

  // Timeline management
  addToTimeline: (clip: TimelineClip) => void
  removeFromTimeline: (id: string) => void
  updateTimelineClip: (id: string, changes: Partial<TimelineClip>) => void
  moveTimelineClip: (id: string, newStartTime: number) => void
  splitClip: (id: string, splitTime: number) => void
  removeGaps: () => void

  // Effects
  addEffect: (clipId: string, effectType: EffectType) => void
  removeEffect: (clipId: string, effectId: string) => void
  updateEffect: (clipId: string, effectId: string, params: Record<string, number | string | boolean>) => void
  toggleEffect: (clipId: string, effectId: string) => void

  // Playback
  setCurrentTime: (time: number) => void
  setPlaying: (playing: boolean) => void
  setDuration: (duration: number) => void

  // Selection
  setSelectedClipId: (id: string | null) => void

  // Timeline settings
  setTimelineZoom: (zoom: number) => void

  // Export
  setExportSettings: (settings: Partial<ExportSettings>) => void

  // App state
  setFFmpegAvailable: (available: boolean) => void
  setTempDir: (dir: string) => void
  setProjectName: (name: string) => void

  // History
  undo: () => void
  redo: () => void
  saveHistory: (description: string) => void
}

function getEffectLabel(type: EffectType): string {
  const labels: Record<EffectType, string> = {
    blackAndWhite: 'Blanco y Negro',
    filmNoise: 'Ruido de Película',
    slowMotion: 'Cámara Lenta',
    fastMotion: 'Cámara Rápida',
    vignette: 'Viñeta',
    brightness: 'Brillo / Contraste',
    saturation: 'Saturación',
    sepia: 'Sepia',
    lut: 'LUT Cinematográfico',
    blur: 'Desenfoque',
    flipHorizontal: 'Voltear Horizontal',
  }
  return labels[type] || type
}

function getDefaultParams(type: EffectType): Record<string, number | string | boolean> {
  const defaults: Record<EffectType, Record<string, number | string | boolean>> = {
    blackAndWhite: {},
    filmNoise: { intensity: 20 },
    slowMotion: { speed: 0.5 },
    fastMotion: { speed: 2 },
    vignette: { intensity: 0.5 },
    brightness: { brightness: 0, contrast: 1 },
    saturation: { saturation: 1 },
    sepia: {},
    lut: { preset: 'cinematic' },
    blur: { radius: 2 },
    flipHorizontal: {},
  }
  return defaults[type] || {}
}

function computeTimelineDuration(timeline: { video: TimelineClip[]; audio: TimelineClip[] }): number {
  const allClips = [...timeline.video, ...timeline.audio]
  if (allClips.length === 0) return 0
  return Math.max(...allClips.map(c => c.startTime + c.duration))
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  // Initial state
  name: 'Proyecto sin título',
  clips: [],
  timeline: { video: [], audio: [] },
  currentTime: 0,
  duration: 0,
  selectedClipId: null,
  isPlaying: false,
  exportSettings: DEFAULT_EXPORT_SETTINGS,
  timelineZoom: 1,
  history: [],
  historyIndex: -1,
  ffmpegAvailable: false,
  tempDir: '',

  // Clip management
  addClip: (clip) => {
    set(state => ({ clips: [...state.clips, clip] }))
  },

  removeClip: (id) => {
    set(state => ({
      clips: state.clips.filter(c => c.id !== id),
      timeline: {
        video: state.timeline.video.filter(c => c.sourceClipId !== id),
        audio: state.timeline.audio.filter(c => c.sourceClipId !== id),
      },
    }))
  },

  // Timeline management
  addToTimeline: (clip) => {
    get().saveHistory(`Añadir clip al timeline`)
    set(state => {
      const newTimeline = {
        ...state.timeline,
        [clip.track]: [...state.timeline[clip.track], clip],
      }
      return {
        timeline: newTimeline,
        duration: computeTimelineDuration(newTimeline),
      }
    })
  },

  removeFromTimeline: (id) => {
    get().saveHistory('Eliminar clip del timeline')
    set(state => {
      const newTimeline = {
        video: state.timeline.video.filter(c => c.id !== id),
        audio: state.timeline.audio.filter(c => c.id !== id),
      }
      return {
        timeline: newTimeline,
        duration: computeTimelineDuration(newTimeline),
        selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
      }
    })
  },

  updateTimelineClip: (id, changes) => {
    set(state => {
      const updateTrack = (track: TimelineClip[]) =>
        track.map(c => c.id === id ? { ...c, ...changes } : c)
      const newTimeline = {
        video: updateTrack(state.timeline.video),
        audio: updateTrack(state.timeline.audio),
      }
      return {
        timeline: newTimeline,
        duration: computeTimelineDuration(newTimeline),
      }
    })
  },

  moveTimelineClip: (id, newStartTime) => {
    get().saveHistory('Mover clip')
    set(state => {
      const updateTrack = (track: TimelineClip[]) =>
        track.map(c => c.id === id ? { ...c, startTime: Math.max(0, newStartTime) } : c)
      const newTimeline = {
        video: updateTrack(state.timeline.video),
        audio: updateTrack(state.timeline.audio),
      }
      return {
        timeline: newTimeline,
        duration: computeTimelineDuration(newTimeline),
      }
    })
  },

  splitClip: (id, splitTime) => {
    get().saveHistory('Cortar clip')
    set(state => {
      const allClips = [...state.timeline.video, ...state.timeline.audio]
      const clip = allClips.find(c => c.id === id)
      if (!clip) return state

      const splitPos = splitTime - clip.startTime
      if (splitPos <= 0 || splitPos >= clip.duration) return state

      const firstClip: TimelineClip = {
        ...clip,
        duration: splitPos,
      }
      const secondClip: TimelineClip = {
        ...clip,
        id: uuidv4(),
        startTime: splitTime,
        duration: clip.duration - splitPos,
        trimStart: clip.trimStart + splitPos,
      }

      const replaceInTrack = (track: TimelineClip[]) => {
        const idx = track.findIndex(c => c.id === id)
        if (idx === -1) return track
        return [...track.slice(0, idx), firstClip, secondClip, ...track.slice(idx + 1)]
      }

      const newTimeline = {
        video: replaceInTrack(state.timeline.video),
        audio: replaceInTrack(state.timeline.audio),
      }

      return {
        timeline: newTimeline,
        duration: computeTimelineDuration(newTimeline),
      }
    })
  },

  removeGaps: () => {
    get().saveHistory('Eliminar huecos')
    set(state => {
      const sortByStart = (clips: TimelineClip[]) =>
        [...clips].sort((a, b) => a.startTime - b.startTime)

      const removeGapsFromTrack = (clips: TimelineClip[]) => {
        const sorted = sortByStart(clips)
        let cursor = 0
        return sorted.map(clip => {
          const newClip = { ...clip, startTime: cursor }
          cursor += clip.duration
          return newClip
        })
      }

      const newTimeline = {
        video: removeGapsFromTrack(state.timeline.video),
        audio: removeGapsFromTrack(state.timeline.audio),
      }

      return {
        timeline: newTimeline,
        duration: computeTimelineDuration(newTimeline),
      }
    })
  },

  // Effects
  addEffect: (clipId, effectType) => {
    const effect: Effect = {
      id: uuidv4(),
      type: effectType,
      label: getEffectLabel(effectType),
      params: getDefaultParams(effectType),
      enabled: true,
    }
    get().saveHistory(`Añadir efecto: ${effect.label}`)
    get().updateTimelineClip(clipId, {
      effects: [
        ...(get().timeline.video.find(c => c.id === clipId) ||
          get().timeline.audio.find(c => c.id === clipId))?.effects || [],
        effect,
      ],
    })
  },

  removeEffect: (clipId, effectId) => {
    const allClips = [...get().timeline.video, ...get().timeline.audio]
    const clip = allClips.find(c => c.id === clipId)
    if (!clip) return
    get().updateTimelineClip(clipId, {
      effects: clip.effects.filter(e => e.id !== effectId),
    })
  },

  updateEffect: (clipId, effectId, params) => {
    const allClips = [...get().timeline.video, ...get().timeline.audio]
    const clip = allClips.find(c => c.id === clipId)
    if (!clip) return
    get().updateTimelineClip(clipId, {
      effects: clip.effects.map(e => e.id === effectId ? { ...e, params } : e),
    })
  },

  toggleEffect: (clipId, effectId) => {
    const allClips = [...get().timeline.video, ...get().timeline.audio]
    const clip = allClips.find(c => c.id === clipId)
    if (!clip) return
    get().updateTimelineClip(clipId, {
      effects: clip.effects.map(e => e.id === effectId ? { ...e, enabled: !e.enabled } : e),
    })
  },

  // Playback
  setCurrentTime: (time) => set({ currentTime: time }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setDuration: (duration) => set({ duration }),

  // Selection
  setSelectedClipId: (id) => set({ selectedClipId: id }),

  // Timeline settings
  setTimelineZoom: (zoom) => set({ timelineZoom: Math.max(0.1, Math.min(10, zoom)) }),

  // Export
  setExportSettings: (settings) =>
    set(state => ({ exportSettings: { ...state.exportSettings, ...settings } })),

  // App state
  setFFmpegAvailable: (available) => set({ ffmpegAvailable: available }),
  setTempDir: (dir) => set({ tempDir: dir }),
  setProjectName: (name) => set({ name }),

  // History (undo/redo)
  saveHistory: (description) => {
    const state = get()
    const entry: HistoryEntry = {
      clips: JSON.parse(JSON.stringify(state.clips)),
      timeline: JSON.parse(JSON.stringify(state.timeline)),
      description,
    }
    const newHistory = state.history.slice(0, state.historyIndex + 1)
    newHistory.push(entry)
    // Keep max 50 history entries
    if (newHistory.length > 50) newHistory.shift()
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  undo: () => {
    const state = get()
    if (state.historyIndex <= 0) return
    const entry = state.history[state.historyIndex - 1]
    set({
      clips: JSON.parse(JSON.stringify(entry.clips)),
      timeline: JSON.parse(JSON.stringify(entry.timeline)),
      duration: computeTimelineDuration(entry.timeline),
      historyIndex: state.historyIndex - 1,
    })
  },

  redo: () => {
    const state = get()
    if (state.historyIndex >= state.history.length - 1) return
    const entry = state.history[state.historyIndex + 1]
    set({
      clips: JSON.parse(JSON.stringify(entry.clips)),
      timeline: JSON.parse(JSON.stringify(entry.timeline)),
      duration: computeTimelineDuration(entry.timeline),
      historyIndex: state.historyIndex + 1,
    })
  },
}))
