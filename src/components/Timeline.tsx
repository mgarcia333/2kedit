import { useRef, useCallback, useState, useEffect } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { useFFmpeg } from '../hooks/useFFmpeg'
import type { TimelineClip } from '../types/project'

const TRACK_HEIGHT = 52
const RULER_HEIGHT = 20
const LABEL_WIDTH = 72
const DEFAULT_PPS = 80   // pixels per second at zoom 1

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function TimelineRuler({ pixelsPerSecond, duration, width }: {
  pixelsPerSecond: number; duration: number; width: number
}) {
  const totalWidth = Math.max(width, duration * pixelsPerSecond + 300)
  const step = pixelsPerSecond < 20 ? 10 : pixelsPerSecond < 60 ? 5 : 1
  const ticks: number[] = []
  for (let t = 0; t <= Math.ceil(duration + 15); t += step) ticks.push(t)

  return (
    <svg width={totalWidth} height={RULER_HEIGHT} style={{ display: 'block' }}>
      <rect width={totalWidth} height={RULER_HEIGHT} fill="var(--bg-base)" />
      {ticks.map(t => {
        const x = t * pixelsPerSecond
        const isMajor = t % (step * 5) === 0 || step === 1
        return (
          <g key={t}>
            <line x1={x} y1={isMajor ? 6 : 13} x2={x} y2={RULER_HEIGHT}
              stroke="var(--border-light)" strokeWidth="1" />
            {isMajor && (
              <text x={x + 3} y={12} fill="var(--text-dim)" fontSize="9"
                fontFamily="JetBrains Mono, monospace">
                {formatTime(t)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function TimelineClipEl({ clip, pixelsPerSecond }: { clip: TimelineClip; pixelsPerSecond: number }) {
  const store = useProjectStore()
  const sourceClip = store.clips.find(c => c.id === clip.sourceClipId)
  const isSelected = store.selectedClipId === clip.id
  const dragRef = useRef({ active: false, startX: 0, startTime: 0 })

  const x = clip.startTime * pixelsPerSecond
  const w = Math.max(4, clip.duration * pixelsPerSecond)

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('clip-trim-handle')) return
    e.stopPropagation()
    store.setSelectedClipId(clip.id)
    dragRef.current = { active: true, startX: e.clientX, startTime: clip.startTime }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return
      const dt = (ev.clientX - dragRef.current.startX) / pixelsPerSecond
      store.moveTimelineClip(clip.id, Math.max(0, dragRef.current.startTime + dt))
    }
    const onUp = () => {
      dragRef.current.active = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleTrim = (e: React.MouseEvent, side: 'left' | 'right') => {
    e.stopPropagation()
    const startX = e.clientX
    const origDuration = clip.duration
    const origStart = clip.startTime
    const origTrimStart = clip.trimStart

    const onMove = (ev: MouseEvent) => {
      const dt = (ev.clientX - startX) / pixelsPerSecond
      if (side === 'left') {
        const newDuration = Math.max(0.1, origDuration - dt)
        const diff = origDuration - newDuration
        store.updateTimelineClip(clip.id, {
          startTime: Math.max(0, origStart + diff),
          duration: newDuration,
          trimStart: Math.max(0, origTrimStart + diff),
        })
      } else {
        store.updateTimelineClip(clip.id, { duration: Math.max(0.1, origDuration + dt) })
      }
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      className={`timeline-clip ${clip.track === 'video' ? 'video-clip' : 'audio-clip'} ${isSelected ? 'selected' : ''}`}
      style={{ left: x, width: w }}
      onMouseDown={handleMouseDown}
      title={sourceClip?.fileName}
    >
      <div className="clip-trim-handle left" onMouseDown={e => handleTrim(e, 'left')} />
      <span className="timeline-clip-label">{sourceClip?.fileName ?? 'Clip'}</span>
      <div className="clip-trim-handle right" onMouseDown={e => handleTrim(e, 'right')} />
    </div>
  )
}

export default function Timeline() {
  const store = useProjectStore()
  const { addClipToTimeline } = useFFmpeg()
  const containerRef = useRef<HTMLDivElement>(null)
  const trackAreaRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(800)

  const pps = DEFAULT_PPS * store.timelineZoom
  const totalWidth = Math.max(containerWidth, store.duration * pps + 300)

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width - LABEL_WIDTH)
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      store.setTimelineZoom(store.timelineZoom * (e.deltaY < 0 ? 1.15 : 0.87))
    }
  }

  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.timeline-clip')) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const t = (e.clientX - rect.left) / pps
    store.setCurrentTime(Math.max(0, Math.min(store.duration, t)))
  }, [pps, store])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const clipId = e.dataTransfer.getData('application/2kedit-clip')
    if (!clipId) return
    const clip = store.clips.find(c => c.id === clipId)
    if (clip) addClipToTimeline(clip)
  }

  const scrubberX = store.currentTime * pps

  return (
    <div className="timeline" onWheel={handleWheel}>
      <div className="timeline-header">
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
          Timeline
        </span>
        <div style={{ display: 'flex', gap: 3, marginLeft: 6 }}>
          <button className="btn-icon" style={{ fontSize: 11 }} onClick={() => store.setTimelineZoom(store.timelineZoom * 1.2)} title="Zoom + (+)">+</button>
          <button className="btn-icon" style={{ fontSize: 13 }} onClick={() => store.setTimelineZoom(store.timelineZoom / 1.2)} title="Zoom - (-)">-</button>
          <button className="btn-icon" style={{ fontSize: 10 }} onClick={store.removeGaps} title="Eliminar huecos">[ ]</button>
        </div>
        <div style={{ flex: 1 }} />
        {store.selectedClipId && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '2px 9px' }}
              onClick={() => {
                const clip = [...store.timeline.video, ...store.timeline.audio].find(c => c.id === store.selectedClipId)
                if (clip) store.splitClip(clip.id, store.currentTime)
              }}
              title="Cortar en scrubber (S)"
            >
              Cortar
            </button>
            <button
              className="btn btn-danger"
              style={{ fontSize: 11, padding: '2px 9px' }}
              onClick={() => { if (store.selectedClipId) store.removeFromTimeline(store.selectedClipId) }}
              title="Eliminar (Delete)"
            >
              Eliminar
            </button>
          </div>
        )}
      </div>

      <div className="timeline-body" ref={containerRef}>
        {/* Track labels */}
        <div className="timeline-track-labels">
          <div style={{ height: RULER_HEIGHT, flexShrink: 0, borderBottom: '1px solid var(--border)' }} />
          <div className="timeline-track-label">Video</div>
          <div className="timeline-track-label">Audio</div>
        </div>

        {/* Scrollable track area */}
        <div className="timeline-tracks">
          <div ref={trackAreaRef} style={{ width: totalWidth, position: 'relative' }}>
            <TimelineRuler pixelsPerSecond={pps} duration={store.duration} width={containerWidth} />

            {/* Video track */}
            <div
              className="timeline-track"
              style={{ height: TRACK_HEIGHT }}
              onClick={handleTrackClick}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
            >
              {store.timeline.video.map(clip => (
                <TimelineClipEl key={clip.id} clip={clip} pixelsPerSecond={pps} />
              ))}
            </div>

            {/* Audio track */}
            <div
              className="timeline-track"
              style={{ height: TRACK_HEIGHT }}
              onClick={handleTrackClick}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
            >
              {store.timeline.audio.map(clip => (
                <TimelineClipEl key={clip.id} clip={clip} pixelsPerSecond={pps} />
              ))}
            </div>

            {/* Scrubber */}
            <div className="timeline-scrubber" style={{ left: scrubberX }} />
          </div>
        </div>
      </div>
    </div>
  )
}
