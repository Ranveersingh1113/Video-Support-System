import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  WebhookReceiver,
} from 'livekit-server-sdk'

const API_KEY = process.env.LIVEKIT_API_KEY ?? 'devkey'
const API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'devsecretdevsecretdevsecretdevsecret'
export const LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'ws://localhost:7880'
// RoomServiceClient + webhooks talk to LiveKit's HTTP API (same host, http scheme).
const LIVEKIT_HTTP = LIVEKIT_URL.replace(/^ws/, 'http')

export const roomService = new RoomServiceClient(LIVEKIT_HTTP, API_KEY, API_SECRET)
export const egressClient = new EgressClient(LIVEKIT_HTTP, API_KEY, API_SECRET, {
  requestTimeout: Number(process.env.EGRESS_REQUEST_TIMEOUT_MS ?? 8000),
})
export const webhookReceiver = new WebhookReceiver(API_KEY, API_SECRET)

export function recordingOutput(filepath: string) {
  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath,
    disableManifest: true,
  })
}

/**
 * Cryptographically-scoped join token. The role drives media permissions at the
 * SFU boundary: agents get roomAdmin, customers do not. Both can publish A/V + data (chat).
 */
export async function mintAccessToken(opts: {
  identity: string
  name: string
  room: string
  role: 'agent' | 'customer'
}): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    identity: opts.identity,
    name: opts.name,
    metadata: JSON.stringify({ role: opts.role }),
  })
  at.addGrant({
    roomJoin: true,
    room: opts.room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: opts.role === 'agent',
  })
  return at.toJwt()
}
