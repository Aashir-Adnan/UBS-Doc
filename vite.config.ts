import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mdx from '@mdx-js/rollup'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkDirective from 'remark-directive'
import path from 'node:path'
import { remarkAdmonitions, normalizeAdmonitionTitles } from './src/docs/remarkAdmonitions'
import { remarkDocLinks } from './src/docs/remarkDocLinks'

export default defineConfig({
  plugins: [
    // Source-level fixup, so it must precede the MDX compiler below.
    {
      name: 'docs-admonition-titles',
      enforce: 'pre' as const,
      transform(code: string, id: string) {
        if (!/\.mdx?$/.test(id.split('?')[0])) return null
        const out = normalizeAdmonitionTitles(code)
        return out === code ? null : { code: out, map: null }
      },
    },
    // Must run before react() so .md/.mdx are JSX by the time React sees them.
    {
      enforce: 'pre' as const,
      ...mdx({
        format: 'mdx', // parity: Docusaurus 3 parses .md as MDX too
        // `format` alone only widens the parser, not the extension allow-list:
        // with format 'mdx' @mdx-js accepts .mdx only, so .md would fall
        // through untransformed and reach the JS parser as raw markdown.
        mdxExtensions: ['.mdx', '.md'],
        include: /\.mdx?$/,
        providerImportSource: '@mdx-js/react',
        remarkPlugins: [
          remarkGfm,
          remarkFrontmatter,
          remarkMdxFrontmatter,
          remarkDirective,
          remarkAdmonitions,
          remarkDocLinks,
        ],
      }),
    },
    react(),
    tailwindcss(),
  ],
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
