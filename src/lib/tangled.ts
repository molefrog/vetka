import '@atcute/atproto'
import '@atcute/tangled'
import { OAuthUserAgent, getSession, listStoredSessions } from '@atcute/oauth-browser-client'
import { Client, ok } from '@atcute/client'
import type { Did } from '@atcute/lexicons'

export interface Repo {
  uri: string
  name: string
  knot: string
  description?: string
  sshUrl: string
}

export interface SshKey {
  uri: string
  name: string
  key: string
  createdAt: string
}

async function getClient(): Promise<{ client: Client; did: Did }> {
  const dids = listStoredSessions()
  if (!dids.length) throw new Error('Not authenticated')
  const did = dids[0] as Did
  const session = await getSession(did)
  const agent = new OAuthUserAgent(session)
  const client = new Client({ handler: agent })
  return { client, did }
}

export async function listRepos(): Promise<Repo[]> {
  const { client, did } = await getClient()
  const res = await ok(
    client.get('com.atproto.repo.listRecords', {
      params: { repo: did, collection: 'sh.tangled.repo', limit: 100 },
    }),
  )
  return (res.records ?? []).map((r: any) => {
    const v = r.value
    const knot = v.knot ?? 'tangled.sh'
    const rkey = r.uri.split('/').at(-1) ?? ''
    return {
      uri: r.uri,
      name: v.name ?? rkey,
      knot,
      description: v.description,
      sshUrl: `git@${knot}:${did}/${v.name}.git`,
    }
  })
}

export async function listSshKeys(): Promise<SshKey[]> {
  const { client, did } = await getClient()
  const res = await ok(
    client.get('com.atproto.repo.listRecords', {
      params: { repo: did, collection: 'sh.tangled.publicKey', limit: 100 },
    }),
  )
  return (res.records ?? []).map((r: any) => ({
    uri: r.uri,
    name: r.value.name,
    key: r.value.key,
    createdAt: r.value.createdAt ?? new Date().toISOString(),
  }))
}

export async function addSshKey(name: string, publicKey: string): Promise<string> {
  const { client, did } = await getClient()
  const res = await ok(
    client.post('com.atproto.repo.createRecord', {
      input: {
        repo: did,
        collection: 'sh.tangled.publicKey',
        record: {
          $type: 'sh.tangled.publicKey',
          name,
          key: publicKey,
          createdAt: new Date().toISOString(),
        },
      },
    }),
  )
  return res.uri
}
