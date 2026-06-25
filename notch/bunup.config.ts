import { defineConfig } from 'bunup'
import { tailwindcss } from '@bunup/plugin-tailwindcss'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))

// Shims for bun bundler bug: @instantdb/core uses uuid via `export { default as X }`
// re-exports, which bun generates as undeclared `defaultN` references.
const UUID_VALIDATE_FN = `((s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s))`
const UUID_V4_FN = `(() => crypto.randomUUID())`

export default defineConfig({
  outDir: 'dist',
  format: 'esm',
  target: 'browser',
  conditions: ['browser', 'import', 'default'],
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

    // Bun bundler bug: @instantdb/core imports `validate` from uuid via
    // `export { default as validate }` re-export. Bun generates a `defaultN`
    // reference (e.g. `default14`) inside its CJS interop wrapper but omits
    // the declaration, causing a ReferenceError at runtime.
    // Fix: inject the definition before any undeclared `defaultN` call site.
    const undeclared = new Set<string>()
    for (const m of content.matchAll(/\bdefault(\d+)\b/g)) {
      const name = `default${m[1]}`
      if (!content.includes(`var ${name} =`) && !content.includes(`let ${name} =`) && !content.includes(`const ${name} =`)) {
        undeclared.add(name)
      }
    }
    if (undeclared.size > 0) {
      const injections = [...undeclared].map((name) => {
        // Calls with no arguments → UUID generator (uuid/v4)
        // Calls with arguments → UUID validator (uuid/validate)
        const isGenerator = new RegExp(`\\b${name}\\(\\)`).test(content)
        return `var ${name} = ${isGenerator ? UUID_V4_FN : UUID_VALIDATE_FN};`
      }).join('\n')
      content = injections + '\n' + content
    }

    writeFileSync(bundlePath, content)
    copyFileSync(bundlePath, resolve(__dir, '../public/notch.js'))
  },
})
