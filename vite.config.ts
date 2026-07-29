import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  // Pre-bundle the Tauri API subpaths at startup. They are only reached through
  // lazily-loaded route chunks, so without this Vite discovers them mid-session
  // on first navigation and re-optimizes — which makes the in-flight dynamic
  // import fail ("Outdated Optimize Dep" 504 → Failed to fetch module).
  optimizeDeps: {
    include: [
      '@tauri-apps/api/core',
      '@tauri-apps/api/event',
      '@tauri-apps/api/webview',
      '@tauri-apps/api/window',
    ],
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        overlay: path.resolve(__dirname, 'overlay.html'),
      },
      output: {
        // Split big, rarely-changing vendor libs into their own chunks so they
        // download in parallel with the entry and stay cached across app
        // updates (only the app chunk changes on a normal deploy).
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-dom') || id.includes('/scheduler/')) return 'react-vendor'
          if (id.includes('framer-motion')) return 'framer-motion'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('@dnd-kit')) return 'dnd-kit'
        },
      },
    },
  },
})
