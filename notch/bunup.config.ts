import { defineConfig } from 'bunup'
import { tailwindcss } from '@bunup/plugin-tailwindcss'

export default defineConfig({
  outDir: 'dist',
  format: 'iife',
  target: 'browser',
  packages: 'bundle',
  minify: true,
  plugins: [tailwindcss({ inject: true })],
})
