import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: true,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../enrichment/src/types'),
      '@': path.resolve(__dirname, './src'),
    },
  },
})
