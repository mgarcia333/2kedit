# 🎬 PROMPT: Editor de Video Local para Windows — "CineEdit"

## 🎯 OBJETIVO

Construye una aplicación de escritorio **completa, funcional y lista para usar** llamada **CineEdit** — un editor de video minimalista con estética 2K/cinematográfica para Windows. La app debe correr **100% localmente**, sin necesidad de servidor externo ni conexión a internet. Calidad de exportación profesional.

---

## 🛠️ STACK TÉCNICO RECOMENDADO

Usa **Electron + React + TypeScript** para el frontend/shell de escritorio, y **FFmpeg** (binario embebido) para todo el procesamiento de video. Esta es la combinación más robusta para este caso de uso en Windows:

| Capa | Tecnología |
|---|---|
| Shell de escritorio | **Electron** (v28+) |
| UI | **React 18 + TypeScript** |
| Estilos | **Tailwind CSS** (con tema oscuro custom) |
| Procesamiento de video | **FFmpeg** (binario estático bundleado, vía `fluent-ffmpeg`) |
| Gestión de estado | **Zustand** |
| Timeline/preview | **Canvas API + HTML5 `<video>`** |
| Build/empaquetado | **electron-builder** → genera `.exe` instalable |

> ⚠️ **NO uses soluciones web-only** (WebCodecs solo, sin FFmpeg). FFmpeg es obligatorio para garantizar la calidad de exportación y compatibilidad con todos los formatos.

---

## 📐 ESTRUCTURA DEL PROYECTO

```
cineedit/
├── electron/
│   ├── main.ts              # proceso principal Electron
│   ├── preload.ts           # bridge seguro IPC
│   └── ffmpeg-runner.ts     # ejecuta FFmpeg como proceso hijo
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── TopBar.tsx
│   │   ├── MediaPanel.tsx       # panel izquierdo: clips importados
│   │   ├── PreviewPlayer.tsx    # preview central del video
│   │   ├── Timeline.tsx         # timeline con clips y cortes
│   │   ├── EffectsPanel.tsx     # panel derecho: efectos y ajustes
│   │   └── ExportModal.tsx      # modal de exportación
│   ├── store/
│   │   └── useProjectStore.ts   # estado global con Zustand
│   ├── hooks/
│   │   └── useFFmpeg.ts
│   └── types/
│       └── project.ts
├── public/
│   └── ffmpeg/                  # binarios FFmpeg estáticos para Windows
│       ├── ffmpeg.exe
│       └── ffprobe.exe
├── package.json
├── electron-builder.yml
└── tailwind.config.ts
```

---

## 🎨 DISEÑO VISUAL — ESTÉTICA 2K CINEMATOGRÁFICA

El diseño debe ser **oscuro, limpio y con personalidad de herramienta profesional**. Nada de colores planos genéricos.

### Paleta de colores
```css
--bg-base: #0A0A0C;           /* fondo principal casi negro */
--bg-surface: #111116;        /* superficies de paneles */
--bg-elevated: #1A1A22;       /* cards, dropzones */
--border: #2A2A35;            /* bordes sutiles */
--accent: #7C6DFA;            /* violeta/índigo — color de acción */
--accent-glow: #7C6DFA44;     /* glow del acento */
--text-primary: #F0EFF8;      /* texto principal */
--text-muted: #6B6880;        /* texto secundario */
--timeline-track: #1E1E28;    /* pistas del timeline */
--clip-color: #4A3FA8;        /* clips en el timeline */
--danger: #E05C5C;            /* eliminar/error */
--success: #4ADE80;           /* confirmación */
```

### Tipografía
- **UI principal**: `Inter` (sans-serif limpio)
- **Labels técnicos / timecodes**: `JetBrains Mono` — fuente monoespaciada para tiempos

### Layout general
```
┌─────────────────────────────────────────────────────────┐
│  TopBar: Logo | Nombre proyecto | Botón Exportar        │
├──────────────┬──────────────────────┬───────────────────┤
│              │                      │                   │
│  MediaPanel  │   PreviewPlayer      │  EffectsPanel     │
│  (clips      │   (preview canvas    │  (efectos,        │
│   importados)│    + controles)      │   ajustes color,  │
│              │                      │   audio)          │
│              │                      │                   │
├──────────────┴──────────────────────┴───────────────────┤
│  Timeline: pista video + pista audio + scrubber         │
└─────────────────────────────────────────────────────────┘
```

---

## ✂️ FUNCIONALIDADES REQUERIDAS

### 1. Importar medios
- Drag & drop de archivos de video (`.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`)
- Drag & drop de audio (`.mp3`, `.wav`, `.aac`, `.flac`)
- Botón "Importar archivo" con diálogo nativo de Windows
- Thumbnail automático del primer frame de cada clip (vía FFmpeg)
- Mostrar duración, resolución, fps de cada clip

