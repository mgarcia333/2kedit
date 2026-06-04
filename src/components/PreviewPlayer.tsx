import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
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

function toFileUrl(filePath: string): string {
  if (filePath.startsWith('file://')) return filePath
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}

/** Build CSS filter string from active effects (for live preview) */
function buildCSSStyle(effects: Effect[]): {
  filter: string
  transform: string
  playbackRate: number
  vignetteOpacity: number
  filmNoiseOpacity: number
  tvNoiseOpacity: number
} {
  const filters: string[] = []
  let transform = ''
  let playbackRate = 1
  let vignetteOpacity = 0
  let filmNoiseOpacity = 0
  let tvNoiseOpacity = 0

  for (const effect of effects) {
    if (!effect.enabled) continue
    switch (effect.type) {
      case 'blackAndWhite':
        filters.push('grayscale(1)')
        break
      case 'sepia':
        filters.push('sepia(1)')
        break
      case 'filmNoise': {
        const intensity = (effect.params.intensity as number) ?? 20
        filmNoiseOpacity = intensity / 100 // 0 to 1
        break
      }
      case 'noise': {
        const intensity = (effect.params.intensity as number) ?? 50
        tvNoiseOpacity = intensity / 100
        break
      }
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
    }
  }

  return {
    filter: filters.length ? filters.join(' ') : 'none',
    transform,
    playbackRate,
    vignetteOpacity,
    filmNoiseOpacity,
  }
}

