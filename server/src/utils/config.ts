export interface LansendConfig {
  sharedDirectory: string
  uploadPassword: string | null
  unDownload: boolean
  unUpload: boolean
  chatEnabled: boolean
}

export function createConfig(options: {
  directory: string
  uploadPassword: string | null
  hideDownload: boolean
  disableUpload: boolean
  chat: boolean
}): LansendConfig {
  return {
    sharedDirectory: options.directory,
    uploadPassword: options.uploadPassword,
    unDownload: options.hideDownload,
    unUpload: options.disableUpload,
    chatEnabled: options.chat,
  }
}