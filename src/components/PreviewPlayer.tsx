import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import type { Effect, MediaClip } from '../types/project'

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

/** Web-imported clips carry a blob: preview URL instead of a real filesystem path. */
function resolveMediaSrc(clip: Pick<MediaClip, 'filePath' | 'previewUrl'>): string {
  return clip.previewUrl ?? toFileUrl(clip.filePath)
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
      setSrc(resolveMediaSrc(sourceClip))
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
  
  // Dual video players for seamless transitions
  const videoA = useRef<HTMLVideoElement>(null)
  const videoB = useRef<HTMLVideoElement>(null)
  
  // Track which timeline clip ID is currently loaded in which player
  const loadedClips = useRef<{ A: string | null, B: string | null }>({ A: null, B: null })
  // Track which player is currently active
  const activePlayerRef = useRef<'A' | 'B' | null>(null)

  // Determine active text/audio clips for rendering
  const activeTextClips = useMemo(() => store.timeline.text.filter(
    tc => store.currentTime >= tc.startTime && store.currentTime < tc.startTime + tc.duration
  ), [store.currentTime, store.timeline.text])

  const activeAudioClips = useMemo(() => store.timeline.audio.filter(
    tc => store.currentTime >= tc.startTime && store.currentTime < tc.startTime + tc.duration
  ), [store.currentTime, store.timeline.audio])

  const activeClip = useMemo(() => store.timeline.video.find(
    tc => store.currentTime >= tc.startTime && store.currentTime < tc.startTime + tc.duration
  ), [store.currentTime, store.timeline.video])

  const activeSource = useMemo(() => {
    return activeClip ? store.clips.find(c => c.id === activeClip.sourceClipId) ?? null : null
  }, [activeClip, store.clips])

  const cssStyle = useMemo(() => {
    return activeClip ? buildCSSStyle(activeClip.effects) : { filter: 'none', transform: '', playbackRate: 1, vignetteOpacity: 0, filmNoiseOpacity: 0, tvNoiseOpacity: 0 }
  }, [activeClip?.effects])

  // Sync players function called on every frame during playback or on scrub
  const syncPlayers = useCallback((globalTime: number) => {
    const state = useProjectStore.getState()
    const activeClip = state.timeline.video.find(tc => globalTime >= tc.startTime && globalTime < tc.startTime + tc.duration)
    const nextClip = state.timeline.video.find(tc => activeClip && tc.startTime >= activeClip.startTime + activeClip.duration)

    let activeId: 'A' | 'B' | null = null
    let activeVideo: HTMLVideoElement | null = null

    if (activeClip) {
      if (loadedClips.current.A === activeClip.id) {
        activeId = 'A'; activeVideo = videoA.current
      } else if (loadedClips.current.B === activeClip.id) {
        activeId = 'B'; activeVideo = videoB.current
      } else {
        const source = state.clips.find(c => c.id === activeClip.sourceClipId)
        if (source) {
          activeId = loadedClips.current.A !== nextClip?.id ? 'A' : 'B'
          activeVideo = activeId === 'A' ? videoA.current : videoB.current
          loadedClips.current[activeId] = activeClip.id
          if (activeVideo) {
            activeVideo.src = resolveMediaSrc(source)
          }
        }
      }
    }

    if (nextClip) {
      const otherId = activeId === 'A' ? 'B' : 'A'
      const otherVideo = otherId === 'A' ? videoA.current : videoB.current
      if (loadedClips.current[otherId] !== nextClip.id) {
        loadedClips.current[otherId] = nextClip.id
        const source = state.clips.find(c => c.id === nextClip.sourceClipId)
        if (otherVideo && source) {
          otherVideo.src = resolveMediaSrc(source)
          otherVideo.currentTime = nextClip.trimStart
          otherVideo.pause()
        }
      }
    }

    if (videoA.current) videoA.current.style.opacity = activeId === 'A' ? '1' : '0'
    if (videoB.current) videoB.current.style.opacity = activeId === 'B' ? '1' : '0'

    activePlayerRef.current = activeId
    return { activeVideo, activeClip }
  }, [])

  // Update store time while video plays
  useEffect(() => {
    if (!store.isPlaying) return

    let lastTime = performance.now()
    let reqId: number

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000
      lastTime = now

      const state = useProjectStore.getState()
      let newGlobalTime = state.currentTime
      
      const { activeVideo, activeClip } = syncPlayers(newGlobalTime)

      if (activeClip && activeVideo) {
        if (activeVideo.readyState >= 3) {
          if (state.isBuffering) state.setIsBuffering(false)
          const expectedLocalTime = (newGlobalTime - activeClip.startTime) * activeClip.playbackRate + activeClip.trimStart
          
          if (Math.abs(activeVideo.currentTime - expectedLocalTime) > 0.25) {
            activeVideo.currentTime = Math.max(0, expectedLocalTime)
          }

          if (activeVideo.paused && state.isPlaying) {
            activeVideo.play().catch(() => {})
          }
          
          newGlobalTime += dt
        } else {
          if (!state.isBuffering) state.setIsBuffering(true)
        }
      } else {
        if (state.isBuffering) state.setIsBuffering(false)
        newGlobalTime += dt
      }

      // Ensure inactive video is paused
      const inactiveVideo = activePlayerRef.current === 'A' ? videoB.current : videoA.current
      if (inactiveVideo && !inactiveVideo.paused) inactiveVideo.pause()

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
  }, [store.isPlaying, syncPlayers])

  // Sync scrubber position when NOT playing
  useEffect(() => {
    if (store.isPlaying) return
    const { activeVideo, activeClip } = syncPlayers(store.currentTime)
    if (activeVideo && activeClip) {
      const expectedLocalTime = (store.currentTime - activeClip.startTime) * activeClip.playbackRate + activeClip.trimStart
      if (Math.abs(activeVideo.currentTime - expectedLocalTime) > 0.08) {
        activeVideo.currentTime = Math.max(0, expectedLocalTime)
      }
    }
  }, [store.currentTime, store.isPlaying, syncPlayers])

  // Stop everything if paused
  useEffect(() => {
    if (!store.isPlaying) {
      if (videoA.current && !videoA.current.paused) videoA.current.pause()
      if (videoB.current && !videoB.current.paused) videoB.current.pause()
    }
  }, [store.isPlaying])

  // Apply CSS filters, volume, and playbackRate
  useEffect(() => {
    const applyEffects = (video: HTMLVideoElement | null, clipId: string | null) => {
      if (!video || !clipId) return
      const clip = store.timeline.video.find(c => c.id === clipId)
      if (!clip) return
      const style = buildCSSStyle(clip.effects)
      video.style.filter = style.filter
      video.style.transform = style.transform || ''
      video.playbackRate = clip.playbackRate || 1
      video.muted = clip.muted || store.globalMute
      video.volume = Math.min(1, clip.volume || 1)
    }
    applyEffects(videoA.current, loadedClips.current.A)
    applyEffects(videoB.current, loadedClips.current.B)
  }) // Runs after every render

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
              ref={videoA}
              className="preview-video"
              preload="auto"
              playsInline
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, transition: 'none' }}
            />
            <video
              ref={videoB}
              className="preview-video"
              preload="auto"
              playsInline
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, transition: 'none' }}
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
            <div className="preview-hero">
              <div className="preview-hero-content">
                <div className="preview-hero-kicker">2KEDIT // EDITOR DE VIDEO</div>
                <h1 className="preview-hero-title">EDITA VIDEO<br />EN TU NAVEGADOR</h1>
                <p className="preview-hero-desc">
                  Corta, aplica efectos cinematograficos y exporta tu video. Sin instalar nada — todo corre aqui mismo.
                </p>
                <div className="preview-hero-steps">
                  <div className="preview-hero-step">
                    <span className="preview-hero-step-num">01</span>
                    <div>
                      <div className="preview-hero-step-title">Importa</div>
                      <div className="preview-hero-step-text">Arrastra tus archivos aqui o usa "+ Archivos"</div>
                    </div>
                  </div>
                  <div className="preview-hero-step">
                    <span className="preview-hero-step-num">02</span>
                    <div>
                      <div className="preview-hero-step-title">Edita</div>
                      <div className="preview-hero-step-text">Llevalos al timeline, cortalos y ordenalos</div>
                    </div>
                  </div>
                  <div className="preview-hero-step">
                    <span className="preview-hero-step-num">03</span>
                    <div>
                      <div className="preview-hero-step-title">Efectos</div>
                      <div className="preview-hero-step-text">Blanco y negro, grano, vineta, texto y mas</div>
                    </div>
                  </div>
                  <div className="preview-hero-step">
                    <span className="preview-hero-step-num">04</span>
                    <div>
                      <div className="preview-hero-step-title">Exporta</div>
                      <div className="preview-hero-step-text">Descarga tu video en MP4, MOV o WebM</div>
                    </div>
                  </div>
                </div>
              </div>
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
          style={{ width: 30, height: 30, border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {store.isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="4" y="3" width="6" height="18" />
              <rect x="14" y="3" width="6" height="18" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M5 3l16 9-16 9z" />
            </svg>
          )}
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
