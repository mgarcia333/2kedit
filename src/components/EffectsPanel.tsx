import { useState, useRef } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import type { EffectType, TimelineClip, TextClip } from '../types/project'

const EFFECT_TYPES: { type: EffectType; label: string }[] = [
  { type: 'blackAndWhite', label: 'Blanco y Negro' },
  { type: 'sepia',         label: 'Sepia' },
  { type: 'filmNoise',     label: 'Granulado de Pelicula' },
  { type: 'noise',         label: 'Ruido Digital' },
  { type: 'vignette',      label: 'Vineta' },
  { type: 'brightness',    label: 'Brillo / Contraste' },
  { type: 'saturation',    label: 'Saturacion' },
  { type: 'blur',          label: 'Desenfoque' },
  { type: 'flipHorizontal',label: 'Voltear Horizontal' },
]

function SliderRow({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="slider-row">
      <span className="slider-label">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1 }}
      />
      <span className="slider-value">{value.toFixed(step < 1 ? 2 : 0)}</span>
    </div>
  )
}

function EffectItem({ clip, effect }: { clip: TimelineClip; effect: TimelineClip['effects'][number] }) {
  const store = useProjectStore()
  const [expanded, setExpanded] = useState(false)
  const p = effect.params
  const hasControls = ['filmNoise','vignette','brightness','saturation','blur'].includes(effect.type)

  const update = (params: Record<string, number | string | boolean>) =>
    store.updateEffect(clip.id, effect.id, { ...p, ...params })

  return (
    <div style={{ marginBottom: 3 }}>
      <div className="effect-row">
        <label className="toggle">
          <input type="checkbox" checked={effect.enabled} onChange={() => store.toggleEffect(clip.id, effect.id)} />
          <span className="toggle-slider" />
        </label>
        <span
          className="effect-label"
          onClick={() => hasControls && setExpanded(!expanded)}
          style={{ cursor: hasControls ? 'pointer' : 'default' }}
        >
          {effect.label}
        </span>
        {hasControls && (
          <button className="btn-icon" onClick={() => setExpanded(!expanded)} style={{ fontSize: 9 }}>
            {expanded ? 'v' : '>'}
          </button>
        )}
        <button
          className="btn-icon"
          onClick={() => store.removeEffect(clip.id, effect.id)}
          style={{ color: 'var(--danger)', fontSize: 11 }}
        >x</button>
      </div>

      {expanded && (
        <div className="effect-controls">
          {effect.type === 'filmNoise' && (
            <SliderRow label="Intensidad" value={p.intensity as number ?? 20} min={0} max={100} step={1}
              onChange={v => update({ intensity: v })} />
          )}
          {effect.type === 'noise' && (
            <SliderRow label="Intensidad" value={p.intensity as number ?? 50} min={0} max={100} step={1}
              onChange={v => update({ intensity: v })} />
          )}
          {effect.type === 'vignette' && (
            <SliderRow label="Intensidad" value={p.intensity as number ?? 0.5} min={0.1} max={1} step={0.05}
              onChange={v => update({ intensity: v })} />
          )}
          {effect.type === 'brightness' && (<>
            <SliderRow label="Brillo" value={p.brightness as number ?? 0} min={-1} max={1} step={0.05}
              onChange={v => update({ ...p, brightness: v })} />
            <SliderRow label="Contraste" value={p.contrast as number ?? 1} min={0} max={3} step={0.05}
              onChange={v => update({ ...p, contrast: v })} />
          </>)}
          {effect.type === 'saturation' && (
            <SliderRow label="Saturacion" value={p.saturation as number ?? 1} min={0} max={3} step={0.05}
              onChange={v => update({ saturation: v })} />
          )}
          {effect.type === 'blur' && (
            <SliderRow label="Radio" value={p.radius as number ?? 2} min={0} max={20} step={1}
              onChange={v => update({ radius: v })} />
          )}
        </div>
      )}
    </div>
  )
}

