import { loadPackageDefinition } from '@grpc/grpc-js'
import { loadSync } from '@grpc/proto-loader'
import { fileURLToPath } from 'node:url'
import { monitoredPeer } from '../src/monitoredPeer.js'

const schema = fileURLToPath(new URL('../host-health/certificates.proto', import.meta.url))
export const { HubService } = loadPackageDefinition(loadSync(schema, { longs: Number, defaults: true }))
const signer = Buffer.from('0149adb8c10672b17a86fb0b9247433d12b7e22c1b888499d3be5cde5171c463', 'hex')

function unary(client, method, request, options) {
  return new Promise((resolve, reject) => client[method](request, options, (error, value) =>
    error ? reject(error) : resolve(value)))
}

async function sampleShard(client, shard, options) {
  const { shardId: id, maxHeight: height, blockDelay: delay } = shard
  const row = { id, height, delay, votes: null }
  if (!Number.isSafeInteger(height) || height < 1) return row
  const start = Math.max(1, height - 2)
  const range = { startBlockNumber: start, stopBlockNumber: height + 1 }
  const checked = new Set()
  const signed = new Set()
  function observe({ commits }) {
    const number = commits?.height?.blockNumber
    if (commits?.height?.shardIndex !== id || !Number.isSafeInteger(number) || number < start || number > height) return
    const signatures = commits.signatures.filter(v => v.signature.length === 64 && v.signer.length === 32)
    if (signatures.length) checked.add(number)
    if (signatures.some(v => signer.equals(v.signer))) signed.add(number)
  }
  try {
    if (id === 0) {
      for await (const block of client.getBlocks(range, options)) observe(block)
    } else {
      const reply = await unary(client, 'getShardChunks', { ...range, shardId: id }, options)
      reply.shardChunks.forEach(observe)
    }
    row.votes = { checked: checked.size, signed: signed.size, last: signed.size ? Math.max(...signed) : null }
  } catch {
    // Preserve other shards if this shard's certificates are unavailable.
  }
  return row
}

export async function collectVotes(client) {
  const options = { deadline: Date.now() + 7000 }
  const info = await unary(client, 'getInfo', {}, options)
  if (info.peerId !== monitoredPeer) throw new Error('Unexpected RPC peer')
  const shards = await Promise.all(info.shardInfos.filter(s => [0, 1, 2].includes(s.shardId))
    .map(s => sampleShard(client, s, options)))
  return { identity: monitoredPeer, source: 'Public RPC', checked_at: Math.floor(Date.now() / 1000), shards }
}
