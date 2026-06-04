import { useCallback, useState } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { useFFmpeg } from '../hooks/useFFmpeg'
import type { MediaClip } from '../types/project'

const isElectron = () => typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'

function formatDuration(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function MediaItem({ clip }: { clip: MediaClip }) {
  const store = useProjectStore()
  const { addClipToTimeline } = useFFmpeg()
  const isSelected = store.selectedClipId === clip.id

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/2kedit-clip', clip.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      className={`media-item ${isSelected ? 'selected' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onClick={() => store.setSelectedClipId(clip.id)}
      onDoubleClick={() => addClipToTimeline(clip)}
      title={`${clip.fileName}\nDoble clic para añadir al timeline`}
    >
      <div className="media-thumb">
        {clip.thumbnailPath ? (
          <img src={clip.thumbnailPath} alt="" />
        ) : (
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            {clip.type === 'video' ? 'VID' : 'AUD'}
          </span>
        )}
      </div>
      <div className="media-info">
        <div className="media-name">{clip.fileName}</div>
        <div className="media-meta">
          {formatDuration(clip.duration)}
          {clip.width ? ` ${clip.width}x${clip.height}` : ''}
        </div>
      </div>
      <button
        className="media-add-btn"
        onClick={e => { e.stopPropagation(); addClipToTimeline(clip) }}
        title="Añadir al timeline"
      >+</button>
    </div>
  )
}

export default function MediaPanel() {
  const store = useProjectStore()
  const { probeAndImport } = useFFmpeg()
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    // In Electron, File objects have a .path property
    const paths = files.map(f => (f as File & { path?: string }).path).filter(Boolean) as string[]
    if (paths.length) probeAndImport(paths)
  }, [probeAndImport])

  const handleImport = async () => {
    if (!isElectron()) return
    const paths = await window.electronAPI.openFileDialog()
    if (paths.length) probeAndImport(paths)
  }

  return (
    <div className="media-panel">
      <div className="panel-header">
        Medios
        <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 9 }}>
          {store.clips.length}
        </span>
      </div>

      <div
        className={`media-dropzone dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={handleImport}
      >
        <span style={{ fontSize: 11 }}>Arrastra archivos aqui</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>o clic para importar</span>
      </div>

      <div className="media-list">
        {store.clips.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 11, textAlign: 'center', padding: '10px 0' }}>
            Sin medios
          </div>
        ) : (
          store.clips.map(clip => <MediaItem key={clip.id} clip={clip} />)
        )}
      </div>
    </div>
  )
}