export default function EffectsPanel() {
  const store = useProjectStore()
  const [showPicker, setShowPicker] = useState(false)

  const selectedClips = [...store.timeline.video, ...store.timeline.audio]
    .filter(c => store.selectedClipIds.includes(c.id))
  if (store.selectedClipIds.length === 0) {
    return (
      <div className="panel effects-panel">
        <div className="panel-header">Propiedades</div>
        <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 11, textAlign: 'center' }}>
          Selecciona un clip para ver sus propiedades
        </div>
      </div>
    )
  }

  const selectedClipId = store.selectedClipIds[0]
  const selectedTimelineClip = [...store.timeline.video, ...store.timeline.audio].find(c => c.id === selectedClipId)
  const selectedTextClip = store.timeline.text.find(c => c.id === selectedClipId)

  if (selectedTextClip) {
    const update = (changes: Partial<TextClip>) => store.updateTimelineClip(selectedTextClip.id, changes as any)
    return (
      <div className="panel effects-panel">
        <div className="panel-header">Propiedades de Texto</div>
        <div className="effects-section">
          <div style={{ marginBottom: 12 }}>
            <span className="slider-label" style={{ display: 'block', marginBottom: 4 }}>Contenido</span>
            <textarea
              value={selectedTextClip.text}
              onChange={e => update({ text: e.target.value })}
              style={{ width: '100%', height: 60, fontSize: 12, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 6px', resize: 'none' }}
            />
          </div>
          
          <div style={{ marginBottom: 12 }}>
            <span className="slider-label" style={{ display: 'block', marginBottom: 4 }}>Fuente</span>
            <select
              value={selectedTextClip.fontFamily || 'Inter'}
              onChange={e => update({ fontFamily: e.target.value })}
              style={{ width: '100%', fontSize: 11, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px' }}
            >
              <option value="Inter">Inter (Por defecto)</option>
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Courier New">Courier New</option>
              <option value="Impact">Impact</option>
              <option value="Georgia">Georgia</option>
              <option value="Verdana">Verdana</option>
              <option value="Trebuchet MS">Trebuchet MS</option>
              <option value="Comic Sans MS">Comic Sans MS</option>
            </select>
          </div>
          
          <SliderRow label="Tamano" value={selectedTextClip.fontSize} min={10} max={200} step={1} onChange={v => update({ fontSize: v })} />
          <SliderRow label="Posicion X (%)" value={selectedTextClip.x} min={0} max={100} step={1} onChange={v => update({ x: v })} />
          <SliderRow label="Posicion Y (%)" value={selectedTextClip.y} min={0} max={100} step={1} onChange={v => update({ y: v })} />
          
          <div className="slider-row">
            <span className="slider-label">Color</span>
            <input 
              type="color" 
              value={selectedTextClip.color} 
              onChange={e => update({ color: e.target.value })}
              style={{ padding: 0, border: 'none', background: 'none', width: 24, height: 24, cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>
    )
  }

  const selectedClip = selectedTimelineClip
  if (!selectedClip) {
    return (
      <div className="effects-panel">
        <div className="panel-header">Ajustes del Proyecto</div>
        <div className="effects-section">
          <div className="effects-section-title">Resolución y Bordes</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
            Configura el formato del lienzo (aspect ratio). Añadirá bordes negros al exportar si es necesario.
          </div>
          <div className="slider-row">
            <span className="slider-label">Formato</span>
            <select 
              value={store.aspectRatio} 
              onChange={e => store.setAspectRatio(e.target.value as any)}
              style={{ flex: 1, fontSize: 11, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px' }}
            >
              <option value="original">Original del clip principal</option>
              <option value="16:9">16:9 (YouTube, apaisado)</option>
              <option value="9:16">9:16 (TikTok, Shorts, Reels)</option>
              <option value="1:1">1:1 (Instagram Cuadrado)</option>
              <option value="4:3">4:3 (Clásico)</option>
            </select>
          </div>
        </div>
      </div>
    )
  }

  const sourceClip = store.clips.find(c => c.id === selectedClip.sourceClipId)

  return (
    <div className="effects-panel">
      <div className="panel-header">Efectos</div>

      {/* Clip info */}
      <div className="effects-section">
        <div className="effects-section-title">Clip</div>
        <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sourceClip?.fileName ?? 'Clip'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono', marginBottom: 10 }}>
          {sourceClip?.width ? `${sourceClip.width}x${sourceClip.height}` : ''}
          {sourceClip?.fps ? ` ${sourceClip.fps}fps` : ''}
        </div>
        
        <SliderRow label="Velocidad" value={selectedClip.playbackRate || 1} min={0.1} max={4} step={0.05}
          onChange={v => store.updateTimelineClip(selectedClip.id, { playbackRate: v })} />
      </div>

      {/* Audio */}
      <div className="effects-section">
        <div className="effects-section-title">Audio</div>
        <SliderRow label="Volumen" value={selectedClip.volume} min={0} max={2} step={0.05}
          onChange={v => store.updateTimelineClip(selectedClip.id, { volume: v })} />
        <SliderRow label="Fade in" value={selectedClip.fadeIn} min={0} max={5} step={0.1}
          onChange={v => store.updateTimelineClip(selectedClip.id, { fadeIn: v })} />
        <SliderRow label="Fade out" value={selectedClip.fadeOut} min={0} max={5} step={0.1}
          onChange={v => store.updateTimelineClip(selectedClip.id, { fadeOut: v })} />
        <div className="slider-row" style={{ marginBottom: 0 }}>
          <span className="slider-label">Silenciar</span>
          <label className="toggle">
            <input type="checkbox" checked={selectedClip.muted}
              onChange={e => store.updateTimelineClip(selectedClip.id, { muted: e.target.checked })} />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      {/* Effects list */}
      <div className="effects-section" style={{ flex: 1 }}>
        <div className="effects-section-title">
          Efectos de video ({selectedClip.effects.length})
        </div>

        {selectedClip.effects.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>Sin efectos</div>
        )}

        {selectedClip.effects.map(effect => (
          <EffectItem key={effect.id} clip={selectedClip} effect={effect} />
        ))}

        <div style={{ position: 'relative' }}>
          <button className="add-effect-btn" onClick={() => setShowPicker(!showPicker)}>
            + Anadir efecto
          </button>
          {showPicker && (
            <div className="effect-picker">
              {EFFECT_TYPES.map(e => (
                <div
                  key={e.type}
                  className="effect-picker-item"
                  onClick={() => { store.addEffect(selectedClip.id, e.type); setShowPicker(false) }}
                >
                  {e.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
