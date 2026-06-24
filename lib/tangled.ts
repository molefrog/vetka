import "@atcute/atproto";
import "@atcute/tangled";

import { Client, ok } from "@atcute/client";
import { OAuthUserAgent, getSession, listStoredSessions } from "@atcute/oauth-browser-client";
import type { Did } from "@atcute/lexicons";
import { mainSchema as listRecordsSchema } from "@atcute/atproto/types/repo/listRecords";
import { mainSchema as createRecordSchema } from "@atcute/atproto/types/repo/createRecord";

export type Repo = {
  uri: string;
  rkey: string;
  name: string;
  description?: string;
  knot: string;
  sshUrl: string;
};

export type SshKey = {
  uri: string;
  rkey: string;
  name: string;
  key: string;
  createdAt: string;
};

export async function getActiveSession() {
  const dids = listStoredSessions();
  if (dids.length === 0) return null;
  return getSession(dids[0] as Did);
}

function makeClient(session: Awaited<ReturnType<typeof getSession>>) {
  const agent = new OAuthUserAgent(session);
  return { client: new Client({ handler: agent }), agent };
}

export async function listRepos(): Promise<Repo[]> {
  const session = await getActiveSession();
  if (!session) throw new Error("Not authenticated");

  const { client } = makeClient(session);
  const did = session.info.sub;

  const res = await ok(
    client.call(listRecordsSchema, {
      params: { repo: did, collection: "sh.tangled.repo", limit: 100 },
    })
  );

  return res.records.map((r) => {
    const v = r.value as {
      name?: string;
      description?: string;
      knot: string;
      $type: string;
    };
    const rkey = r.uri.split("/").pop()!;
    const repoName = v.name ?? rkey;
    const knot = v.knot.replace(/^https?:\/\//, "");
    return {
      uri: r.uri,
      rkey,
      name: repoName,
      description: v.description,
      knot,
      sshUrl: `git@${knot}:${did}/${repoName}.git`,
    };
  });
}

export async function listSshKeys(): Promise<SshKey[]> {
  const session = await getActiveSession();
  if (!session) throw new Error("Not authenticated");

  const { client } = makeClient(session);
  const did = session.info.sub;

  const res = await ok(
    client.call(listRecordsSchema, {
      params: { repo: did, collection: "sh.tangled.publicKey", limit: 100 },
    })
  );

  return res.records.map((r) => {
    const v = r.value as { name: string; key: string; createdAt: string };
    return {
      uri: r.uri,
      rkey: r.uri.split("/").pop()!,
      name: v.name,
      key: v.key,
      createdAt: v.createdAt,
    };
  });
}

export async function addSshKey(name: string, publicKey: string): Promise<string> {
  const session = await getActiveSession();
  if (!session) throw new Error("Not authenticated");

  const { client } = makeClient(session);
  const did = session.info.sub;

  const res = await ok(
    client.call(createRecordSchema, {
      input: {
        repo: did,
        collection: "sh.tangled.publicKey",
        record: {
          $type: "sh.tangled.publicKey",
          name,
          key: publicKey.trim(),
          createdAt: new Date().toISOString(),
        },
      },
    })
  );

  return res.uri;
}
