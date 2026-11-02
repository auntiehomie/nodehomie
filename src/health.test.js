import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyShard, shardLag, shardHeight, summarizeShards } from './health.js'

test('blockDelay is preserved as a block count, not converted to time', () => {
  assert.equal(shardLag({ blockDelay: 50200 }), 50200)
  assert.equal(classifyShard({ blockDelay: 50200 }).label, 'measuring progress')
})

test('only a small block delay is considered synced', () => {
  assert.equal(classifyShard({ block_delay: 59 }).status, 'synced')
  assert.equal(classifyShard({ block_delay: 60 }).status, 'syncing')
})

test('stalled requires explicit sustained no progress signal', () => {
  assert.equal(classifyShard({ blockDelay: 100 }, { stalled: false }).status, 'syncing')
  assert.equal(classifyShard({ blockDelay: 100 }, { stalled: true }).status, 'stalled')
})

test('missing or malformed telemetry stays unknown', () => {
  assert.equal(shardLag({ blockDelay: 'unknown' }), null)
  assert.equal(shardHeight({ maxHeight: null }), null)
  assert.equal(classifyShard({}).status, 'unknown')
})

test('summary checks the configured shards 1 and 2, not internal shard 0', () => {
  const summary = summarizeShards([
    { shardId: 0, blockDelay: 0 },
    { shardId: 1, blockDelay: 3 },
  ])
  assert.deepEqual(summary.map(s => [s.id, s.status]), [[1, 'synced'], [2, 'missing']])
})
