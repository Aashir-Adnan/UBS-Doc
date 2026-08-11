import path from 'node:path'
import { defineConfig } from 'vitest/config'

// The alias block mirrors vite.config.ts. Without it, any module reached by a
// test that imports through '@site/...' (most of src/components/portal) fails
// to resolve, which previously limited tests to modules with no such imports.
export default defineConfig({
  resolve: {
    alias: {
      '@site': path.resolve(__dirname, '.'),
      '@': path.resolve(__dirname, 'src'),
      '@theme/Layout': path.resolve(__dirname, 'src/compat/Layout.tsx'),
      '@docusaurus/Link': path.resolve(__dirname, 'src/compat/Link.tsx'),
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx,js}'] },
})