### 2. Timeline interactivo
- Pista de video y pista de audio separadas
- Clips arrastrables y reordenables en el timeline
- Scrubber de posición con timecode en formato `HH:MM:SS:FF`
- Zoom in/out del timeline (rueda del ratón)
- Click en clip para seleccionarlo → aparecen sus ajustes en EffectsPanel
- Visualización de forma de onda de audio en la pista de audio

### 3. Preview en tiempo real
- Reproductor de video central con controles: Play/Pause, Frame anterior/siguiente, ir al inicio/fin
- Muestra el frame actual con los efectos aplicados renderizados (preview)
- El preview de efectos puede ser en baja resolución para fluidez; la exportación siempre en máxima calidad
- Barra de progreso de reproducción interactiva

### 4. Recorte de clips
- **Trim handles**: arrastrar los extremos de un clip en el timeline para recortarlo
- **Split**: botón o atajo de teclado `S` para cortar el clip en la posición del scrubber
- **Delete**: tecla `Delete` para eliminar el clip seleccionado del timeline
- **Gap removal**: opción para eliminar huecos automáticamente

### 5. Efectos de video
Implementar como filtros FFmpeg aplicables a cada clip individualmente:

| Efecto | Filtro FFmpeg | UI |
|---|---|---|
| **Blanco y negro** | `hue=s=0` | Toggle on/off |
| **Ruido de película** | `noise=alls=20:allf=t+u` + overlay de grano | Slider intensidad 0–100 |
| **Cámara lenta** | `setpts=2.0*PTS` (0.5x), `setpts=4.0*PTS` (0.25x) | Selector: 1x / 0.5x / 0.25x |
| **Cámara rápida** | `setpts=0.5*PTS` (2x) | Selector: 1x / 2x / 4x |
| **Viñeta** | `vignette=PI/4` | Slider intensidad |
| **Brillo/Contraste** | `eq=brightness=X:contrast=Y` | Dos sliders |
| **Saturación** | `hue=s=X` | Slider 0–2 |
| **Sepia** | `colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131` | Toggle on/off |
| **LUT cinematográfico** | `lut3d=file=cinematic.cube` | Selector de preset |
| **Blur** | `boxblur=X:X` | Slider 0–10 |
| **Flip horizontal** | `hflip` | Toggle |

Los efectos se **apilan** en orden. Mostrar lista de efectos activos en el panel con opción de reordenar y eliminar cada uno.

### 6. Música / Audio
- Añadir pista de audio independiente (música de fondo)
- Control de volumen por pista (slider 0–200%)
- Fade in / Fade out de audio (slider duración en segundos)
- El audio del video original puede silenciarse (toggle "Mute clip audio")
- El audio de música se mezcla con el audio del video en la exportación

### 7. Exportación
Modal de exportación con las siguientes opciones:

```
Formato:        [ MP4 ✓ ]  [ MOV ]  [ WebM ]
Resolución:     [ Original ✓ ]  [ 1080p ]  [ 720p ]  [ 480p ]
Calidad:        [ Alta (CRF 18) ✓ ]  [ Media (CRF 23) ]  [ Web (CRF 28) ]
FPS:            [ Original ✓ ]  [ 60 ]  [ 30 ]  [ 24 ]
Audio:          [ AAC 320kbps ✓ ]  [ MP3 192kbps ]  [ Sin audio ]
Nombre archivo: [ cineedit_export.mp4           ]
Carpeta salida: [ C:\Users\...\Videos      📁 ]

[ CANCELAR ]                        [ ▶ EXPORTAR ]
```

- Barra de progreso de exportación en tiempo real (parseando la salida de FFmpeg stderr)
- Mostrar tiempo estimado restante
- Al finalizar: botón "Abrir carpeta" y "Reproducir"
- La exportación corre en proceso hijo separado (no bloquea la UI)

---

## ⚙️ DETALLES TÉCNICOS CRÍTICOS

### FFmpeg embebido
```javascript
// electron/ffmpeg-runner.ts
import { app } from 'electron'
import path from 'path'
import { spawn } from 'child_process'

const ffmpegPath = app.isPackaged
  ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
  : path.join(__dirname, '../../public/ffmpeg/ffmpeg.exe')
```

Descargar los binarios estáticos de FFmpeg para Windows desde: https://github.com/BtbN/FFmpeg-Builds/releases  
Usar la build: `ffmpeg-master-latest-win64-gpl.zip`  
Copiar `ffmpeg.exe` y `ffprobe.exe` a `public/ffmpeg/`

### IPC seguro (Electron)
```typescript
// electron/preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  runFFmpeg: (args: string[]) => ipcRenderer.invoke('ffmpeg:run', args),
  probeFile: (filePath: string) => ipcRenderer.invoke('ffmpeg:probe', filePath),
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (name: string) => ipcRenderer.invoke('dialog:saveFile', name),
  openFolder: (folderPath: string) => ipcRenderer.invoke('shell:openFolder', folderPath),
})
```

