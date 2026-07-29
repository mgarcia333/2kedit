import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useProjectStore } from '../store/useProjectStore'
import type { MediaClip, TimelineClip, FFprobeResult } from '../types/project'
import { probeFileWeb, generateThumbnailWeb } from '../lib/webMedia'
import { loadFFmpeg, setFFmpegProgressCallback, terminateFFmpeg, fetchFile } from '../lib/webFFmpeg'
import { registerWebFile, getWebFile } from '../lib/webFileRegistry'

export function useFFmpeg() {
  const store = useProjectStore()

  const probeAndImport = useCallback(async (filePaths: string[]) => {
    for (const filePath of filePaths) {
      try {
        const result: FFprobeResult = await window.electronAPI.probeFile(filePath)
        const videoStream = result.streams.find(s => s.codec_type === 'video' && s.disposition?.attached_pic !== 1)
        const audioStream = result.streams.find(s => s.codec_type === 'audio')

        const duration = parseFloat(result.format.duration) || 0
        const type = videoStream ? 'video' as const : 'audio' as const

        const fileName = filePath.split(/[\\/]/).pop() || filePath

        const clip: MediaClip = {
          id: uuidv4(),
          filePath,
          fileName,
          type,
          duration,
          width: videoStream?.width,
          height: videoStream?.height,
          fps: videoStream?.r_frame_rate
            ? evalFrameRate(videoStream.r_frame_rate)
            : undefined,
          format: result.format.format_name,
          bitrate: parseInt(result.format.bit_rate || '0'),
          videoCodec: videoStream?.codec_name,
          audioCodec: audioStream?.codec_name,
          sampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate) : undefined,
          channels: audioStream?.channels,
        }

        store.addClip(clip)

        // Generate thumbnail for video clips
        if (clip.type === 'video') {
          const tempDir = store.tempDir || await window.electronAPI.getTempDir()
          const thumbPath = `${tempDir}\\thumb_${clip.id}.jpg`
          const success = await window.electronAPI.generateThumbnail(filePath, thumbPath, 0)
          if (success) {
            store.addClip({ ...clip, thumbnailPath: thumbPath })
            // Update the existing clip with thumbnail
            store.removeClip(clip.id)
            store.addClip({ ...clip, thumbnailPath: `file://${thumbPath}` })
          }
        }
      } catch (error) {
        console.error(`Failed to probe file: ${filePath}`, error)
      }
    }
  }, [store])

  const probeAndImportFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      try {
        const info = await probeFileWeb(file)
        const id = uuidv4()
        const ext = (file.name.split('.').pop() || (info.type === 'video' ? 'mp4' : 'mp3')).toLowerCase()
        const previewUrl = URL.createObjectURL(file)
        registerWebFile(id, file)

        const thumbnailPath = info.type === 'video' ? await generateThumbnailWeb(file) : undefined

        const clip: MediaClip = {
          id,
          filePath: `${id}.${ext}`,
          fileName: file.name,
          type: info.type,
          duration: info.duration,
          width: info.width,
          height: info.height,
          format: file.type || ext,
          thumbnailPath,
          previewUrl,
        }
        store.addClip(clip)
      } catch (error) {
        console.error(`Failed to import file: ${file.name}`, error)
      }
    }
  }, [store])

  /** Runs an ffmpeg CLI command (as produced by buildExportCommand) in-browser via ffmpeg.wasm. */
  const runWebExport = useCallback(async (
    args: string[],
    outputFileName: string,
    onProgress: (ratio: number) => void,
  ): Promise<Uint8Array> => {
    const ffmpeg = await loadFFmpeg()
    setFFmpegProgressCallback(onProgress)

    const usedSourceIds = new Set<string>()
    for (const tc of [...store.timeline.video, ...store.timeline.audio]) {
      usedSourceIds.add(tc.sourceClipId)
    }

    const written: string[] = []
    try {
      for (const id of usedSourceIds) {
        const sourceClip = store.clips.find(c => c.id === id)
        if (!sourceClip) continue
        const file = getWebFile(id)
        if (!file) throw new Error(`"${sourceClip.fileName}" ya no esta disponible en memoria. Vuelve a importarlo.`)
        await ffmpeg.writeFile(sourceClip.filePath, await fetchFile(file))
        written.push(sourceClip.filePath)
      }

      const code = await ffmpeg.exec(args)
      if (code !== 0) throw new Error(`FFmpeg termino con codigo ${code}`)

      const data = await ffmpeg.readFile(outputFileName)
      return Uint8Array.from(data as Uint8Array)
    } finally {
      setFFmpegProgressCallback(null)
      for (const path of written) {
        try { await ffmpeg.deleteFile(path) } catch { /* best effort cleanup */ }
      }
    }
  }, [store])

  const cancelWebExport = useCallback(() => {
    terminateFFmpeg()
  }, [])

  const addClipToTimeline = useCallback((clip: MediaClip) => {
    const track = clip.type === 'audio' ? 'audio' : 'video'
    const existingClips = track === 'video'
      ? store.timeline.video
      : store.timeline.audio

    // Find the end of all existing clips in the track
    const startTime = existingClips.length === 0
      ? 0
      : Math.max(...existingClips.map(c => c.startTime + c.duration))

    const timelineClip: TimelineClip = {
      id: uuidv4(),
      sourceClipId: clip.id,
      startTime,
      duration: clip.duration,
      trimStart: 0,
      trimEnd: 0,
      effects: [],
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      playbackRate: 1,
      track,
    }

    store.addToTimeline(timelineClip)
    return timelineClip
  }, [store])

  const buildExportCommand = useCallback((outputPath: string) => {
    const { timeline, exportSettings, clips } = store
    const allTimelineClips = [...timeline.video].sort((a, b) => a.startTime - b.startTime)
    const audioTimelineClips = [...timeline.audio].sort((a, b) => a.startTime - b.startTime)

    if (allTimelineClips.length === 0) return null

    const args: string[] = ['-y'] // Overwrite output
    const filterParts: string[] = []
    let inputIndex = 0
    const clipInputIndex: Record<string, number> = {}

    // Add video clip inputs
    for (const tc of allTimelineClips) {
      const sourceClip = clips.find(c => c.id === tc.sourceClipId)
      if (!sourceClip) continue
      args.push('-i', sourceClip.filePath)
      clipInputIndex[tc.id] = inputIndex
      inputIndex++
    }

    // Add audio inputs
    for (const tc of audioTimelineClips) {
      const sourceClip = clips.find(c => c.id === tc.sourceClipId)
      if (!sourceClip) continue
      args.push('-i', sourceClip.filePath)
      clipInputIndex[tc.id] = inputIndex
      inputIndex++
    }

    // Build filter complex
    const videoFilters: string[] = []
    let vidIdx = 0

    for (let i = 0; i < allTimelineClips.length; i++) {
      const tc = allTimelineClips[i]
      const sourceClip = clips.find(c => c.id === tc.sourceClipId)
      if (!sourceClip || clipInputIndex[tc.id] === undefined) continue
      const streamIdx = clipInputIndex[tc.id]

      const clipEffects = buildClipFilters(tc)
      const sourceDuration = tc.duration * (tc.playbackRate || 1)
      const trimFilter = `trim=${tc.trimStart}:${tc.trimStart + sourceDuration},setpts=PTS-STARTPTS`
      const speedFilter = (tc.playbackRate && tc.playbackRate !== 1) ? `,setpts=${1 / tc.playbackRate}*PTS` : ''

      if (clipEffects.length > 0) {
        filterParts.push(`[${streamIdx}:v]${trimFilter}${speedFilter},${clipEffects.join(',')}[v${i}]`)
      } else {
        filterParts.push(`[${streamIdx}:v]${trimFilter}${speedFilter}[v${i}]`)
      }
      videoFilters.push(`[v${i}]`)
      vidIdx++
    }

    // Concatenate video clips
    let finalVideoMap = ''
    if (videoFilters.length > 1) {
      filterParts.push(`${videoFilters.join('')}concat=n=${videoFilters.length}:v=1:a=0[vout]`)
      finalVideoMap = '[vout]'
    } else if (videoFilters.length === 1) {
      finalVideoMap = videoFilters[0]
    }

    // Handle audio
    let audioMixParts: string[] = []

    // Video clip audio tracks
    for (let i = 0; i < allTimelineClips.length; i++) {
      const tc = allTimelineClips[i]
      const sourceClip = clips.find(c => c.id === tc.sourceClipId)
      if (!sourceClip || sourceClip.type !== 'video' || clipInputIndex[tc.id] === undefined) continue
      if (tc.muted || !sourceClip.audioCodec) continue // Check if it actually has an audio track!

      const streamIdx = clipInputIndex[tc.id]
      const sourceDuration = tc.duration * (tc.playbackRate || 1)
      const trimFilter = `atrim=${tc.trimStart}:${tc.trimStart + sourceDuration},asetpts=PTS-STARTPTS`
      const speedFilter = (tc.playbackRate && tc.playbackRate !== 1) ? `,atempo=${tc.playbackRate}` : ''
      const volFilter = `volume=${tc.volume}`
      const delayFilter = tc.startTime > 0 ? `,adelay=${Math.round(tc.startTime * 1000)}|${Math.round(tc.startTime * 1000)}` : ''
      filterParts.push(`[${streamIdx}:a]${trimFilter}${speedFilter},${volFilter}${delayFilter}[va${i}]`)
      audioMixParts.push(`[va${i}]`)
    }

    // External audio tracks
    for (let i = 0; i < audioTimelineClips.length; i++) {
      const tc = audioTimelineClips[i]
      const sourceClip = clips.find(c => c.id === tc.sourceClipId)
      if (!sourceClip || clipInputIndex[tc.id] === undefined) continue

      const streamIdx = clipInputIndex[tc.id]
      const sourceDuration = tc.duration * (tc.playbackRate || 1)
      const trimFilter = `atrim=${tc.trimStart}:${tc.trimStart + sourceDuration},asetpts=PTS-STARTPTS`
      const speedFilter = (tc.playbackRate && tc.playbackRate !== 1) ? `,atempo=${tc.playbackRate}` : ''
      const volFilter = `volume=${tc.volume}`
      const delayFilter = tc.startTime > 0 ? `,adelay=${Math.round(tc.startTime * 1000)}|${Math.round(tc.startTime * 1000)}` : ''
      filterParts.push(`[${streamIdx}:a]${trimFilter}${speedFilter},${volFilter}${delayFilter}[aa${i}]`)
      audioMixParts.push(`[aa${i}]`)
    }

    let finalAudioMap = ''
    if (audioMixParts.length > 1) {
      filterParts.push(`${audioMixParts.join('')}amix=inputs=${audioMixParts.length}:normalize=0[aout]`)
      finalAudioMap = '[aout]'
    } else if (audioMixParts.length === 1) {
      finalAudioMap = audioMixParts[0]
    }

    // Resolution inside filter complex to avoid -vf conflict
    if ((exportSettings.resolution !== 'original' || store.aspectRatio !== 'original') && finalVideoMap) {
      let targetH = 1080
      let targetW = 1920

      if (exportSettings.resolution !== 'original') {
        targetH = { '1080p': 1080, '720p': 720, '480p': 480 }[exportSettings.resolution] || 1080
      } else {
        const firstVid = clips.find(c => c.type === 'video' && c.height)
        if (firstVid && firstVid.height) targetH = firstVid.height
      }

      if (store.aspectRatio === '9:16') targetW = Math.round(targetH * 9 / 16)
      else if (store.aspectRatio === '4:3') targetW = Math.round(targetH * 4 / 3)
      else if (store.aspectRatio === '1:1') targetW = targetH
      else if (store.aspectRatio === '16:9') targetW = Math.round(targetH * 16 / 9)
      else {
        // original aspect ratio, original resolution
        const firstVid = clips.find(c => c.type === 'video' && c.width)
        if (firstVid && firstVid.width) targetW = firstVid.width
        else targetW = Math.round(targetH * 16 / 9) // Fallback
      }

      // Ensure even dimensions
      if (targetW % 2 !== 0) targetW += 1
      if (targetH % 2 !== 0) targetH += 1

      filterParts.push(`${finalVideoMap}scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:black[vout_scaled]`)
      finalVideoMap = '[vout_scaled]'
    }

    // Add drawtext filters for text overlays
    if (store.timeline.text.length > 0 && finalVideoMap) {
      const textFilters: string[] = []
      let lastMap = finalVideoMap
      for (let i = 0; i < store.timeline.text.length; i++) {
        const tc = store.timeline.text[i]
        // Escape text for drawtext filter
        const escapedText = tc.text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
        const enableStr = `enable='between(t,${tc.startTime},${tc.startTime + tc.duration})'`
        const xStr = `(w*${tc.x}/100)-(text_w/2)`
        const yStr = `(h*${tc.y}/100)-(text_h/2)`
        const fontStr = tc.fontFamily ? `:font='${tc.fontFamily}'` : ''
        const drawtextStr = `drawtext=text='${escapedText}'${fontStr}:x=${xStr}:y=${yStr}:fontsize=${tc.fontSize}:fontcolor=${tc.color}:shadowcolor=black@0.8:shadowx=0:shadowy=2:${enableStr}`
        
        const nextMap = `[vout_text${i}]`
        filterParts.push(`${lastMap}${drawtextStr}${nextMap}`)
        lastMap = nextMap
      }
      finalVideoMap = lastMap
    }

    if (filterParts.length > 0) {
      args.push('-filter_complex', filterParts.join(';'))
    }

    if (finalVideoMap) {
      args.push('-map', finalVideoMap)
    }
    if (finalAudioMap) {
      args.push('-map', finalAudioMap)
    }

    // Video codec settings
    args.push('-c:v', 'libx264')
    args.push('-crf', String(exportSettings.quality))
    args.push('-preset', 'slow')

    // FPS
    if (exportSettings.fps !== 'original') {
      args.push('-r', String(exportSettings.fps))
    }

    // Audio codec
    if (exportSettings.audio === 'aac_320') {
      args.push('-c:a', 'aac', '-b:a', '320k')
    } else if (exportSettings.audio === 'mp3_192') {
      args.push('-c:a', 'libmp3lame', '-b:a', '192k')
    } else {
      args.push('-an')
    }

    args.push('-movflags', '+faststart')
    args.push(outputPath)

    return args
  }, [store])

  return { probeAndImport, probeAndImportFiles, addClipToTimeline, buildExportCommand, runWebExport, cancelWebExport }
}

