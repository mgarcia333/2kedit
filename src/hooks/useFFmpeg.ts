import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useProjectStore } from '../store/useProjectStore'
import type { MediaClip, TimelineClip, FFprobeResult } from '../types/project'

export function useFFmpeg() {
  const store = useProjectStore()

  const probeAndImport = useCallback(async (filePaths: string[]) => {
    for (const filePath of filePaths) {
      try {
        const result: FFprobeResult = await window.electronAPI.probeFile(filePath)
        const videoStream = result.streams.find(s => s.codec_type === 'video')
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

    // Add video clip inputs
    for (const tc of allTimelineClips) {
      const sourceClip = clips.find(c => c.id === tc.sourceClipId)
      if (!sourceClip) continue
      args.push('-i', sourceClip.filePath)
      inputIndex++
    }

    // Add audio inputs
    for (const tc of audioTimelineClips) {
      const sourceClip = clips.find(c => c.id === tc.sourceClipId)
      if (!sourceClip) continue
      args.push('-i', sourceClip.filePath)
      inputIndex++
    }

    // Build filter complex
    const videoFilters: string[] = []
    let vidIdx = 0

    for (let i = 0; i < allTimelineClips.length; i++) {
      const tc = allTimelineClips[i]
      const sourceClip = clips.find(c => c.id === tc.sourceClipId)
      if (!sourceClip) continue

      const clipEffects = buildClipFilters(tc)
      const trimFilter = `trim=${tc.trimStart}:${tc.trimStart + tc.duration},setpts=PTS-STARTPTS`

      if (clipEffects.length > 0) {
        filterParts.push(`[${i}:v]${trimFilter},${clipEffects.join(',')}[v${i}]`)
      } else {
        filterParts.push(`[${i}:v]${trimFilter}[v${i}]`)
      }
      videoFilters.push(`[v${i}]`)
      vidIdx++
    }

    // Concatenate video clips
    if (videoFilters.length > 1) {
      filterParts.push(`${videoFilters.join('')}concat=n=${videoFilters.length}:v=1:a=0[vout]`)
    } else if (videoFilters.length === 1) {
      filterParts.push(`${videoFilters[0]}copy[vout]`)
    }

    // Handle audio
    let audioMixParts: string[] = []
    const numVideoClips = allTimelineClips.length

    // Video clip audio tracks
    for (let i = 0; i < allTimelineClips.length; i++) {
      const tc = allTimelineClips[i]
      const sourceClip = clips.find(c => c.id === tc.sourceClipId)
      if (!sourceClip || sourceClip.type !== 'video') continue
      if (tc.muted) continue

      const trimFilter = `atrim=${tc.trimStart}:${tc.trimStart + tc.duration},asetpts=PTS-STARTPTS`
      const volFilter = `volume=${tc.volume}`
      filterParts.push(`[${i}:a]${trimFilter},${volFilter}[va${i}]`)
      audioMixParts.push(`[va${i}]`)
    }

    // External audio tracks
    for (let i = 0; i < audioTimelineClips.length; i++) {
      const tc = audioTimelineClips[i]
      const globalIdx = numVideoClips + i
      const volFilter = `volume=${tc.volume}`
      const delayFilter = `adelay=${Math.round(tc.startTime * 1000)}|${Math.round(tc.startTime * 1000)}`
      filterParts.push(`[${globalIdx}:a]${volFilter},${delayFilter}[aa${i}]`)
      audioMixParts.push(`[aa${i}]`)
    }

    if (audioMixParts.length > 1) {
      filterParts.push(`${audioMixParts.join('')}amix=inputs=${audioMixParts.length}:normalize=0[aout]`)
    } else if (audioMixParts.length === 1) {
      filterParts.push(`${audioMixParts[0]}acopy[aout]`)
    }

    if (filterParts.length > 0) {
      args.push('-filter_complex', filterParts.join(';'))
      args.push('-map', '[vout]')
      if (audioMixParts.length > 0) {
        args.push('-map', '[aout]')
      }
    } else {
      args.push('-map', '0:v', '-map', '0:a?')
    }

    // Video codec settings
    args.push('-c:v', 'libx264')
    args.push('-crf', String(exportSettings.quality))
    args.push('-preset', 'slow')

    // Resolution
    if (exportSettings.resolution !== 'original') {
      const resMap = { '1080p': '1920:1080', '720p': '1280:720', '480p': '854:480' }
      const res = resMap[exportSettings.resolution]
      if (res) args.push('-vf', `scale=${res}:force_original_aspect_ratio=decrease`)
    }

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

  return { probeAndImport, addClipToTimeline, buildExportCommand }
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
      case 'slowMotion': {
        const speed = (effect.params.speed as number) || 0.5
        filters.push(`setpts=${1 / speed}*PTS`)
        break
      }
      case 'fastMotion': {
        const speed = (effect.params.speed as number) || 2
        filters.push(`setpts=${1 / speed}*PTS`)
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
