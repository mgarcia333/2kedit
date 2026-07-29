import { useRef } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { useFFmpeg } from '../hooks/useFFmpeg'

interface TopBarProps {
  onExport: () => void
}

const isElectron = () => typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'
const MEDIA_EXTENSIONS = /\.(mp4|mov|avi|mkv|webm|mp3|wav|aac|flac|m4a)$/i

function applyLoadedProject(data: string, fallbackExportSettings: ReturnType<typeof useProjectStore.getState>['exportSettings']) {
  try {
    const parsed = JSON.parse(data)
    const loadedTimeline = parsed.timeline || { video: [], audio: [], text: [] }
    if (!loadedTimeline.text) loadedTimeline.text = [] // Backwards compatibility

    useProjectStore.setState({
      name: parsed.name || 'Proyecto',
      clips: parsed.clips || [],
      timeline: loadedTimeline,
      duration: parsed.duration || 0,
      exportSettings: parsed.exportSettings || fallbackExportSettings,
      timelineZoom: parsed.timelineZoom || 1,
      aspectRatio: parsed.aspectRatio || 'original',
      currentTime: 0,
      selectedClipIds: [],
      isPlaying: false,
      isBuffering: false,
      history: [{
        clips: parsed.clips || [],
        timeline: loadedTimeline,
        description: 'Proyecto cargado'
      }],
      historyIndex: 0
    })
  } catch (e) {
    console.error('Invalid project file', e)
  }
}

export default function TopBar({ onExport }: TopBarProps) {
  const store = useProjectStore()
  const { probeAndImport, probeAndImportFiles } = useFFmpeg()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const loadInputRef = useRef<HTMLInputElement>(null)

  const handleImport = async () => {
    if (isElectron()) {
      const paths = await window.electronAPI.openFileDialog()
      if (paths.length) probeAndImport(paths)
    } else {
      fileInputRef.current?.click()
    }
  }

  const handleImportFolder = async () => {
    if (isElectron()) {
      const paths = await window.electronAPI.openMediaFolderDialog()
      if (paths.length) probeAndImport(paths)
    } else {
      folderInputRef.current?.click()
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length) probeAndImportFiles(files)
  }

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => MEDIA_EXTENSIONS.test(f.name))
    e.target.value = ''
    if (files.length) probeAndImportFiles(files)
  }

  const handleSave = async () => {
    const state = useProjectStore.getState()
    const stateToSave = {
      name: state.name,
      clips: state.clips,
      timeline: state.timeline,
      duration: state.duration,
      exportSettings: state.exportSettings,
      timelineZoom: state.timelineZoom,
      aspectRatio: state.aspectRatio,
    }
    if (isElectron()) {
      await window.electronAPI.saveProject(JSON.stringify(stateToSave))
    } else {
      const blob = new Blob([JSON.stringify(stateToSave)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${state.name || 'proyecto'}.2kedit`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const handleLoad = async () => {
    if (isElectron()) {
      const data = await window.electronAPI.loadProject()
      if (data) applyLoadedProject(data, store.exportSettings)
    } else {
      loadInputRef.current?.click()
    }
  }

  const handleLoadInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    applyLoadedProject(await file.text(), store.exportSettings)
  }

  return (
    <div className="topbar">
      <div className="topbar-logo">
        <img src="/app-icon.jpg" alt="Logo" style={{ width: 20, height: 20, objectFit: 'cover', border: '1px solid var(--border-light)', boxShadow: '1px 1px 0 var(--border-dark)' }} />
        <span>2kedit</span>
      </div>

      {!isElectron() && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,audio/*"
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-expect-error non-standard attribute, used for folder selection in Chrome/Edge
            webkitdirectory=""
            style={{ display: 'none' }}
            onChange={handleFolderInputChange}
          />
          <input
            ref={loadInputRef}
            type="file"
            accept=".2kedit"
            style={{ display: 'none' }}
            onChange={handleLoadInputChange}
          />
        </>
      )}

      <div className="topbar-divider" />

      <input
        className="topbar-project-name"
        value={store.name}
        onChange={e => store.setProjectName(e.target.value)}
        onBlur={e => { if (!e.target.value.trim()) store.setProjectName('Sin titulo') }}
        spellCheck={false}
      />

      <div className="topbar-spacer" />

      <div className="topbar-actions">
        <button
          className="btn-icon"
          onClick={store.undo}
          disabled={store.historyIndex <= 0}
          title="Deshacer (Ctrl+Z)"
        >Z</button>
        <button
          className="btn-icon"
          onClick={store.redo}
          disabled={store.historyIndex >= store.history.length - 1}
          title="Rehacer (Ctrl+Y)"
        >Y</button>

        <div className="topbar-divider" />

        <button className="btn btn-ghost" onClick={handleLoad} title="Cargar Proyecto">
          Cargar
        </button>
        <button className="btn btn-ghost" onClick={handleSave} title="Guardar Proyecto" style={{ background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--accent)' }}>
          Guardar
        </button>

        <div className="topbar-divider" />

        <button
          className={`btn-icon ${store.globalMute ? 'active' : ''}`}
          onClick={() => store.setGlobalMute(!store.globalMute)}
          title="Silenciar Todo"
          style={{ fontSize: 11, width: 'auto', padding: '0 8px', border: store.globalMute ? '1px solid var(--accent)' : '1px solid transparent', color: store.globalMute ? 'var(--accent)' : 'inherit' }}
        >
          {store.globalMute ? 'MUTED' : 'MUTE'}
        </button>

        <div className="topbar-divider" />

        <button className="btn btn-ghost" onClick={handleImportFolder} title="Importar Carpeta entera">
          + Carpeta
        </button>
        <button className="btn btn-ghost" onClick={handleImport} title="Importar Archivos (Ctrl+I)">
          + Archivos
        </button>

        <button
          className="btn btn-primary"
          onClick={onExport}
          disabled={store.timeline.video.length === 0}
          title="Exportar (Ctrl+E)"
        >
          Exportar
        </button>
      </div>

      {isElectron() && (
        <div className="window-controls">
          <button className="win-btn" onClick={() => window.electronAPI.minimizeWindow()} title="Minimizar">—</button>
          <button className="win-btn" onClick={() => window.electronAPI.maximizeWindow()} title="Maximizar">□</button>
          <button className="win-btn close" onClick={() => window.electronAPI.closeWindow()} title="Cerrar">x</button>
        </div>
      )}

      {!isElectron() && (
        <a
          className="btn btn-primary topbar-download"
          href="https://github.com/mgarcia333/2kedit/releases"
          title="Descargar 2kedit para Windows"
        >
          Descargar
        </a>
      )}
    </div>
  )
}
