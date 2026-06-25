/**
 * 基础响应接口
 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface DirectoryItem {
  name: string
  path: string
  is_dir: boolean
  // 上传状态字段
  uploading?: boolean
  progress?: number
  status?: 'pending' | 'uploading' | 'completed' | 'error'
  error?: string
  size?: number
  speed?: string
  id?: string
}

export interface PathPart {
  name: string
  path: string
}

export interface DirectoryData {
  require_password: boolean
  relative_path: string
  share_name: string
  path_parts: PathPart[]
  items: DirectoryItem[]
}

export interface VerifyUploadPasswordResponse {
  success: boolean
  error?: string
}

export interface PreviewFile {
  content?: string
  is_image?: boolean
  is_video?: boolean
  is_binary?: boolean
  path: string
  name: string
  error?: string
}

export interface UploadFileResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface ChatMessage {
  id: number
  ip: string
  message: string
  timestamp: string
}

export interface ChatMessagesResponse {
  messages: ChatMessage[]
  current_ip?: string
}

export interface LansendConfig {
  un_download: boolean
  un_upload: boolean
  chat_enabled: boolean
}

export interface SpeedTestResult {
  ping: number
  download: number
  upload: number
  status: 'idle' | 'pinging' | 'downloading' | 'uploading' | 'completed' | 'error'
  error?: string
}

/** 活跃 Tab 类型 */
export type LansendActiveTab = 'directory' | 'preview' | 'empty' | 'chat' | 'upload-details'

/** 上传任务 */
export interface UploadTask {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'completed' | 'error'
  progress: number
  loaded: number
  total: number
  targetPath: string
  completedAt?: number
  error?: string
  cancel?: () => void
}

/** 上传队列参数 */
export interface UploadQueueParams {
  requirePassword: boolean
  getPassword: () => string
  onWrongPassword?: () => void
  onRefresh?: () => void
}
