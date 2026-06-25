import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { readFileSync } from 'fs'
import path from 'path'

function notchBuildPlugin(): Plugin {
  const distFile = path.resolve(__dirname, 'notch/dist/index.js')
  let initialized = false

  return {
    name: 'notch-build',
    configureServer(server) {
      if (initialized) return
      initialized = true

      // Serve notch bundle directly from bunup's output dir
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/notch.js')) return next()
        try {
          const content = readFileSync(distFile)
          res.setHeader('Content-Type', 'application/javascript')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(content)
        } catch {
          res.statusCode = 503
          res.end('// notch bundle not built - run: bun run dev:notch')
        }
      })

      // Reload browser when bunup rebuilds
      server.watcher.add(distFile)
      server.watcher.on('change', (file) => {
        if (file !== distFile) return
        server.ws.send({ type: 'full-reload' })
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
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/api/oauth/client-metadata') return next()
        const appUrl = process.env.VITE_APP_URL ?? 'http://127.0.0.1:3000'
        const clientId =
          process.env.VITE_OAUTH_CLIENT_ID ?? `${appUrl}/api/oauth/client-metadata`
        const redirectUri =
          process.env.VITE_OAUTH_REDIRECT_URI ?? 'http://127.0.0.1:3000/callback'
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
  plugins: [
    notchBuildPlugin(),
    betterAuthPlugin(),
    oauthClientMetadataPlugin(),
    devtools(),
    tailwindcss(),
    tanstackStart(),
    // nitro() creates a dispatchFetch environment that disables TanStack Start's own
    // dev middleware, breaking API routes in dev. Only use it for production builds.
    ...(process.env.NODE_ENV === 'production' ? [nitro({ preset: 'vercel' })] : []),
    viteReact(),
  ],
})

export default config
