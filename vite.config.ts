import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['hormiga-skema.png', 'logo-skema.png'],
      manifest: {
        name: 'SKEMA — Asistente de Dirección',
        short_name: 'SKEMA',
        description: 'Asistente personal de dirección para estudios de arquitectura e ingeniería',
        theme_color: '#171717',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/hormiga-skema.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/hormiga-skema.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
