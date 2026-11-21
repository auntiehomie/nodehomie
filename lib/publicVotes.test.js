import test from 'node:test'
import assert from 'node:assert/strict'
import { Server, ServerCredentials, credentials } from '@grpc/grpc-js'
import { HubService, collectVotes } from './publicVotes.js'
import { monitoredPeer } from '../src/monitoredPeer.js'

test('samples streamed blocks and shard chunks over gRPC, matching the monitored identity', async () => {
  const server = new Server()
  const key = Buffer.from('0149adb8c10672b17a86fb0b9247433d12b7e22c1b888499d3be5cde5171c463', 'hex')
  let peerId = monitoredPeer
  function block(shardIndex, signer) {
    return { commits: { height: { blockNumber: 10, shardIndex }, signatures: [{ signer, signature: Buffer.alloc(64, 1) }] } }
  }
  server.addService(HubService.service, {
    getInfo: (_, done) => done(null, { peerId, shardInfos: [0, 1].map(shardId => ({ shardId, maxHeight: 10, blockDelay: 2 })) }),
    getBlocks(call) { call.write(block(0, key)); call.end() },
    getShardChunks: (_, done) => done(null, { shardChunks: [block(1, Buffer.alloc(32))] }),
  })
  const port = await new Promise((resolve, reject) => server.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(),
    (error, port) => error ? reject(error) : resolve(port)))
  const client = new HubService('127.0.0.1:' + port, credentials.createInsecure())
  try {
    const sample = await collectVotes(client)
    assert.deepEqual(sample.shards.map(s => s.votes), [
      { checked: 1, signed: 1, last: 10 }, { checked: 1, signed: 0, last: null },
    ])
    peerId = 'other'
    await assert.rejects(collectVotes(client), /Unexpected RPC peer/)
  } finally {
    client.close()
    server.forceShutdown()
  }
})
