import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyShard,
  nodeMessageCount,
  sampleMessageActivity,
  shardLag,
  shardHeight,
  summarizeShards,
} from './health.js'

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


test('reads the total indexed message count from current and legacy response shapes', () => {
  assert.equal(nodeMessageCount({ dbStats: { numMessages: 914092103 } }), 914092103)
  assert.equal(nodeMessageCount({ db_stats: { num_messages: '42' } }), 42)
})

test('rejects missing or malformed message totals', () => {
  assert.equal(nodeMessageCount({}), null)
  assert.equal(nodeMessageCount({ dbStats: { numMessages: -1 } }), null)
  assert.equal(nodeMessageCount({ dbStats: { numMessages: 'unknown' } }), null)
})

test('first message sample establishes a baseline', () => {
  assert.deepEqual(sampleMessageActivity(null, 100, 1000), {
    total: 100, delta: null, perSecond: null, sampledAt: 1000,
  })
})

test('message activity reports delta and per-second rate', () => {
  assert.deepEqual(sampleMessageActivity({ total: 100, sampledAt: 1000 }, 160, 31000), {
    total: 160, delta: 60, perSecond: 2, sampledAt: 31000,
  })
})

test('counter resets and invalid elapsed time re-establish the baseline', () => {
  assert.equal(sampleMessageActivity({ total: 100, sampledAt: 1000 }, 90, 2000).delta, null)
  assert.equal(sampleMessageActivity({ total: 100, sampledAt: 1000 }, 110, 1000).perSecond, null)
})
