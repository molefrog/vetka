"use client";

import { configureOAuth } from "@atcute/oauth-browser-client";
import { LocalActorResolver } from "@atcute/identity-resolver";
import { CompositeHandleResolver } from "@atcute/identity-resolver";
import { WellKnownHandleResolver } from "@atcute/identity-resolver";
import { DohJsonHandleResolver } from "@atcute/identity-resolver";
import { CompositeDidDocumentResolver } from "@atcute/identity-resolver";
import { PlcDidDocumentResolver } from "@atcute/identity-resolver";
import { WebDidDocumentResolver } from "@atcute/identity-resolver";

let configured = false;

export function ensureOAuthConfigured() {
  if (configured) return;
  configured = true;

  const handleResolver = new CompositeHandleResolver({
    strategy: "race",
    methods: {
      http: new WellKnownHandleResolver(),
      dns: new DohJsonHandleResolver({
        dohUrl: "https://cloudflare-dns.com/dns-query",
      }),
    },
  });

  const didResolver = new CompositeDidDocumentResolver({
    methods: {
      plc: new PlcDidDocumentResolver(),
      web: new WebDidDocumentResolver(),
    },
  });

  const identityResolver = new LocalActorResolver({
    handleResolver,
    didDocumentResolver: didResolver,
  });

  configureOAuth({
    metadata: {
      client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID!,
      redirect_uri: process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI!,
    },
    identityResolver,
  });
}
