import { useEffect, useState, useRef, useCallback } from 'react'
import { useProjectStore } from './store/useProjectStore'
import { useFFmpeg } from './hooks/useFFmpeg'
import TopBar from './components/TopBar'
import MediaPanel from './components/MediaPanel'
import PreviewPlayer from './components/PreviewPlayer'
import EffectsPanel from './components/EffectsPanel'
import Timeline from './components/Timeline'
import ExportModal from './components/ExportModal'
import FFmpegWarning from './components/FFmpegWarning'
import './App.css'

const isElectron = () => typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'

export default function App() {
  const store = useProjectStore()
  const { probeAndImport } = useFFmpeg()
  const [showExport, setShowExport] = useState(false)
  const [showFFmpegWarning, setShowFFmpegWarning] = useState(false)
  const appRef = useRef<HTMLDivElement>(null)

  // Init: check FFmpeg, get temp dir
  useEffect(() => {
    if (!isElectron()) return
    ;(async () => {
      const check = await window.electronAPI.checkFFmpeg()
      store.setFFmpegAvailable(check.ffmpeg && check.ffprobe)
      if (!check.ffmpeg || !check.ffprobe) setShowFFmpegWarning(true)
      const tempDir = await window.electronAPI.getTempDir()
      store.setTempDir(tempDir)
    })()
  }, [])

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    if (e.code === 'Space') {
      e.preventDefault()
      store.setPlaying(!store.isPlaying)
    }
    if (e.code === 'KeyS' && !e.ctrlKey) {
      e.preventDefault()
      const sel = [...store.timeline.video, ...store.timeline.audio]
        .find(c => store.selectedClipIds.includes(c.id))
      if (sel) store.splitClip(sel.id, store.currentTime)
    }
    if (e.code === 'Delete') {
      e.preventDefault()
      if (store.selectedClipIds.length) store.removeTimelineClips(store.selectedClipIds)
    }
    if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); store.undo() }
    if (e.ctrlKey && e.code === 'KeyY') { e.preventDefault(); store.redo() }
    if (e.ctrlKey && e.code === 'KeyI') {
      e.preventDefault()
      if (isElectron()) window.electronAPI.openFileDialog().then(paths => { if (paths.length) probeAndImport(paths) })
    }
    if (e.ctrlKey && e.code === 'KeyE') { e.preventDefault(); setShowExport(true) }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') store.setTimelineZoom(store.timelineZoom * 1.2)
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') store.setTimelineZoom(store.timelineZoom / 1.2)
    if (e.code === 'ArrowLeft' && !e.ctrlKey) {
      e.preventDefault()
      const fps = 30
      store.setCurrentTime(Math.max(0, store.currentTime - 1 / fps))
    }
    if (e.code === 'ArrowRight' && !e.ctrlKey) {
      e.preventDefault()
      const fps = 30
      store.setCurrentTime(Math.min(store.duration, store.currentTime + 1 / fps))
    }
    if (e.code === 'ArrowLeft' && e.ctrlKey) {
      e.preventDefault()
      store.setCurrentTime(Math.max(0, store.currentTime - 5))
    }
    if (e.code === 'ArrowRight' && e.ctrlKey) {
      e.preventDefault()
      store.setCurrentTime(Math.min(store.duration, store.currentTime + 5))
    }
  }, [store, probeAndImport])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="app" ref={appRef}>
      <TopBar onExport={() => setShowExport(true)} />
      <div className="app-body">
        <MediaPanel />
        <PreviewPlayer />
        <EffectsPanel />
      </div>
      <Timeline />
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showFFmpegWarning && <FFmpegWarning onClose={() => setShowFFmpegWarning(false)} />}
    </div>
  )
}
