import { defineConfig } from 'bunup'
import { tailwindcss } from '@bunup/plugin-tailwindcss'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
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
    const bundlePath = resolve(__dir, 'dist/index.js')
    let content = readFileSync(bundlePath, 'utf-8')

    // bunup's tailwindcss plugin serializes CSS as a Node Buffer object, which is
    // meaningless in the browser. Patch injectStyle to decode it before injecting.
    content = content.replace(
      'function injectStyle(css) {\n  if (!css || typeof document === "undefined")\n    return;',
      'function injectStyle(css) {\n  if (!css || typeof document === "undefined")\n    return;\n  if (css && css.type === "Buffer" && Array.isArray(css.data))\n    css = new TextDecoder().decode(new Uint8Array(css.data));'
    )

    writeFileSync(bundlePath, content)
    copyFileSync(bundlePath, resolve(__dir, '../public/notch.js'))
  },
})
