import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID!;
  const redirectUri = process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI!;
  const appUrl = clientId.replace("/api/oauth/client-metadata", "");

  const metadata = {
    client_id: clientId,
    application_type: "web",
    client_name: "Vetka",
    client_uri: appUrl,
    dpop_bound_access_tokens: true,
    grant_types: ["authorization_code", "refresh_token"],
    redirect_uris: [redirectUri],
    response_types: ["code"],
    scope: "atproto transition:generic",
    token_endpoint_auth_method: "none",
  };

  return NextResponse.json(metadata, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}
