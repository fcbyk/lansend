import type { LansendActiveTab } from './types'

/** Tab 常量，消除魔法字符串 */
export const TAB: Record<string, LansendActiveTab> = {
  EMPTY: 'empty',
  DIRECTORY: 'directory',
  PREVIEW: 'preview',
  CHAT: 'chat',
  UPLOAD_DETAILS: 'upload-details',
}
