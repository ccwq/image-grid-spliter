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
        theme_color: '#0f172a',
        background_color: '#0f172a',
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
