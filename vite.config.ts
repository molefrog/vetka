import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { spawn } from 'child_process'
import { copyFileSync } from 'fs'
import path from 'path'

function notchBuildPlugin(): Plugin {
  const notchDir = path.resolve(__dirname, 'notch')
  const srcDir = path.resolve(notchDir, 'src')
  const bunupBin = path.resolve(__dirname, 'node_modules/.bin/bunup')
  const distFile = path.resolve(notchDir, 'dist/index.global.js')
  const publicFile = path.resolve(__dirname, 'public/notch.js')

  let initialized = false
  let building = false

  function build(onDone?: () => void) {
    if (building) return
    building = true
    const proc = spawn(bunupBin, [], {
      cwd: notchDir,
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    proc.on('error', (e) => { building = false; console.error('[notch]', e) })
    proc.on('exit', (code) => {
      building = false
      if (code === 0) {
        try { copyFileSync(distFile, publicFile) } catch (e) { console.error('[notch] copy failed:', e) }
        onDone?.()
      } else {
        console.error(`[notch] bunup exited with code ${code}`)
      }
    })
  }

  return {
    name: 'notch-build',
    configureServer(server) {
      if (initialized) return
      initialized = true
      build()
      server.watcher.add(srcDir)
      server.watcher.on('change', (file) => {
        if (!file.startsWith(srcDir)) return
        build(() => server.ws.send({ type: 'full-reload' }))
      })
    },
  }
}

function betterAuthPlugin(): Plugin {
  return {
    name: 'better-auth',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/auth')) return next()
        try {
          const { auth } = await import('./src/lib/auth.server')
          const { toNodeHandler } = await import('better-auth/node')
          return toNodeHandler(auth)(req, res)
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

function oauthClientMetadataPlugin(): Plugin {
  return {
    name: 'oauth-client-metadata',
    configureServer(server) {
      server.middlewares.use('/api/oauth/client-metadata', (_req, res) => {
        const appUrl = process.env.VITE_APP_URL ?? 'http://127.0.0.1:3000'
        const clientId = process.env.VITE_OAUTH_CLIENT_ID ?? `${appUrl}/api/oauth/client-metadata`
        const redirectUri = process.env.VITE_OAUTH_REDIRECT_URI ?? 'http://127.0.0.1:3000/callback'
        const metadata = {
          client_id: clientId,
          client_name: 'Vetka',
          client_uri: appUrl,
          redirect_uris: [redirectUri],
          scope: 'atproto transition:generic',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          application_type: 'web',
          dpop_bound_access_tokens: true,
        }
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify(metadata))
      })
    },
  }
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: { allowedHosts: ['neko.puma-scylla.ts.net'] },
  plugins: [notchBuildPlugin(), betterAuthPlugin(), oauthClientMetadataPlugin(), devtools(), tailwindcss(), tanstackStart(), viteReact()],
})

export default config
