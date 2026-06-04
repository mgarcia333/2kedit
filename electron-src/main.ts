import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'

// Keep a global reference to prevent GC
let mainWindow: BrowserWindow | null = null
let ffmpegProcess: ChildProcess | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function getFFmpegPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
  }
  return path.join(__dirname, '../public/ffmpeg/ffmpeg.exe')
}

function getFFprobePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ffmpeg', 'ffprobe.exe')
  }
  return path.join(__dirname, '../public/ffmpeg/ffprobe.exe')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#0A0A0C',
    titleBarStyle: 'hidden',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow local file access for video preview
    },
    icon: path.join(__dirname, '../../public/icon.ico'),
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Window control IPC
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window:close', () => mainWindow?.close())

// File dialog IPC
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Media Files',
        extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'aac', 'flac', 'm4a'],
      },
      { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'aac', 'flac', 'm4a'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('dialog:saveFile', async (_, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName,
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] },
      { name: 'MOV Video', extensions: ['mov'] },
      { name: 'WebM Video', extensions: ['webm'] },
    ],
  })
  return result.canceled ? null : result.filePath
})

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

// Shell operations
ipcMain.handle('shell:openFolder', async (_, folderPath: string) => {
  await shell.openPath(folderPath)
})

ipcMain.handle('shell:openFile', async (_, filePath: string) => {
  await shell.openPath(filePath)
})

// FFprobe IPC
ipcMain.handle('ffmpeg:probe', async (_, filePath: string) => {
  return new Promise((resolve, reject) => {
    const ffprobePath = getFFprobePath()

    if (!fs.existsSync(ffprobePath)) {
      reject(new Error(`FFprobe not found at: ${ffprobePath}. Run "npm run download-ffmpeg" first.`))
      return
    }

    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]

    let output = ''
    let errorOutput = ''

    const proc = spawn(ffprobePath, args)
    proc.stdout.on('data', (data: Buffer) => { output += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { errorOutput += data.toString() })
    proc.on('close', (code: number) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(output))
        } catch (e) {
          reject(new Error(`Failed to parse ffprobe output: ${e}`))
        }
      } else {
        reject(new Error(`FFprobe exited with code ${code}: ${errorOutput}`))
      }
    })
    proc.on('error', (err: Error) => reject(err))
  })
})

// FFmpeg run IPC (for export)
ipcMain.handle('ffmpeg:run', async (event, args: string[]) => {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFFmpegPath()

    if (!fs.existsSync(ffmpegPath)) {
      reject(new Error(`FFmpeg not found at: ${ffmpegPath}. Run "npm run download-ffmpeg" first.`))
      return
    }

    let errorOutput = ''

    ffmpegProcess = spawn(ffmpegPath, args)

    ffmpegProcess.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString()
      errorOutput += chunk
      // Send progress updates to renderer
      event.sender.send('ffmpeg:progress', chunk)
    })

    ffmpegProcess.stdout?.on('data', (data: Buffer) => {
      event.sender.send('ffmpeg:stdout', data.toString())
    })

    ffmpegProcess.on('close', (code: number) => {
      ffmpegProcess = null
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: errorOutput })
      }
    })

    ffmpegProcess.on('error', (err: Error) => {
      ffmpegProcess = null
      reject(err)
    })
  })
})

// Cancel FFmpeg export
ipcMain.handle('ffmpeg:cancel', async () => {
  if (ffmpegProcess) {
    ffmpegProcess.kill()
    ffmpegProcess = null
    return true
  }
  return false
})

// Generate thumbnail via FFmpeg
ipcMain.handle('ffmpeg:thumbnail', async (_, filePath: string, outputPath: string, time: number = 0) => {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFFmpegPath()

    if (!fs.existsSync(ffmpegPath)) {
      reject(new Error(`FFmpeg not found`))
      return
    }

    const args = [
      '-ss', String(time),
      '-i', filePath,
      '-vframes', '1',
      '-vf', 'scale=320:-1',
      '-y',
      outputPath,
    ]

    const proc = spawn(ffmpegPath, args)
    proc.on('close', (code: number) => {
      resolve(code === 0)
    })
    proc.on('error', (err: Error) => reject(err))
  })
})

// Get temp dir for thumbnails
ipcMain.handle('app:getTempDir', () => {
  const tempDir = path.join(app.getPath('temp'), '2kedit-thumbnails')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }
  return tempDir
})

// Check FFmpeg availability
ipcMain.handle('ffmpeg:check', () => {
  const ffmpegPath = getFFmpegPath()
  const ffprobePath = getFFprobePath()
  return {
    ffmpeg: fs.existsSync(ffmpegPath),
    ffprobe: fs.existsSync(ffprobePath),
    ffmpegPath,
    ffprobePath,
  }
})
