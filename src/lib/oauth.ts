import { configureOAuth } from '@atcute/oauth-browser-client'
import {
  CompositeHandleResolver,
  WellKnownHandleResolver,
  DohJsonHandleResolver,
  CompositeDidDocumentResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  LocalActorResolver,
} from '@atcute/identity-resolver'

let configured = false

export function ensureOAuthConfigured() {
  if (configured) return
  configured = true

  const handleResolver = new CompositeHandleResolver({
    methods: {
      http: new WellKnownHandleResolver(),
      dns: new DohJsonHandleResolver({ dohUrl: 'https://cloudflare-dns.com/dns-query' }),
    },
  })

  const didDocResolver = new CompositeDidDocumentResolver({
    methods: {
      plc: new PlcDidDocumentResolver(),
      web: new WebDidDocumentResolver(),
    },
  })

  configureOAuth({
    metadata: {
      client_id: import.meta.env.VITE_OAUTH_CLIENT_ID,
      redirect_uri: import.meta.env.VITE_OAUTH_REDIRECT_URI,
    },
    identityResolver: new LocalActorResolver({
      handleResolver,
      didDocumentResolver: didDocResolver,
    }),
  })
}
