export function isVideoFileName(name: string): boolean {
  const lower = (name || '').toLowerCase()
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.ogg')
}

export interface FileWithSubdir {
  file: File
  subdir: string
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`
}

export function joinUploadPath(base: string, subdir: string): string {
  const b = (base || '').trim()
  const s = (subdir || '').trim()
  if (!b && !s) return ''
  if (!b) return s
  if (!s) return b
  return `${b}/${s}`.replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
}

function readEntriesAsync(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve as never, reject)
  })
}

export async function walkEntry(
  entry: FileSystemEntry,
  basePath: string,
  includeSelf: boolean,
): Promise<FileWithSubdir[]> {
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      ;(entry as FileSystemFileEntry).file(
        (file) => resolve([{ file, subdir: basePath }]),
        (error) => reject(error),
      )
    })
  }
  if (entry.isDirectory) {
    const dirPath = includeSelf ? `${basePath ? basePath + '/' : ''}${entry.name}` : basePath
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const result: FileWithSubdir[] = []
    while (true) {
      const entries = await readEntriesAsync(reader)
      if (entries.length === 0) break
      for (const child of entries) {
        const childFiles = await walkEntry(child, dirPath, true)
        result.push(...childFiles)
      }
    }
    return result
  }
  return []
}

export async function extractFilesFromDataTransfer(event: DragEvent): Promise<FileWithSubdir[]> {
  const dt = event.dataTransfer
  if (!dt) return []
  const dtItems = dt.items
  const result: FileWithSubdir[] = []
  let usedEntries = false
  if (dtItems && dtItems.length > 0) {
    const entriesToProcess: FileSystemEntry[] = []
    const filesToProcess: FileWithSubdir[] = []
    for (let i = 0; i < dtItems.length; i++) {
      const item = dtItems[i]
      if (item.kind !== 'file') continue
      const anyItem = item as unknown as { webkitGetAsEntry?: () => FileSystemEntry | null }
      const entry = anyItem.webkitGetAsEntry ? anyItem.webkitGetAsEntry() : null
      if (entry) {
        usedEntries = true
        entriesToProcess.push(entry)
      } else {
        const file = item.getAsFile && item.getAsFile()
        if (file) {
          filesToProcess.push({ file, subdir: '' })
        }
      }
    }

    if (usedEntries) {
      for (const entry of entriesToProcess) {
        const files = await walkEntry(entry, '', entry.isDirectory)
        result.push(...files)
      }
      return result
    } else {
      result.push(...filesToProcess)
    }
  }

  if (usedEntries) return result
  const files: FileWithSubdir[] = []
  for (let i = 0; i < dt.files.length; i++) {
    files.push({ file: dt.files[i], subdir: '' })
  }
  return files
}
