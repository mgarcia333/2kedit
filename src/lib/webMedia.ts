// Browser-native replacements for the Electron ffprobe/ffmpeg-thumbnail IPC calls.
// Used only when running outside Electron (window.electronAPI is undefined).

export interface WebProbeResult {
  type: 'video' | 'audio'
  duration: number
  width?: number
  height?: number
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(file.name)
}

/** Some browser-produced files report duration=Infinity until seeked once. */
function readMediaDuration(el: HTMLMediaElement): Promise<number> {
  return new Promise(resolve => {
    if (isFinite(el.duration) && el.duration > 0) { resolve(el.duration); return }
    const onDurationChange = () => {
      if (isFinite(el.duration) && el.duration > 0) {
        el.removeEventListener('durationchange', onDurationChange)
        el.currentTime = 0
        resolve(el.duration)
      }
    }
    el.addEventListener('durationchange', onDurationChange)
    el.currentTime = Number.MAX_SAFE_INTEGER
    setTimeout(() => {
      el.removeEventListener('durationchange', onDurationChange)
      resolve(isFinite(el.duration) ? el.duration : 0)
    }, 3000)
  })
}

export function probeFileWeb(file: File): Promise<WebProbeResult> {
  const isVideo = isVideoFile(file)
  const url = URL.createObjectURL(file)

  return new Promise((resolve, reject) => {
    const el: HTMLVideoElement | HTMLAudioElement = document.createElement(isVideo ? 'video' : 'audio')
    el.preload = 'metadata'
    el.muted = true
    el.src = url

    const cleanup = () => URL.revokeObjectURL(url)

    el.onloadedmetadata = async () => {
      const duration = await readMediaDuration(el)
      cleanup()
      resolve({
        type: isVideo ? 'video' : 'audio',
        duration,
        width: isVideo ? (el as HTMLVideoElement).videoWidth : undefined,
        height: isVideo ? (el as HTMLVideoElement).videoHeight : undefined,
      })
    }
    el.onerror = () => {
      cleanup()
      reject(new Error(`No se pudo leer metadatos de ${file.name}`))
    }
  })
}

export function generateThumbnailWeb(file: File): Promise<string | undefined> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = url

    let settled = false
    const finish = (result?: string) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve(result)
    }

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 4)
    }
    video.onseeked = () => {
      try {
        const ratio = video.videoWidth && video.videoHeight ? video.videoHeight / video.videoWidth : 9 / 16
        const canvas = document.createElement('canvas')
        canvas.width = 240
        canvas.height = Math.round(240 * ratio)
        const ctx = canvas.getContext('2d')
        if (!ctx) { finish(undefined); return }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        finish(canvas.toDataURL('image/jpeg', 0.7))
      } catch {
        finish(undefined)
      }
    }
    video.onerror = () => finish(undefined)
    setTimeout(() => finish(undefined), 5000)
  })
}
