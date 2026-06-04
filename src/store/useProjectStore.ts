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
  addTextClip: (clip: TextClip) => void
  removeFromTimeline: (id: string) => void
  removeTimelineClips: (ids: string[]) => void
  updateTimelineClip: (id: string, changes: Partial<TimelineClip>) => void
  moveTimelineClip: (id: string, newStartTime: number) => void
  moveTimelineClips: (updates: { id: string, newStartTime: number }[]) => void
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
  setIsBuffering: (buffering: boolean) => void
  setDuration: (duration: number) => void

  // Selection
  setSelectedClipIds: (ids: string[]) => void
  toggleSelectedClipId: (id: string, multi: boolean) => void

  // Timeline settings
  setTimelineZoom: (zoom: number) => void

  // Export
  setExportSettings: (settings: Partial<ExportSettings>) => void
  setAspectRatio: (ratio: '16:9' | '9:16' | '1:1' | '4:3' | 'original') => void

  // App state
  setFFmpegAvailable: (available: boolean) => void
  setTempDir: (dir: string) => void
  setProjectName: (name: string) => void
  setGlobalMute: (mute: boolean) => void

  // History
  undo: () => void
  redo: () => void
  saveHistory: (description: string) => void
}

function getEffectLabel(type: EffectType): string {
  const labels: Record<EffectType, string> = {
    blackAndWhite: 'Blanco y Negro',
    filmNoise: 'Granulado de Película',
    noise: 'Ruido Digital',
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
    noise: { intensity: 50 },
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

function computeTimelineDuration(timeline: { video: TimelineClip[]; audio: TimelineClip[]; text: TextClip[] }): number {
  const allClips = [...timeline.video, ...timeline.audio, ...timeline.text]
  if (allClips.length === 0) return 0
  return Math.max(...allClips.map(c => c.startTime + c.duration))
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  // Initial state
  name: 'Proyecto sin título',
  clips: [],
  timeline: { video: [], audio: [], text: [] },
  currentTime: 0,
  duration: 0,
  selectedClipIds: [],
  isPlaying: false,
  isBuffering: false,
  exportSettings: DEFAULT_EXPORT_SETTINGS,
  aspectRatio: 'original',
  timelineZoom: 1,
  history: [{
    clips: [],
    timeline: { video: [], audio: [], text: [] },
    description: 'Estado Inicial',
  }],
  historyIndex: 0,
  ffmpegAvailable: false,
  tempDir: '',
  globalMute: false,

  // Clip management
  addClip: (clip) => {
    set(state => ({ clips: [...state.clips, clip] }))
  },

  removeClip: (id) => {
    set(state => {
      const newTimeline = {
        video: state.timeline.video.filter(c => c.sourceClipId !== id),
        audio: state.timeline.audio.filter(c => c.sourceClipId !== id),
        text: state.timeline.text,
      }
      // IDs of clips that were deleted
      const deletedIds = [
        ...state.timeline.video.filter(c => c.sourceClipId === id).map(c => c.id),
        ...state.timeline.audio.filter(c => c.sourceClipId === id).map(c => c.id)
      ]
      return {
        clips: state.clips.filter(c => c.id !== id),
        timeline: newTimeline,
        duration: computeTimelineDuration(newTimeline),
        selectedClipIds: state.selectedClipIds.filter(cid => !deletedIds.includes(cid)),
      }
    })
  },

  // Timeline management
  addToTimeline: (clip) => {
    set(state => {
      const newTimeline = {
        video: [...state.timeline.video],
        audio: [...state.timeline.audio],
        text: [...state.timeline.text]
      }
      newTimeline[clip.track].push(clip)
      return {
        timeline: newTimeline,
        duration: computeTimelineDuration(newTimeline),
      }
    })
    get().saveHistory('Añadir al timeline')
  },

  addTextClip: (clip) => {
    set(state => {
      const newTimeline = {
        video: [...state.timeline.video],
        audio: [...state.timeline.audio],
        text: [...state.timeline.text, clip]
      }
      return {
        timeline: newTimeline,
        duration: computeTimelineDuration(newTimeline),
      }
    })
    get().saveHistory('Añadir texto')
  },

  removeFromTimeline: (id) => {
    set(state => {
      const newTimeline = {
        video: state.timeline.video.filter(c => c.id !== id),
        audio: state.timeline.audio.filter(c => c.id !== id),
        text: state.timeline.text.filter(c => c.id !== id),
      }
      return {
        timeline: newTimeline,
        duration: computeTimelineDuration(newTimeline),
        selectedClipIds: state.selectedClipIds.filter(cid => cid !== id),
      }
    })
    get().saveHistory('Eliminar clip del timeline')
  },

  removeTimelineClips: (ids) => {
    if (ids.length === 0) return
    set(state => {
      const newTimeline = {
        video: state.timeline.video.filter(c => !ids.includes(c.id)),
        audio: state.timeline.audio.filter(c => !ids.includes(c.id)),
        text: state.timeline.text.filter(c => !ids.includes(c.id)),
      }
      return {
        timeline: newTimeline,
        duration: computeTimelineDuration(newTimeline),
        selectedClipIds: state.selectedClipIds.filter(cid => !ids.includes(cid)),
      }
    })
    get().saveHistory('Eliminar clips del timeline')
  },

  updateTimelineClip: (id, changes) => {
    set(state => {
      const updateTrack = (track: TimelineClip[]) => track.map(c => c.id === id ? { ...c, ...changes } : c)
      const updateTextTrack = (track: TextClip[]) => track.map(c => c.id === id ? { ...c, ...changes } : c)
      const newTimeline = {
        video: updateTrack(state.timeline.video),
        audio: updateTrack(state.timeline.audio),
        text: updateTextTrack(state.timeline.text),
      }
      return {
        timeline: newTimeline,
        duration: computeTimelineDuration(newTimeline),
      }
    })
  },

  moveTimelineClip: (id, newStartTime) => {
    set(state => {
      const updateTrack = (track: TimelineClip[]) => track.map(c => c.id === id ? { ...c, startTime: Math.max(0, newStartTime) } : c)
      const updateTextTrack = (track: TextClip[]) => track.map(c => c.id === id ? { ...c, startTime: Math.max(0, newStartTime) } : c)
      const newTimeline = {
        video: updateTrack(state.timeline.video),
        audio: updateTrack(state.timeline.audio),
        text: updateTextTrack(state.timeline.text),
      }
      return {
        timeline: newTimeline,
        duration: computeTimelineDuration(newTimeline),
      }
    })
  },

  moveTimelineClips: (updates) => {
    if (updates.length === 0) return
    set(state => {
      const updateMap = new Map(updates.map(u => [u.id, Math.max(0, u.newStartTime)]))
      const updateTrack = (track: TimelineClip[]) => track.map(c => updateMap.has(c.id) ? { ...c, startTime: updateMap.get(c.id)! } : c)
      const updateTextTrack = (track: TextClip[]) => track.map(c => updateMap.has(c.id) ? { ...c, startTime: updateMap.get(c.id)! } : c)
      const newTimeline = {
        video: updateTrack(state.timeline.video),
        audio: updateTrack(state.timeline.audio),
        text: updateTextTrack(state.timeline.text),
      }
      return {
        timeline: newTimeline,
        duration: computeTimelineDuration(newTimeline),
      }
    })
  },

  splitClip: (id, splitTime) => {
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
    get().saveHistory('Cortar clip')
  },

  removeGaps: () => {
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
    get().saveHistory('Eliminar huecos')
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
    get().updateTimelineClip(clipId, {
      effects: [
        ...(get().timeline.video.find(c => c.id === clipId) ||
          get().timeline.audio.find(c => c.id === clipId))?.effects || [],
        effect,
      ],
    })
    get().saveHistory(`Añadir efecto: ${effect.label}`)
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
  setCurrentTime: (time) => set(state => ({ currentTime: Math.max(0, Math.min(state.duration, time)) })),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setIsBuffering: (buffering) => set({ isBuffering: buffering }),
  setDuration: (duration) => set({ duration: Math.max(0, duration) }), setSelectedClipIds: (ids) => set({ selectedClipIds: ids }),
  toggleSelectedClipId: (id, multi) => set(state => {
    if (!multi) return { selectedClipIds: [id] }
    if (state.selectedClipIds.includes(id)) {
      return { selectedClipIds: state.selectedClipIds.filter(cid => cid !== id) }
    }
    return { selectedClipIds: [...state.selectedClipIds, id] }
  }),

  // Timeline settings
  setTimelineZoom: (zoom) => set({ timelineZoom: Math.max(0.1, Math.min(10, zoom)) }),

  // Export
  setExportSettings: (settings) => {
    set(state => ({ exportSettings: { ...state.exportSettings, ...settings } }))
  },

  setAspectRatio: (ratio) => {
    set({ aspectRatio: ratio })
    get().saveHistory(`Cambiar resolución a ${ratio}`)
  },

  // App state
  setFFmpegAvailable: (available) => set({ ffmpegAvailable: available }),
  setTempDir: (dir) => set({ tempDir: dir }),
  setProjectName: (name) => set({ name }),
  setGlobalMute: (mute) => set({ globalMute: mute }),

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
    if (state.historyIndex <= 0) return // Ya estamos en el estado más antiguo
    const targetIndex = state.historyIndex - 1
    const entry = state.history[targetIndex]
    set({
      clips: JSON.parse(JSON.stringify(entry.clips)),
      timeline: JSON.parse(JSON.stringify(entry.timeline)),
      duration: computeTimelineDuration(entry.timeline),
      historyIndex: targetIndex,
      selectedClipIds: [],
    })
  },

  redo: () => {
    const state = get()
    if (state.historyIndex >= state.history.length - 1) return
    const targetIndex = state.historyIndex + 1
    const entry = state.history[targetIndex]
    set({
      clips: JSON.parse(JSON.stringify(entry.clips)),
      timeline: JSON.parse(JSON.stringify(entry.timeline)),
      duration: computeTimelineDuration(entry.timeline),
      historyIndex: targetIndex,
      selectedClipIds: [],
    })
  },
}))
