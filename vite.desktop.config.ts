import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 桌面端（壳 B）专用构建：
//
//   pnpm build:desktop
//
// 产物直接落进 Go 的 embed 目录，和壳 A 的 server/embeddist/dist 是同一套路子。
// 注意 outDir 相对 root 解析，不是相对仓库根。
export default defineConfig({
  root: 'desktop-web',
  // Wails 从根路径提供资源，相对 base 让子路径加载（如 ?window=qr）也能工作
  base: './',
  plugins: [react()],
  build: {
    outDir: '../server/desktop/frontend/dist',
    emptyOutDir: true,
    rollupOptions: {
      // @wailsio/runtime 由 Wails 运行时注入到 /wails/runtime.js，
      // 这里保持 external，交给 index.html 的 importmap 解析。
      external: ['@wailsio/runtime'],
    },
  },
})
