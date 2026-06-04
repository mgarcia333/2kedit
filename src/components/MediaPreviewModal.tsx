import React, { useRef, useEffect } from 'react'
import { useProjectStore } from '../store/useProjectStore'

export default function MediaPreviewModal() {
  const media = useProjectStore(s => s.previewMedia)
  const setPreviewMedia = useProjectStore(s => s.setPreviewMedia)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (media && videoRef.current) {
      // Create local URL for the file to bypass CORS / file restrictions in some contexts
      // Or just use the standard custom protocol if it's electron
      const isElectron = typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'
      videoRef.current.src = isElectron ? `media://${media.filePath}` : media.filePath
      videoRef.current.play().catch(() => {})
    }
  }, [media])

  if (!media) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.8)',
      cursor: "url('/cursor-arrow.svg') 1 1, default"
    }} onClick={() => setPreviewMedia(null)}>
      
      <div 
        style={{
          width: '80%', maxWidth: 800,
          background: 'var(--bg-surface)',
          borderTop: '2px solid var(--border-light)',
          borderLeft: '2px solid var(--border-light)',
          borderRight: '2px solid var(--border-dark)',
          borderBottom: '2px solid var(--border-dark)',
          boxShadow: '4px 4px 0 rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          background: 'var(--accent)', color: 'var(--accent-text)',
          padding: '4px 8px', display: 'flex', justifyContent: 'space-between',
          fontWeight: 'bold', fontSize: 12
        }}>
          <span>{media.name}</span>
          <button 
            style={{
              background: 'var(--bg-surface)', color: 'var(--text-primary)',
              borderTop: '1px solid var(--border-light)',
              borderLeft: '1px solid var(--border-light)',
              borderRight: '1px solid var(--border-dark)',
              borderBottom: '1px solid var(--border-dark)',
              fontWeight: 'bold', cursor: "url('/cursor-hand.svg') 6 1, pointer",
              width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10
            }}
            onClick={() => setPreviewMedia(null)}
          >
            x
          </button>
        </div>

        <div style={{ padding: 8, flex: 1, background: '#000', display: 'flex', justifyContent: 'center' }}>
          {media.filePath.toLowerCase().match(/\.(mp3|wav|aac|flac|m4a)$/) ? (
            <div style={{ width: '100%', height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              🎵 Archivo de Audio
              <audio ref={videoRef as any} controls style={{ display: 'none' }} />
            </div>
          ) : (
            <video 
              ref={videoRef} 
              controls 
              style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }} 
            />
          )}
        </div>

      </div>
    </div>
  )
}
