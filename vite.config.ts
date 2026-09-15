import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

const isGithubPages = process.env.GITHUB_PAGES === 'true'
const appVersion = process.env.npm_package_version ?? '0.0.0'

// https://vite.dev/config/
export default defineConfig({
  base: isGithubPages ? '/image-grid-spliter/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server:{
    port: 62313,
    host: "0.0.0.0",
    allowedHosts: true,
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Image Grid Spliter',
        short_name: 'GridSpliter',
        description: '图片网格裁切 PWA，支持批量下载与离线使用。',
        // 亮暗双主题：manifest 的 theme_color 是静态的无法随主题切换，故不声明，
        // 让浏览器回退读取文档 <meta name="theme-color">（预启动脚本按主题写入，
        // useColorScheme 运行时持续更新）。background_color 仅用于启动画面，保留深色默认。
        background_color: '#0f1a20',
        display: 'standalone',
        start_url: '.',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'igs.svg',
            sizes: '96x96',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
