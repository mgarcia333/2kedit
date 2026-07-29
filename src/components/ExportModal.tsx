import { useState, useEffect, useRef } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { useFFmpeg } from '../hooks/useFFmpeg'

interface ExportModalProps { onClose: () => void }

function parseFFmpegProgress(output: string, durationSec: number): number {
  const match = output.match(/time=(\d+):(\d+):(\d+\.\d+)/)
  if (!match) return 0
  const elapsed = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3])
  return durationSec > 0 ? Math.min(100, (elapsed / durationSec) * 100) : 0
}

function mimeForFormat(format: 'mp4' | 'mov' | 'webm'): string {
  if (format === 'webm') return 'video/webm'
  if (format === 'mov') return 'video/quicktime'
  return 'video/mp4'
}

export default function ExportModal({ onClose }: ExportModalProps) {
  const store = useProjectStore()
  const { buildExportCommand, runWebExport, cancelWebExport } = useFFmpeg()
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outputPath, setOutputPath] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const { exportSettings } = store
  const isElec = typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'

  useEffect(() => {
    if (!exportSettings.outputFolder && isElec) {
      window.electronAPI.openFolderDialog().then(folder => {
        if (folder) store.setExportSettings({ outputFolder: folder })
      })
    }
  }, [])

  // Release the export's blob URL once it's replaced or the modal unmounts.
  useEffect(() => {
    if (!downloadUrl) return
    return () => URL.revokeObjectURL(downloadUrl)
  }, [downloadUrl])

  const handleExportElectron = async () => {
    let folder = exportSettings.outputFolder
    if (!folder) {
      const f = await window.electronAPI.openFolderDialog()
      if (!f) return
      store.setExportSettings({ outputFolder: f })
      folder = f
    }
    const fullPath = `${folder}\\${exportSettings.fileName}`
    const args = buildExportCommand(fullPath)
    if (!args) { setError('Sin clips en el timeline'); return }

    setIsExporting(true); setProgress(0); setError(null); setDone(false); setOutputPath(fullPath)

    const cleanup = window.electronAPI.onFFmpegProgress(data => {
      setStatusText(data)
      const p = parseFFmpegProgress(data, store.duration)
      if (p > 0) setProgress(p)
    })
    cleanupRef.current = cleanup

    try {
      const result = await window.electronAPI.runFFmpeg(args)
      cleanup()
      if (result.success) { setProgress(100); setDone(true) }
      else setError(result.error ?? 'Error en la exportacion')
    } catch (e: unknown) {
      cleanup()
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportWeb = async () => {
    const args = buildExportCommand(exportSettings.fileName)
    if (!args) { setError('Sin clips en el timeline'); return }

    setIsExporting(true); setProgress(0); setError(null); setDone(false); setDownloadUrl(null)
    setStatusText('Cargando motor de video (primera vez puede tardar)...')

    try {
      const data = await runWebExport(args, exportSettings.fileName, ratio => {
        setProgress(Math.round(ratio * 100))
        setStatusText(`Procesando... ${Math.round(ratio * 100)}%`)
      })
      // Cast needed: TS's lib.dom types Uint8Array as generic over ArrayBufferLike,
      // which no longer structurally matches BlobPart, even though this is always a
      // plain ArrayBuffer-backed view at runtime.
      const blob = new Blob([data as BlobPart], { type: mimeForFormat(exportSettings.format) })
      setDownloadUrl(URL.createObjectURL(blob))
      setProgress(100); setDone(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsExporting(false)
    }
  }

  const handleExport = () => { isElec ? handleExportElectron() : handleExportWeb() }

  const handleCancel = async () => {
    if (isElec) await window.electronAPI.cancelFFmpeg()
    else cancelWebExport()
    cleanupRef.current?.()
    setIsExporting(false); setProgress(0)
  }

  const Pill = ({ value, active, onSelect }: { value: string; active: boolean; onSelect: () => void }) => (
    <div className={`export-pill ${active ? 'active' : ''}`} onClick={onSelect}>{value}</div>
  )

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !isExporting) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <span style={{ fontSize: 14, fontWeight: 600 }}>Exportar Video</span>
          {!isExporting && <button className="btn-icon" onClick={onClose} style={{ fontSize: 12 }}>x</button>}
        </div>

        {!done && (
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className="export-option-group">
              <div className="export-option-label">Formato</div>
              <div className="export-option-pills">
                {(['mp4','mov','webm'] as const).map(f => (
                  <Pill key={f} value={f.toUpperCase()} active={exportSettings.format === f}
                    onSelect={() => store.setExportSettings({ format: f, fileName: exportSettings.fileName.replace(/\.\w+$/, `.${f}`) })} />
                ))}
              </div>
            </div>
            <div className="export-option-group">
              <div className="export-option-label">Resolucion</div>
              <div className="export-option-pills">
                {(['original','1080p','720p','480p'] as const).map(r => (
                  <Pill key={r} value={r} active={exportSettings.resolution === r} onSelect={() => store.setExportSettings({ resolution: r })} />
                ))}
              </div>
            </div>
            <div className="export-option-group">
              <div className="export-option-label">Calidad</div>
              <div className="export-option-pills">
                <Pill value="Alta CRF18" active={exportSettings.quality === 18} onSelect={() => store.setExportSettings({ quality: 18 })} />
                <Pill value="Media CRF23" active={exportSettings.quality === 23} onSelect={() => store.setExportSettings({ quality: 23 })} />
                <Pill value="Web CRF28" active={exportSettings.quality === 28} onSelect={() => store.setExportSettings({ quality: 28 })} />
              </div>
            </div>
            <div className="export-option-group">
              <div className="export-option-label">FPS</div>
              <div className="export-option-pills">
                {(['original',60,30,24] as const).map(f => (
                  <Pill key={f} value={String(f)} active={exportSettings.fps === f} onSelect={() => store.setExportSettings({ fps: f })} />
                ))}
              </div>
            </div>
            <div className="export-option-group">
              <div className="export-option-label">Audio</div>
              <div className="export-option-pills">
                <Pill value="AAC 320k" active={exportSettings.audio === 'aac_320'} onSelect={() => store.setExportSettings({ audio: 'aac_320' })} />
                <Pill value="MP3 192k" active={exportSettings.audio === 'mp3_192'} onSelect={() => store.setExportSettings({ audio: 'mp3_192' })} />
                <Pill value="Sin audio" active={exportSettings.audio === 'none'} onSelect={() => store.setExportSettings({ audio: 'none' })} />
              </div>
            </div>
            <div className="export-option-group">
              <div className="export-option-label">Nombre</div>
              <input type="text" value={exportSettings.fileName} style={{ width: '100%' }}
                onChange={e => store.setExportSettings({ fileName: e.target.value })} />
            </div>
            {isElec && (
              <div className="export-option-group">
                <div className="export-option-label">Carpeta</div>
                <div className="export-file-row">
                  <input type="text" value={exportSettings.outputFolder} style={{ flex: 1 }}
                    placeholder="Selecciona carpeta..." readOnly />
                  <button className="btn btn-ghost" onClick={async () => {
                    const f = await window.electronAPI.openFolderDialog()
                    if (f) store.setExportSettings({ outputFolder: f })
                  }}>Abrir</button>
                </div>
              </div>
            )}
            {!isElec && (
              <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: '4px 10px' }}>
                El archivo se procesa en tu navegador y se descarga al terminar.
              </div>
            )}
            {error && (
              <div style={{ color: 'var(--danger)', fontSize: 11, padding: '8px 10px', background: 'rgba(180,60,60,0.1)', borderRadius: 4 }}>
                {error}
              </div>
            )}
          </div>
        )}

        {(isExporting || done) && (
          <div className="export-progress-block">
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
              {done ? 'Exportacion completada' : 'Exportando...'}
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
              <div className="export-status-text" style={{ maxWidth: '80%' }}>
                {statusText.split('\n').filter(Boolean).pop() ?? ''}
              </div>
              <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--text-primary)' }}>
                {Math.round(progress)}%
              </span>
            </div>
          </div>
        )}

        {done && isElec && (
          <div className="modal-body" style={{ paddingTop: 0 }}>
            <div style={{ display: 'flex', gap: 7 }}>
              <button className="btn btn-ghost" onClick={() => {
                if (outputPath) {
                  const folder = outputPath.split('\\').slice(0, -1).join('\\')
                  window.electronAPI.openFolder(folder)
                }
              }}>Abrir carpeta</button>
              <button className="btn btn-primary" onClick={() => {
                if (outputPath) window.electronAPI.openFile(outputPath)
              }}>Reproducir</button>
            </div>
          </div>
        )}

        {done && !isElec && downloadUrl && (
          <div className="modal-body" style={{ paddingTop: 0 }}>
            <a
              className="btn btn-primary"
              style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}
              href={downloadUrl}
              download={exportSettings.fileName}
            >
              Descargar {exportSettings.fileName}
            </a>
          </div>
        )}

        <div className="modal-footer">
          {!done && (
            isExporting ? (
              <button className="btn btn-danger" onClick={handleCancel}>Cancelar</button>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleExport} disabled={isElec && !exportSettings.outputFolder}>
                  Exportar
                </button>
              </>
            )
          )}
          {done && <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
        </div>
      </div>
    </div>
  )
}
