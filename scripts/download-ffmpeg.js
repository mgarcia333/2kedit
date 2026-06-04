#!/usr/bin/env node
// scripts/download-ffmpeg.js
// Downloads static FFmpeg binaries for Windows from BtbN/FFmpeg-Builds

const https = require('https')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const FFMPEG_DIR = path.join(__dirname, '../public/ffmpeg')
const RELEASES_URL = 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest'

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`  Downloading: ${url}`)
    const file = fs.createWriteStream(dest)
    const request = (reqUrl) => {
      https.get(reqUrl, { headers: { 'User-Agent': '2kedit-setup' } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          request(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${reqUrl}`))
          return
        }
        const total = parseInt(res.headers['content-length'] || '0')
        let downloaded = 0
        res.on('data', chunk => {
          downloaded += chunk.length
          if (total > 0) {
            const pct = Math.round(downloaded / total * 100)
            process.stdout.write(`\r  Progress: ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`)
          }
        })
        res.pipe(file)
        file.on('finish', () => { file.close(); console.log(''); resolve() })
      }).on('error', reject)
    }
    request(url)
  })
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': '2kedit-setup', 'Accept': 'application/vnd.github.v3+json' } }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

async function main() {
  console.log('\n2kedit - FFmpeg Downloader')
  console.log('================================\n')

  if (!fs.existsSync(FFMPEG_DIR)) {
    fs.mkdirSync(FFMPEG_DIR, { recursive: true })
  }

  const ffmpegExe = path.join(FFMPEG_DIR, 'ffmpeg.exe')
  const ffprobeExe = path.join(FFMPEG_DIR, 'ffprobe.exe')

  if (fs.existsSync(ffmpegExe) && fs.existsSync(ffprobeExe)) {
    console.log('FFmpeg binaries already exist in public/ffmpeg/')
    console.log('   Delete them and re-run this script to update.\n')
    return
  }

  console.log('Fetching latest FFmpeg release info...')
  const release = await fetchJson(RELEASES_URL)
  
  const asset = release.assets.find(a =>
    a.name.includes('win64') && a.name.includes('gpl') && a.name.endsWith('.zip') && !a.name.includes('shared')
  )

  if (!asset) {
    console.error('Could not find suitable FFmpeg Windows release.')
    console.log('\nManual download:')
    console.log('   1. Go to: https://github.com/BtbN/FFmpeg-Builds/releases')
    console.log('   2. Download: ffmpeg-master-latest-win64-gpl.zip')
    console.log('   3. Extract ffmpeg.exe and ffprobe.exe to: public/ffmpeg/')
    process.exit(1)
  }

  console.log(`Found release: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`)

  const zipPath = path.join(FFMPEG_DIR, 'ffmpeg-temp.zip')
  
  try {
    console.log('\nDownloading ZIP archive...')
    await downloadFile(asset.browser_download_url, zipPath)
    
    console.log('\nExtracting binaries...')
    
    // Try PowerShell extraction on Windows
    try {
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${FFMPEG_DIR}\\temp' -Force"`, { stdio: 'inherit' })
      
      // Find and copy the exe files
      const tempDir = path.join(FFMPEG_DIR, 'temp')
      const findExe = (dir, name) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isFile() && entry.name === name) return path.join(dir, entry.name)
          if (entry.isDirectory()) {
            const found = findExe(path.join(dir, entry.name), name)
            if (found) return found
          }
        }
        return null
      }
      
      const ffmpegSrc = findExe(tempDir, 'ffmpeg.exe')
      const ffprobeSrc = findExe(tempDir, 'ffprobe.exe')
      
      if (ffmpegSrc) { fs.copyFileSync(ffmpegSrc, ffmpegExe); console.log('  ffmpeg.exe extracted') }
      if (ffprobeSrc) { fs.copyFileSync(ffprobeSrc, ffprobeExe); console.log('  ffprobe.exe extracted') }
      
      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      console.log('\nAutomatic extraction failed.')
      console.log('   Please extract manually:')
      console.log(`   ZIP file: ${zipPath}`)
      console.log(`   Copy ffmpeg.exe and ffprobe.exe to: ${FFMPEG_DIR}`)
      return
    }
    
    // Remove zip
    fs.unlinkSync(zipPath)
    
    console.log('\nFFmpeg ready!')
    console.log(`   ffmpeg.exe  -> ${ffmpegExe}`)
    console.log(`   ffprobe.exe -> ${ffprobeExe}`)
    console.log('\nYou can now run: npm run dev\n')
    
  } catch (error) {
    console.error('\nDownload failed:', error.message)
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
    console.log('\nManual download instructions:')
    console.log('   1. Go to: https://github.com/BtbN/FFmpeg-Builds/releases')
    console.log('   2. Download: ffmpeg-master-latest-win64-gpl.zip')
    console.log('   3. Extract ffmpeg.exe and ffprobe.exe')
    console.log(`   4. Place them in: ${FFMPEG_DIR}`)
    process.exit(1)
  }
}

main().catch(console.error)
