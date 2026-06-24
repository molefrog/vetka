import { defineConfig } from 'bunup'
import { tailwindcss } from '@bunup/plugin-tailwindcss'
import { copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  outDir: 'dist',
  format: 'esm',
  target: 'browser',
  packages: 'bundle',
  minify: false,
  plugins: [tailwindcss({ inject: true })],
  onSuccess: () => {
    copyFileSync(resolve(__dir, 'dist/index.js'), resolve(__dir, '../public/notch.js'))
  },
})
