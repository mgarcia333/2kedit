import { useState, useRef } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import type { EffectType, TimelineClip } from '../types/project'

const EFFECT_TYPES: { type: EffectType; label: string }[] = [
  { type: 'blackAndWhite', label: 'Blanco y Negro' },
  { type: 'sepia',         label: 'Sepia' },
  { type: 'filmNoise',     label: 'Ruido de Pelicula' },
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

  if (selectedClips.length === 0) {
    return (
      <div className="effects-panel">
        <div className="panel-header">Efectos</div>
        <div className="no-clip-msg">
          Selecciona un clip en el timeline para ver sus ajustes y efectos
        </div>
      </div>
    )
  }

  if (selectedClips.length > 1) {
    return (
      <div className="effects-panel">
        <div className="panel-header">Efectos</div>
        <div className="no-clip-msg">
          Múltiples clips seleccionados ({selectedClips.length}).<br/>
          Edita de uno en uno para ver sus propiedades.
        </div>
      </div>
    )
  }

  const selectedClip = selectedClips[0]
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
        
        <div className="slider-row">
          <span className="slider-label">Velocidad</span>
          <select 
            value={String(selectedClip.playbackRate || 1)} 
            onChange={e => store.updateTimelineClip(selectedClip.id, { playbackRate: parseFloat(e.target.value) })}
            style={{ flex: 1, fontSize: 11, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px' }}
          >
            <option value="0.25">0.25x</option>
            <option value="0.5">0.5x</option>
            <option value="1">1.0x (Normal)</option>
            <option value="1.5">1.5x</option>
            <option value="2">2.0x</option>
            <option value="4">4.0x</option>
          </select>
        </div>
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
