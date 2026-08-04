import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// MDX plugin is added in the docs task; keep this config minimal until then.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@site': path.resolve(__dirname, '.'),
      '@': path.resolve(__dirname, 'src'),
      '@theme/Layout': path.resolve(__dirname, 'src/compat/Layout.tsx'),
      '@docusaurus/Link': path.resolve(__dirname, 'src/compat/Link.tsx'),
    },
  },
  build: { outDir: 'dist' },
})
