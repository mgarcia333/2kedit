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

        <button className="btn btn-ghost" onClick={handleImport} title="Importar (Ctrl+I)">
          + Importar
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
