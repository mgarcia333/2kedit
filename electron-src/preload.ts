import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // File dialogs
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (name: string) => ipcRenderer.invoke('dialog:saveFile', name),
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  openMediaFolderDialog: () => ipcRenderer.invoke('dialog:openMediaFolder'),
  saveProject: (data: string) => ipcRenderer.invoke('dialog:saveProject', data),
  loadProject: () => ipcRenderer.invoke('dialog:loadProject'),

  // Shell
  openFolder: (folderPath: string) => ipcRenderer.invoke('shell:openFolder', folderPath),
  openFile: (filePath: string) => ipcRenderer.invoke('shell:openFile', filePath),

  // FFmpeg
  probeFile: (filePath: string) => ipcRenderer.invoke('ffmpeg:probe', filePath),
  runFFmpeg: (args: string[]) => ipcRenderer.invoke('ffmpeg:run', args),
  cancelFFmpeg: () => ipcRenderer.invoke('ffmpeg:cancel'),
  generateThumbnail: (filePath: string, outputPath: string, time?: number) =>
    ipcRenderer.invoke('ffmpeg:thumbnail', filePath, outputPath, time),
  checkFFmpeg: () => ipcRenderer.invoke('ffmpeg:check'),

  // App
  getTempDir: () => ipcRenderer.invoke('app:getTempDir'),

  // Event listeners
  onFFmpegProgress: (callback: (data: string) => void) => {
    ipcRenderer.on('ffmpeg:progress', (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('ffmpeg:progress')
  },
  onFFmpegStdout: (callback: (data: string) => void) => {
    ipcRenderer.on('ffmpeg:stdout', (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('ffmpeg:stdout')
  },
})
