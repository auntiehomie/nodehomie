import { credentials } from '@grpc/grpc-js'
import { HubService, collectVotes } from '../lib/publicVotes.js'

let pending
let cached

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end()
  }
  try {
    if (!cached || Date.now() / 1000 - cached.checked_at >= 20) {
      if (!pending) {
        const client = new HubService('161.35.52.192:3383', credentials.createInsecure(), {
          'grpc.max_receive_message_length': 8 * 1024 * 1024,
          'grpc.enable_http_proxy': 0,
        })
        pending = collectVotes(client).then(sample => { cached = sample }).finally(() => {
          client.close()
          pending = null
        })
      }
      await pending
    }
    res.setHeader('Cache-Control', 'public, s-maxage=20')
    return res.status(200).json(cached)
  } catch {
    return res.status(503).json({ error: 'Public RPC sample unavailable' })
  }
}
