import { useEffect, useRef, useCallback, useMemo } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import type { Effect } from '../types/project'

function formatTimecode(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const f = Math.floor((seconds % 1) * 30)
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}:${f.toString().padStart(2,'0')}`
}

/** Convert a Windows/Unix absolute path to a valid file:/// URL */
function toFileUrl(filePath: string): string {
  // Normalize backslashes → forward slashes
  const normalized = filePath.replace(/\\/g, '/')
  // If it doesn't start with /, prepend one (Windows drive letter C:/...)
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}

/** Build CSS filter string from active effects (for live preview) */
function buildCSSStyle(effects: Effect[]): {
  filter: string
  transform: string
  playbackRate: number
  vignetteOpacity: number
} {
  const filters: string[] = []
  let transform = ''
  let playbackRate = 1
  let vignetteOpacity = 0

  for (const effect of effects) {
    if (!effect.enabled) continue
    switch (effect.type) {
      case 'blackAndWhite':
        filters.push('grayscale(1)')
        break
      case 'sepia':
        filters.push('sepia(1)')
        break
      case 'filmNoise':
        // Film noise can't be done with CSS alone — approximate with contrast
        filters.push('contrast(1.05)')
        break
      case 'brightness': {
        const b = (effect.params.brightness as number) ?? 0
        const c = (effect.params.contrast as number) ?? 1
        // CSS brightness() takes 0..inf where 1 = normal
        filters.push(`brightness(${1 + b})`)
        filters.push(`contrast(${c})`)
        break
      }
      case 'saturation': {
        const s = (effect.params.saturation as number) ?? 1
        filters.push(`saturate(${s})`)
        break
      }
      case 'blur': {
        const r = (effect.params.radius as number) ?? 2
        filters.push(`blur(${r}px)`)
        break
      }
      case 'flipHorizontal':
        transform = 'scaleX(-1)'
        break
      case 'vignette': {
        vignetteOpacity = (effect.params.intensity as number) ?? 0.5
        break
      }
      case 'slowMotion':
        playbackRate = (effect.params.speed as number) ?? 0.5
        break
      case 'fastMotion':
        playbackRate = (effect.params.speed as number) ?? 2
        break
    }
  }

  return {
    filter: filters.length ? filters.join(' ') : 'none',
    transform,
    playbackRate,
    vignetteOpacity,
  }
}

export default function PreviewPlayer() {
  const store = useProjectStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastSrcRef = useRef<string>('')
  const seekAfterLoadRef = useRef<number | null>(null)

  // Find which timeline clip corresponds to current playhead time
  const activeClip = useMemo(() => {
    for (const tc of store.timeline.video) {
      if (store.currentTime >= tc.startTime && store.currentTime < tc.startTime + tc.duration) {
        return tc
      }
    }
    return null
  }, [store.currentTime, store.timeline.video])

  const activeSource = useMemo(() => {
    return activeClip ? store.clips.find(c => c.id === activeClip.sourceClipId) ?? null : null
  }, [activeClip, store.clips])

  // Compute CSS effects for live preview
  const cssStyle = useMemo(() => {
    return activeClip ? buildCSSStyle(activeClip.effects) : { filter: 'none', transform: '', playbackRate: 1, vignetteOpacity: 0 }
  }, [activeClip?.effects])

  // Apply CSS filters and playback rate whenever they change
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.style.filter = cssStyle.filter
    video.style.transform = cssStyle.transform || ''
    video.playbackRate = cssStyle.playbackRate
  }, [cssStyle])

  // Load video src when active source changes
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!activeSource) {
      video.src = ''
      lastSrcRef.current = ''
      return
    }

    const fileUrl = toFileUrl(activeSource.filePath)

    if (fileUrl !== lastSrcRef.current) {
      lastSrcRef.current = fileUrl
      // Calculate where to seek after load
      const localTime = activeClip ? (store.currentTime - activeClip.startTime) + activeClip.trimStart : 0
      seekAfterLoadRef.current = localTime

      video.src = fileUrl
      video.load()
    }
  }, [activeSource?.filePath])

  // Seek after metadata loaded
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onLoaded = () => {
      if (seekAfterLoadRef.current !== null) {
        video.currentTime = seekAfterLoadRef.current
        seekAfterLoadRef.current = null
      }
    }
    video.addEventListener('loadedmetadata', onLoaded)
    return () => video.removeEventListener('loadedmetadata', onLoaded)
  }, [])

  // Sync scrubber position → video time (when not playing)
  useEffect(() => {
    const video = videoRef.current
    if (!video || store.isPlaying || !activeClip) return
    const localTime = (store.currentTime - activeClip.startTime) + activeClip.trimStart
    if (Math.abs(video.currentTime - localTime) > 0.08) {
      video.currentTime = Math.max(0, localTime)
    }
  }, [store.currentTime, activeClip, store.isPlaying])

  // Update store time while video plays
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeClip) return

    const onTimeUpdate = () => {
      if (!store.isPlaying) return
      const globalTime = activeClip.startTime + (video.currentTime - activeClip.trimStart)
      // Clamp to clip boundaries
      if (globalTime >= activeClip.startTime + activeClip.duration) {
        store.setPlaying(false)
        store.setCurrentTime(activeClip.startTime + activeClip.duration)
        return
      }
      store.setCurrentTime(globalTime)
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    return () => video.removeEventListener('timeupdate', onTimeUpdate)
  }, [activeClip, store.isPlaying])

  // Play / pause
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeSource) return
    if (store.isPlaying) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [store.isPlaying, activeSource])

  // Mute / volume
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeClip) return
    video.muted = activeClip.muted
    video.volume = Math.min(1, activeClip.volume)
  }, [activeClip?.muted, activeClip?.volume])

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (store.duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    store.setCurrentTime(ratio * store.duration)
  }, [store])

  const togglePlay = () => store.setPlaying(!store.isPlaying)
  const goToStart  = () => store.setCurrentTime(0)
  const goToEnd    = () => store.setCurrentTime(store.duration)
  const framePrev  = () => store.setCurrentTime(Math.max(0, store.currentTime - 1/30))
  const frameNext  = () => store.setCurrentTime(Math.min(store.duration, store.currentTime + 1/30))

  const progress = store.duration > 0 ? (store.currentTime / store.duration) * 100 : 0

  return (
    <div className="preview-player">
      <div className="preview-canvas-wrap">
        {activeSource ? (
          <>
            <video
              ref={videoRef}
              className="preview-video"
              preload="auto"
              playsInline
            />
            {/* Vignette overlay */}
            {cssStyle.vignetteOpacity > 0 && (
              <div
                className="preview-vignette"
                style={{
                  background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${cssStyle.vignetteOpacity}) 100%)`,
                }}
              />
            )}
          </>
        ) : (
          <div className="preview-placeholder">
            <div className="preview-placeholder-icon" style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 0 }}>
              VID
            </div>
            <div>Sin contenido en el timeline</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Importa un video y arrastralo al timeline</div>
          </div>
        )}
      </div>

      <div className="preview-controls">
        <button className="btn-icon" onClick={goToStart} title="Inicio">|&lt;</button>
        <button className="btn-icon" onClick={framePrev} title="Frame anterior (←)">&lt;</button>
        <button
          className={`btn-icon ${store.isPlaying ? 'active' : ''}`}
          onClick={togglePlay}
          title="Play/Pause (Espacio)"
          style={{ width: 30, height: 30, border: '1px solid var(--border-light)', fontSize: 12 }}
        >
          {store.isPlaying ? '||' : '>'}
        </button>
        <button className="btn-icon" onClick={frameNext} title="Frame siguiente (→)">&gt;</button>
        <button className="btn-icon" onClick={goToEnd} title="Final">&gt;|</button>

        <div className="preview-progress" onClick={handleProgressClick} title="Clic para saltar">
          <div className="preview-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="preview-timecode">
          <span className="timecode">{formatTimecode(store.currentTime)}</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 10, padding: '0 3px' }}>/</span>
          <span className="timecode" style={{ color: 'var(--text-dim)' }}>
            {formatTimecode(store.duration)}
          </span>
        </div>
      </div>
    </div>
  )
}