### Construcción del comando FFmpeg para exportación
```typescript
// Ejemplo de exportación con efectos apilados
function buildFFmpegExportCommand(project: Project, outputPath: string): string[] {
  const inputs: string[] = []
  const filterChain: string[] = []
  
  // 1. Inputs: todos los clips + audio externo
  project.tracks.video.forEach((clip, i) => {
    inputs.push('-i', clip.filePath)
  })
  if (project.tracks.audio) {
    inputs.push('-i', project.tracks.audio.filePath)
  }

  // 2. Filter complex: concatenar clips + efectos por clip
  // 3. Mezcla de audio
  // 4. Output settings
  
  return [
    ...inputs,
    '-filter_complex', buildFilterComplex(project),
    '-c:v', 'libx264',
    '-crf', String(project.export.quality),
    '-preset', 'slow',   // máxima calidad
    '-c:a', 'aac',
    '-b:a', '320k',
    '-movflags', '+faststart',  // streaming-friendly
    outputPath
  ]
}
```

### electron-builder.yml
```yaml
appId: com.cineedit.app
productName: CineEdit
directories:
  output: dist-electron
files:
  - "**/*"
  - "!src/**"
extraResources:
  - from: public/ffmpeg/
    to: ffmpeg/
    filter:
      - "ffmpeg.exe"
      - "ffprobe.exe"
win:
  target: nsis
  icon: public/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

---

## 🧩 ESTADO GLOBAL (Zustand)

```typescript
interface ProjectState {
  name: string
  clips: Clip[]           // todos los clips importados
  timeline: {
    video: TimelineClip[] // clips en la pista de video (ordenados)
    audio: TimelineClip[] // clips en la pista de audio
  }
  currentTime: number     // posición del scrubber en segundos
  duration: number        // duración total del proyecto
  selectedClipId: string | null
  isPlaying: boolean
  exportSettings: ExportSettings
}

interface TimelineClip {
  id: string
  sourceClipId: string
  startTime: number       // posición en el timeline
  duration: number
  trimStart: number       // trim desde el inicio del clip fuente
  trimEnd: number
  effects: Effect[]
  volume: number
}

interface Effect {
  id: string
  type: EffectType
  params: Record<string, number | string | boolean>
  enabled: boolean
}
```

---

## 🎹 ATAJOS DE TECLADO

| Atajo | Acción |
|---|---|
| `Space` | Play / Pause |
| `S` | Split clip en posición del scrubber |
| `Delete` | Eliminar clip seleccionado |
| `Ctrl+Z` | Deshacer |
| `Ctrl+Y` | Rehacer |
| `Ctrl+I` | Importar archivo |
| `Ctrl+E` | Abrir modal exportar |
| `←` / `→` | Frame anterior / siguiente |
| `Ctrl+←` / `Ctrl+→` | Saltar 5 segundos |
| `+` / `-` | Zoom in/out del timeline |

---

## 📦 SCRIPTS DE DESARROLLO

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "vite build && electron-builder",
    "build:win": "electron-builder --win",
    "download-ffmpeg": "node scripts/download-ffmpeg.js"
  }
}
```

Incluir un script `scripts/download-ffmpeg.js` que descargue automáticamente los binarios de FFmpeg desde GitHub releases y los coloque en `public/ffmpeg/`.

---

## ✅ CRITERIOS DE CALIDAD Y COMPLETITUD

La app se considera **terminada** cuando:

- [ ] Se puede importar un video y añadirlo al timeline con drag & drop
- [ ] El preview reproduce el video con los efectos aplicados en tiempo real
- [ ] Se puede recortar, cortar y reordenar clips en el timeline
- [ ] Se puede añadir una pista de música con control de volumen
- [ ] Todos los efectos listados funcionan correctamente (B&N, ruido, velocidad, etc.)
- [ ] La exportación produce un archivo `.mp4` de alta calidad con todos los efectos y audio mezclados
- [ ] La barra de progreso de exportación muestra avance real en tiempo real
- [ ] La app no se congela durante la exportación (corre en proceso separado)
- [ ] El diseño es oscuro, limpio y consistente con la paleta de colores definida
- [ ] Funciona offline, sin ninguna llamada a APIs externas
- [ ] El `.exe` instalable funciona en Windows 10 y 11

---

## 🚀 ORDEN DE IMPLEMENTACIÓN SUGERIDO

1. **Setup base**: Electron + React + Tailwind + estructura de proyecto
2. **FFmpeg bridge**: IPC para ejecutar FFmpeg, descargar binarios, probar con un comando simple
3. **Importar medios**: diálogo de archivos, extraer metadata, mostrar en MediaPanel
4. **Timeline básico**: añadir clips, visualizarlos, scrubber funcional
5. **Preview player**: reproducir el clip activo con `<video>` nativo
6. **Recorte y split**: trim handles, split con `S`, delete
7. **Efectos de video**: panel de efectos, aplicar filtros FFmpeg al preview
8. **Audio**: pista de música, volumen, fade in/out
9. **Exportación**: modal completo, comando FFmpeg final, barra de progreso
10. **Polish UI**: animaciones, transiciones, atajos de teclado, undo/redo

---

*Genera el proyecto completo, funcional y listo para ejecutar con `npm install && npm run dev`. Incluye todos los archivos necesarios.*