function AudioTrackPlayer({ tc }: { tc: TimelineClip }) {
  const store = useProjectStore()
  const audioRef = useRef<HTMLAudioElement>(null)
  const sourceClip = useMemo(() => store.clips.find(c => c.id === tc.sourceClipId), [tc.sourceClipId, store.clips])
  const [src, setSrc] = useState('')

  useEffect(() => {
    if (sourceClip?.filePath) {
      setSrc(toFileUrl(sourceClip.filePath))
    }
  }, [sourceClip])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !src) return

    audio.playbackRate = tc.playbackRate || 1
    audio.volume = Math.min(1, tc.volume)
    audio.muted = tc.muted || store.globalMute

    const localTime = (store.currentTime - tc.startTime) * tc.playbackRate + tc.trimStart
    if (Math.abs(audio.currentTime - localTime) > 0.25) {
      audio.currentTime = Math.max(0, localTime)
    }

    if (store.isPlaying && !store.isBuffering && audio.paused) {
      audio.play().catch(() => {})
    } else if ((!store.isPlaying || store.isBuffering) && !audio.paused) {
      audio.pause()
    }
  }, [store.currentTime, store.isPlaying, store.isBuffering, src, tc, store.globalMute])

  return <audio ref={audioRef} src={src} style={{ display: 'none' }} />
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

  // Find active text clips
  const activeTextClips = useMemo(() => {
    return store.timeline.text.filter(
      tc => store.currentTime >= tc.startTime && store.currentTime < tc.startTime + tc.duration
    )
  }, [store.currentTime, store.timeline.text])

  // Find active audio clips
  const activeAudioClips = useMemo(() => {
    return store.timeline.audio.filter(
      tc => store.currentTime >= tc.startTime && store.currentTime < tc.startTime + tc.duration
    )
  }, [store.currentTime, store.timeline.audio])

  const activeSource = useMemo(() => {
    return activeClip ? store.clips.find(c => c.id === activeClip.sourceClipId) ?? null : null
  }, [activeClip, store.clips])

  // Compute CSS effects for live preview
  const cssStyle = useMemo(() => {
    return activeClip ? buildCSSStyle(activeClip.effects) : { filter: 'none', transform: '', playbackRate: 1, vignetteOpacity: 0, filmNoiseOpacity: 0, tvNoiseOpacity: 0 }
  }, [activeClip?.effects])

  // Apply CSS filters and playback rate whenever they change
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.style.filter = cssStyle.filter
    video.style.transform = cssStyle.transform || ''
    video.playbackRate = activeClip?.playbackRate || 1
  }, [cssStyle, activeClip?.playbackRate])

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

    if (fileUrl !== lastSrcRef.current || video.src !== fileUrl) {
      lastSrcRef.current = fileUrl
      // Calculate where to seek after load
      const localTime = activeClip ? (store.currentTime - activeClip.startTime) * activeClip.playbackRate + activeClip.trimStart : 0
      seekAfterLoadRef.current = localTime

      video.src = fileUrl
      video.load()
    }
  }, [activeSource?.filePath, store.historyIndex]) // Added historyIndex so it reloads src if history changes or load happens

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

  // Sync scrubber position -> video time (when not playing)
  useEffect(() => {
    const video = videoRef.current
    if (!video || store.isPlaying || !activeClip) return
    const localTime = (store.currentTime - activeClip.startTime) * activeClip.playbackRate + activeClip.trimStart
    if (Math.abs(video.currentTime - localTime) > 0.08) {
      video.currentTime = Math.max(0, localTime)
    }
  }, [store.currentTime, activeClip, store.isPlaying])

  // Update store time while video plays
  useEffect(() => {
    if (!store.isPlaying) return

    let lastTime = performance.now()
    let reqId: number

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000
      lastTime = now

      const state = useProjectStore.getState()
      const video = videoRef.current
      
      let newGlobalTime = state.currentTime
      
      // Determine active clip dynamically to avoid stale closures
      const currentActiveClip = state.timeline.video.find(
        tc => state.currentTime >= tc.startTime && state.currentTime < tc.startTime + tc.duration
      )

      if (currentActiveClip && video) {
        // If video is loaded enough to play
        if (video.readyState >= 3) {
          if (state.isBuffering) state.setIsBuffering(false)
          const expectedLocalTime = (newGlobalTime - currentActiveClip.startTime) * currentActiveClip.playbackRate + currentActiveClip.trimStart
          
          // Force sync if drifted too much
          if (Math.abs(video.currentTime - expectedLocalTime) > 0.25) {
            video.currentTime = Math.max(0, expectedLocalTime)
          }

          if (video.paused && store.isPlaying) {
            video.play().catch(() => {})
          }
          
          newGlobalTime += dt
        } else {
          // Video is buffering or loading a new clip. 
          // We do NOT advance newGlobalTime, so the playhead pauses and waits for the video.
          if (!state.isBuffering) state.setIsBuffering(true)
        }
      } else {
        // Empty space on timeline (no video clip)
        if (state.isBuffering) state.setIsBuffering(false)
        newGlobalTime += dt
        if (video && !video.paused) {
          video.pause()
        }
      }

      if (newGlobalTime >= state.duration) {
        state.setCurrentTime(state.duration)
        state.setPlaying(false)
        return
      }

      state.setCurrentTime(newGlobalTime)
      reqId = requestAnimationFrame(loop)
    }

    reqId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(reqId)
  }, [store.isPlaying])

  // Play / pause is now handled by the loop and the state
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeSource) return
    if (!store.isPlaying && !video.paused) {
      video.pause()
    }
  }, [store.isPlaying, activeSource])

  // Mute / volume
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeClip) return
    video.muted = activeClip.muted || store.globalMute
    video.volume = Math.min(1, activeClip.volume)
  }, [activeClip?.muted, activeClip?.volume, store.globalMute])

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (store.duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    
    const updateTime = (clientX: number) => {
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      store.setCurrentTime(ratio * store.duration)
    }
    
    updateTime(e.clientX)
    
    const onMove = (ev: MouseEvent) => updateTime(ev.clientX)
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [store])

  const handleTextMouseDown = (e: React.MouseEvent, tc: any) => {
    e.stopPropagation()
    store.setSelectedClipIds([tc.id])
    
    const wrap = (e.currentTarget as HTMLElement).closest('.preview-canvas-wrap')
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()

    const startX = e.clientX
    const startY = e.clientY
    const startObjX = tc.x
    const startObjY = tc.y

    const onMove = (ev: MouseEvent) => {
      const dx = ((ev.clientX - startX) / rect.width) * 100
      const dy = ((ev.clientY - startY) / rect.height) * 100
      store.updateTimelineClip(tc.id, {
        x: Math.max(0, Math.min(100, startObjX + dx)),
        y: Math.max(0, Math.min(100, startObjY + dy))
      } as any)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleTextResizeMouseDown = (e: React.MouseEvent, tc: any, type: 'corner' | 'right' | 'bottom') => {
    e.stopPropagation()
    store.setSelectedClipIds([tc.id])
    
    const startX = e.clientX
    const startY = e.clientY
    const startSize = tc.fontSize
    const startScaleX = tc.scaleX ?? 1
    const startScaleY = tc.scaleY ?? 1

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      
      if (type === 'corner') {
        const delta = (dx + dy) / 1.5
        store.updateTimelineClip(tc.id, {
          fontSize: Math.max(10, Math.min(400, startSize + delta))
        } as any)
      } else if (type === 'right') {
        // Estirar horizontalmente
        const scaleDelta = dx / 100 // Factor arbitrario de sensibilidad
        store.updateTimelineClip(tc.id, {
          scaleX: Math.max(0.1, Math.min(10, startScaleX + scaleDelta))
        } as any)
      } else if (type === 'bottom') {
        // Estirar verticalmente
        const scaleDelta = dy / 100
        store.updateTimelineClip(tc.id, {
          scaleY: Math.max(0.1, Math.min(10, startScaleY + scaleDelta))
        } as any)
      }
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const togglePlay = () => store.setPlaying(!store.isPlaying)
  const goToStart  = () => store.setCurrentTime(0)
  const goToEnd    = () => store.setCurrentTime(store.duration)
  const framePrev  = () => store.setCurrentTime(Math.max(0, store.currentTime - 1/30))
  const frameNext  = () => store.setCurrentTime(Math.min(store.duration, store.currentTime + 1/30))

  const progress = store.duration > 0 ? (store.currentTime / store.duration) * 100 : 0

  return (
    <div className="preview-player">
      <div 
        className="preview-canvas-wrap" 
        onMouseDown={() => store.setSelectedClipIds([])}
        style={{
          aspectRatio: store.aspectRatio !== 'original' ? store.aspectRatio.replace(':', '/') : undefined,
          background: store.aspectRatio !== 'original' ? '#000' : undefined
        }}
      >
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
            
            {/* Film Noise overlay */}
            {cssStyle.filmNoiseOpacity > 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  opacity: cssStyle.filmNoiseOpacity,
                  mixBlendMode: 'overlay',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                }}
              />
            )}
            
            {/* TV Noise overlay */}
            {cssStyle.tvNoiseOpacity > 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  opacity: cssStyle.tvNoiseOpacity,
                  mixBlendMode: 'screen',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='1' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                }}
              />
            )}
            
            {/* Audio Timeline Tracks */}
            {activeAudioClips.map(tc => (
              <AudioTrackPlayer key={tc.id} tc={tc} />
            ))}
            
            {/* Text Overlays */}
            {activeTextClips.map(tc => (
              <div
                key={tc.id}
                style={{
                  position: 'absolute',
                  left: `${tc.x}%`,
                  top: `${tc.y}%`,
                  transform: `translate(-50%, -50%) scale(${tc.scaleX ?? 1}, ${tc.scaleY ?? 1})`,
                  fontSize: `${tc.fontSize}px`,
                  color: tc.color,
                  fontWeight: 'bold',
                  fontFamily: tc.fontFamily || 'Inter, system-ui, sans-serif',
                  whiteSpace: 'pre-wrap',
                  textAlign: 'center',
                  textShadow: '0px 2px 4px rgba(0,0,0,0.8)',
                  pointerEvents: 'auto',
                  cursor: 'move',
                  zIndex: 10,
                  outline: store.selectedClipIds.includes(tc.id) ? '2px dashed #f97316' : 'none',
                  outlineOffset: 4
                }}
                onMouseDown={e => handleTextMouseDown(e, tc)}
              >
                {tc.text}
                {store.selectedClipIds.includes(tc.id) && (
                  <>
                    {/* General resize */}
                    <div
                      onMouseDown={e => handleTextResizeMouseDown(e, tc, 'corner')}
                      style={{ position: 'absolute', right: -8, bottom: -8, width: 16, height: 16, background: '#f97316', borderRadius: '50%', cursor: 'nwse-resize', border: '2px solid white' }}
                    />
                    {/* Horizontal stretch */}
                    <div
                      onMouseDown={e => handleTextResizeMouseDown(e, tc, 'right')}
                      style={{ position: 'absolute', right: -8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 24, background: '#f97316', borderRadius: 4, cursor: 'ew-resize', border: '2px solid white' }}
                    />
                    {/* Vertical stretch */}
                    <div
                      onMouseDown={e => handleTextResizeMouseDown(e, tc, 'bottom')}
                      style={{ position: 'absolute', left: '50%', bottom: -8, transform: 'translateX(-50%)', width: 24, height: 12, background: '#f97316', borderRadius: 4, cursor: 'ns-resize', border: '2px solid white' }}
                    />
                  </>
                )}
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="preview-placeholder">
              <div className="preview-placeholder-icon" style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 0 }}>
                VID
              </div>
              <div>Sin contenido en el timeline</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Importa un video y arrastralo al timeline</div>
            </div>
            
            {/* Text Overlays can show even if there is no video! */}
            {activeTextClips.map(tc => (
              <div
                key={tc.id}
                style={{
                  position: 'absolute',
                  left: `${tc.x}%`,
                  top: `${tc.y}%`,
                  transform: `translate(-50%, -50%) scale(${tc.scaleX ?? 1}, ${tc.scaleY ?? 1})`,
                  fontSize: `${tc.fontSize}px`,
                  color: tc.color,
                  fontWeight: 'bold',
                  fontFamily: tc.fontFamily || 'Inter, system-ui, sans-serif',
                  whiteSpace: 'pre-wrap',
                  textAlign: 'center',
                  textShadow: '0px 2px 4px rgba(0,0,0,0.8)',
                  pointerEvents: 'auto',
                  cursor: 'move',
                  zIndex: 10,
                  outline: store.selectedClipIds.includes(tc.id) ? '2px dashed #f97316' : 'none',
                  outlineOffset: 4
                }}
                onMouseDown={e => handleTextMouseDown(e, tc)}
              >
                {tc.text}
                {store.selectedClipIds.includes(tc.id) && (
                  <>
                    <div
                      onMouseDown={e => handleTextResizeMouseDown(e, tc, 'corner')}
                      style={{ position: 'absolute', right: -8, bottom: -8, width: 16, height: 16, background: '#f97316', borderRadius: '50%', cursor: 'nwse-resize', border: '2px solid white' }}
                    />
                    <div
                      onMouseDown={e => handleTextResizeMouseDown(e, tc, 'right')}
                      style={{ position: 'absolute', right: -8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 24, background: '#f97316', borderRadius: 4, cursor: 'ew-resize', border: '2px solid white' }}
                    />
                    <div
                      onMouseDown={e => handleTextResizeMouseDown(e, tc, 'bottom')}
                      style={{ position: 'absolute', left: '50%', bottom: -8, transform: 'translateX(-50%)', width: 24, height: 12, background: '#f97316', borderRadius: 4, cursor: 'ns-resize', border: '2px solid white' }}
                    />
                  </>
                )}
              </div>
            ))}
          </>
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

        <div className="preview-progress" onMouseDown={handleProgressMouseDown} title="Arrastra para saltar">
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
