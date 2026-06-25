#!/usr/bin/env bun
/**
 * Screenshot CLI — spin up a static server for a local repo, then capture a page.
 *
 * Usage:
 *   bun /workspace/scripts/screenshot.ts <url>                        # remote URL
 *   bun /workspace/scripts/screenshot.ts <url> shot.png               # custom output path
 *   bun /workspace/scripts/screenshot.ts --serve <dir> /              # serve dir, capture root
 *   bun /workspace/scripts/screenshot.ts --serve <dir> /about out.png # serve dir, capture /about
 *
 * Examples:
 *   bun screenshot.ts https://molefrog.tngl.sh screenshot.png
 *   bun screenshot.ts --serve ./my-site / homepage.png
 *   bun screenshot.ts --serve ./my-site /blog/post-1
 */

const args = Bun.argv.slice(2)

if (args.length === 0 || args[0] === '--help') {
  console.log('Usage: bun screenshot.ts [--serve <dir>] <url|path> [output.png]')
  process.exit(0)
}

let serveDir: string | undefined
let target = ''
let output = 'screenshot.png'

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--serve') { serveDir = args[++i]; continue }
  if (/\.(png|jpg|jpeg|webp)$/i.test(args[i])) { output = args[i]; continue }
  target = args[i]
}

// ── Static server ─────────────────────────────────────────────────────────────
let server: ReturnType<typeof Bun.serve> | undefined
let url = target

if (serveDir) {
  const port = 3737
  const base = serveDir.startsWith('/') ? serveDir : `${process.cwd()}/${serveDir}`

  server = Bun.serve({
    port,
    fetch: async (req) => {
      let path = new URL(req.url).pathname
      if (path === '/') path = '/index.html'
      const file = Bun.file(base + path)
      if (await file.exists()) return new Response(file)
      // SPA fallback
      const index = Bun.file(`${base}/index.html`)
      if (await index.exists()) return new Response(index)
      return new Response('Not found', { status: 404 })
    },
  })

  await Bun.sleep(300)

  const pagePath = target.startsWith('/') ? target : `/${target}`
  url = `http://localhost:${port}${pagePath}`
  console.log(`Serving ${base}`)
}

if (!url) {
  console.error('Error: no URL or path provided')
  process.exit(1)
}

console.log(`Capturing ${url} → ${output}`)

// ── Screenshot via Playwright Python ─────────────────────────────────────────
const pyPath = `/tmp/_vetka_screenshot_${Date.now()}.py`

await Bun.write(
  pyPath,
  `from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'])
    page = b.new_page(viewport={'width': 1280, 'height': 900})
    page.goto(${JSON.stringify(url)}, wait_until='load', timeout=30000)
    page.screenshot(path=${JSON.stringify(output)}, full_page=True)
    b.close()
print('✓ Saved:', ${JSON.stringify(output)})
`,
)

const proc = Bun.spawnSync(['python3', pyPath], { stdout: 'inherit', stderr: 'inherit' })
Bun.spawnSync(['rm', '-f', pyPath])

server?.stop(false)
process.exit(proc.exitCode ?? 0)