function evalFrameRate(fpsStr: string): number {
  if (!fpsStr || !fpsStr.includes('/')) return parseFloat(fpsStr) || 30
  const [num, den] = fpsStr.split('/').map(Number)
  return den ? Math.round((num / den) * 100) / 100 : 30
}

function buildClipFilters(clip: TimelineClip): string[] {
  const filters: string[] = []

  for (const effect of clip.effects) {
    if (!effect.enabled) continue

    switch (effect.type) {
      case 'blackAndWhite':
        filters.push('hue=s=0')
        break
      case 'filmNoise': {
        const intensity = (effect.params.intensity as number) || 20
        filters.push(`noise=alls=${intensity}:allf=t+u`)
        break
      }
      case 'noise': {
        const intensity = (effect.params.intensity as number) || 50
        // Use higher strength noise for digital static TV noise
        filters.push(`noise=alls=${intensity}:allf=t+u`)
        break
      }
      case 'vignette': {
        const intensity = (effect.params.intensity as number) || 0.5
        filters.push(`vignette=PI/${Math.round(1 / intensity * 2)}`)
        break
      }
      case 'brightness': {
        const brightness = (effect.params.brightness as number) || 0
        const contrast = (effect.params.contrast as number) || 1
        filters.push(`eq=brightness=${brightness}:contrast=${contrast}`)
        break
      }
      case 'saturation': {
        const sat = (effect.params.saturation as number) ?? 1
        filters.push(`hue=s=${sat}`)
        break
      }
      case 'sepia':
        filters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0')
        break
      case 'blur': {
        const radius = (effect.params.radius as number) || 2
        filters.push(`boxblur=${radius}:${radius}`)
        break
      }
      case 'flipHorizontal':
        filters.push('hflip')
        break
    }
  }

  return filters
}
