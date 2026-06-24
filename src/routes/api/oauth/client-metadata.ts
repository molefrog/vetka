import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/oauth/client-metadata')({
  GET: () => {
    const appUrl = import.meta.env.VITE_APP_URL ?? 'http://127.0.0.1:3000'
    const clientId =
      import.meta.env.VITE_OAUTH_CLIENT_ID ?? `${appUrl}/api/oauth/client-metadata`
    const redirectUri =
      import.meta.env.VITE_OAUTH_REDIRECT_URI ?? 'http://127.0.0.1:3000/callback'

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

    return new Response(JSON.stringify(metadata), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  },
})
