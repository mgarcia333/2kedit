# 2kedit

2kedit es un editor de video de escritorio local para Windows con estetica cinematografica 2K. Corre 100% sin conexion a internet, usando FFmpeg embebido para el procesamiento de video profesional.

---

## Caracteristicas

| Categoria | Funcionalidades |
|-----------|----------------|
| Importacion | Drag & drop, dialogo nativo, soporte MP4/MOV/AVI/MKV/WebM/MP3/WAV/AAC/FLAC |
| Timeline | 2 pistas (video + audio), clips arrastrables, zoom, scrubber con timecode |
| Recorte | Trim handles, Split (S), Delete, eliminacion de huecos |
| Preview | Reproduccion nativa HTML5, controles completos, barra de progreso con filtros CSS en vivo |
| Efectos | 10 filtros FFmpeg apilables con controles en tiempo real y vista previa |
| Audio | Volumen por pista, fade in/out, mute, mezcla de audio en exportacion |
| Exportacion | MP4/MOV/WebM, multiples resoluciones y calidades, barra de progreso en tiempo real |
| Undo/Redo | Historial completo de 50 pasos (Ctrl+Z / Ctrl+Y) |

---

## Instalacion y Primer Uso

### Prerrequisitos

- Node.js 18+
- Windows 10 o 11 (64-bit)

### Paso 1 — Clonar o descargar el proyecto

```bash
git clone <url-del-repo> 2kedit
cd 2kedit
```

### Paso 2 — Instalar dependencias

```bash
npm install
```

### Paso 3 — Descargar FFmpeg (obligatorio)

FFmpeg es el motor de procesamiento de video. El script descarga automaticamente los binarios estaticos oficiales para Windows:

```bash
npm run download-ffmpeg
```

Una vez descargado, la app funciona 100% offline.

### Paso 4 — Lanzar en modo desarrollo

```bash
npm run dev
```

---

## Guia de Uso

### Interfaz General

```
┌─────────────────────────────────────────────────────────────┐
│  TopBar: 2kedit | Nombre proyecto | [Importar] [Exportar]   │
├──────────────┬──────────────────────────┬───────────────────┤
│  Medios      │   Preview Player         │  Efectos          │
│  (clips      │   (video + controles)    │  (ajustes del     │
│   importados)│                          │   clip selecto)   │
├──────────────┴──────────────────────────┴───────────────────┤
│  Timeline: Video | Audio | Scrubber                         │
└─────────────────────────────────────────────────────────────┘
```

---

### 1. Importar Medios

Método A — Drag & Drop:
- Arrastra archivos de video/audio directamente al panel izquierdo "Medios"

Método B — Boton Importar:
- Clic en "+ Importar" en la barra superior (o Ctrl+I)
- Selecciona uno o varios archivos en el dialogo nativo de Windows

Formatos soportados:
- Video: .mp4, .mov, .avi, .mkv, .webm
- Audio: .mp3, .wav, .aac, .flac, .m4a

---

### 2. Anadir Clips al Timeline

- Doble clic en un clip del panel de medios para anadirlo al final del timeline
- Clic en "+" que aparece al pasar el cursor sobre el clip
- Arrastrar desde el panel de medios hasta la pista de video o audio

---

### 3. Trabajar en el Timeline

#### Seleccion y movimiento
- Clic en un clip del timeline para seleccionarlo
- Arrastrar el clip para moverlo horizontalmente

#### Recorte (Trim)
- Arrastrar los bordes izquierdo o derecho del clip seleccionado para recortarlo

#### Cortar (Split)
- Mueve el scrubber a la posicion deseada
- Pulsa S o el boton Cortar

#### Eliminar
- Selecciona un clip y pulsa Delete o el boton Eliminar

#### Eliminar huecos
- Boton [ ] (Gaps) en el encabezado del timeline para compactar los clips

#### Zoom del Timeline
- Rueda del raton + Ctrl
- Botones + / - en el encabezado del timeline

---

### 4. Preview

Controles del reproductor central:
- |<  Ir al inicio
- <  Frame anterior
- >  Play / Pause
- >  Frame siguiente
- >| Ir al final
- Barra de progreso interactiva

---

### 5. Efectos de Video

1. Selecciona un clip en el timeline
2. En el panel derecho "Efectos", haz clic en "+ Anadir efecto"
3. Elige el efecto

Efectos disponibles:
- Blanco y Negro
- Sepia
- Ruido de Pelicula
- Vineta
- Brillo / Contraste
- Saturacion
- Camara Lenta
- Camara Rapida
- Desenfoque
- Voltear Horizontal

Puedes activar/desactivar cada efecto con el interruptor lateral o eliminarlo con la "x".

---

### 6. Audio

En el panel "Efectos", seccion Audio:
- Volumen (0% a 200%)
- Fade In (segundos de entrada)
- Fade Out (segundos de salida)
- Silenciar (silencia el audio del clip)

---

### 7. Exportar

1. Clic en Exportar (o Ctrl+E)
2. Configura las opciones:
   - Formato: MP4, MOV, WebM
   - Resolucion: Original, 1080p, 720p, 480p
   - Calidad: Alta (CRF 18), Media (CRF 23), Web (CRF 28)
   - FPS: Original, 60, 30, 24
   - Audio: AAC 320kbps, MP3 192kbps, Sin audio
   - Nombre
   - Carpeta de salida
3. Clic en Exportar

---

## Atajos de Teclado

| Atajo | Accion |
|-------|--------|
| Espacio | Play / Pause |
| S | Cortar clip en posicion del scrubber |
| Delete | Eliminar clip seleccionado |
| Ctrl+Z | Deshacer |
| Ctrl+Y | Rehacer |
| Ctrl+I | Importar archivo |
| Ctrl+E | Abrir modal de exportacion |
| <- / -> | Frame anterior / siguiente |
| Ctrl+<- / Ctrl+-> | Saltar 5 segundos |
| + / - | Zoom in/out del timeline |

---

## Generar Instalador .exe

Para crear un instalador de Windows distribuible:

```bash
npm run build:win
```

El instalador se genera en `dist-electron/`.

---

## Estructura del Proyecto

```
2kedit/
├── electron-src/
│   ├── main.ts           # Proceso principal Electron
│   └── preload.ts        # Bridge seguro IPC
├── electron/             # Compilado de electron-src/
├── src/
│   ├── App.tsx           # Componente raiz
│   ├── App.css           # Estilos de todos los componentes
│   ├── index.css         # Sistema de diseño global
│   ├── components/
│   │   ├── TopBar.tsx
│   │   ├── MediaPanel.tsx
│   │   ├── PreviewPlayer.tsx
│   │   ├── Timeline.tsx
│   │   ├── EffectsPanel.tsx
│   │   ├── ExportModal.tsx
│   │   └── FFmpegWarning.tsx
│   ├── store/
│   │   └── useProjectStore.ts
│   ├── hooks/
│   │   └── useFFmpeg.ts
│   └── types/
│       └── project.ts
├── public/
│   └── ffmpeg/           # Binarios FFmpeg
├── scripts/
│   └── download-ffmpeg.js
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.electron.json
└── electron-builder.yml
```
