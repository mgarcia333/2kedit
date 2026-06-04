interface FFmpegWarningProps { onClose: () => void }

export default function FFmpegWarning({ onClose }: FFmpegWarningProps) {
  return (
    <div className="ffmpeg-warning">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>FFmpeg no encontrado</div>
        <button className="btn-icon" onClick={onClose} style={{ fontSize: 11 }}>x</button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 10 }}>
        Los binarios de FFmpeg no estan presentes. Para habilitar el procesamiento de video ejecuta:
      </div>
      <div style={{ padding: '8px 10px', background: 'var(--bg-base)', borderRadius: 4, fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
        npm run download-ffmpeg
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.5 }}>
        O descarga manualmente desde github.com/BtbN/FFmpeg-Builds/releases
        y coloca ffmpeg.exe y ffprobe.exe en public/ffmpeg/
      </div>
    </div>
  )
}
