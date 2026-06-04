import { useRef } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { useFFmpeg } from '../hooks/useFFmpeg'

interface TopBarProps {
  onExport: () => void
}

const isElectron = () => typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'

export default function TopBar({ onExport }: TopBarProps) {
  const store = useProjectStore()
  const { probeAndImport } = useFFmpeg()

  const handleImport = async () => {
    if (!isElectron()) return
    const paths = await window.electronAPI.openFileDialog()
    if (paths.length) probeAndImport(paths)
  }

  const handleImportFolder = async () => {
    if (!isElectron()) return
    const paths = await window.electronAPI.openMediaFolderDialog()
    if (paths.length) probeAndImport(paths)
  }

  const handleSave = async () => {
    if (!isElectron()) return
    const state = useProjectStore.getState()
    const stateToSave = {
      name: state.name,
      clips: state.clips,
      timeline: state.timeline,
      duration: state.duration,
      exportSettings: state.exportSettings,
      timelineZoom: state.timelineZoom,
    }
    await window.electronAPI.saveProject(JSON.stringify(stateToSave))
  }

  const handleLoad = async () => {
    if (!isElectron()) return
    const data = await window.electronAPI.loadProject()
    if (data) {
      try {
        const parsed = JSON.parse(data)
        useProjectStore.setState({
          name: parsed.name || 'Proyecto',
          clips: parsed.clips || [],
          timeline: parsed.timeline || { video: [], audio: [] },
          duration: parsed.duration || 0,
          exportSettings: parsed.exportSettings || store.exportSettings,
          timelineZoom: parsed.timelineZoom || 1,
          currentTime: 0,
          selectedClipIds: [],
          isPlaying: false,
          history: [{
            clips: parsed.clips || [],
            timeline: parsed.timeline || { video: [], audio: [] },
            description: 'Proyecto cargado'
          }],
          historyIndex: 0
        })
      } catch (e) {
        console.error('Invalid project file', e)
      }
    }
  }

  return (
    <div className="topbar">
      <div className="topbar-logo">
        <div className="topbar-logo-mark">2K</div>
        <span>2kedit</span>
      </div>

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
        <button className="btn btn-ghost" onClick={handleSave} title="Guardar Proyecto" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>
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
    </div>
  )
}
