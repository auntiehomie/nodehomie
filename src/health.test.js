import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendStorageSample,
  calculateStorageRunway,
  classifyShard,
  nodeDatabaseSize,
  nodeMessageCount,
  protocolUpgradeStatus,
  sampleMessageActivity,
  shardDelaySeconds,
  shardHeight,
  shardMempoolSize,
  summarizePeerStability,
  summarizeShards,
} from './health.js'

test('blockDelay is interpreted as seconds behind wall clock', () => {
  assert.equal(shardDelaySeconds({ blockDelay: 50200 }), 50200)
  assert.equal(classifyShard({ blockDelay: 50200 }).label, 'measuring progress')
})

test('only a brief wall-clock delay is considered synced', () => {
  assert.equal(classifyShard({ block_delay: 29 }).status, 'synced')
  assert.equal(classifyShard({ block_delay: 30 }).status, 'syncing')
})

test('stalled requires explicit sustained no progress signal', () => {
  assert.equal(classifyShard({ blockDelay: 100 }, { stalled: false }).status, 'syncing')
  assert.equal(classifyShard({ blockDelay: 100 }, { stalled: true }).status, 'stalled')
})

test('missing or malformed telemetry stays unknown', () => {
  assert.equal(shardDelaySeconds({ blockDelay: 'unknown' }), null)
  assert.equal(shardHeight({ maxHeight: null }), null)
  assert.equal(classifyShard({}).status, 'unknown')
})

test('read-node mempool sentinel is reported as unavailable', () => {
  assert.equal(shardMempoolSize({ mempoolSize: 4294967295 }), null)
  assert.equal(shardMempoolSize({ mempool_size: '12' }), 12)
  assert.equal(shardMempoolSize({ mempoolSize: 'unknown' }), null)
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

test('reads database size from current and legacy response shapes', () => {
  assert.equal(nodeDatabaseSize({ dbStats: { approxSize: 548529692074 } }), 548529692074)
  assert.equal(nodeDatabaseSize({ db_stats: { approx_size: '2048' } }), 2048)
  assert.equal(nodeDatabaseSize({}), null)
})

test('storage samples are bounded and ignore rapid duplicate samples', () => {
  const hour = 60 * 60 * 1000
  const samples = appendStorageSample([{ size: 100, sampledAt: hour }], 120, hour + 60_000)
  assert.deepEqual(samples, [{ size: 100, sampledAt: hour }])
  const next = appendStorageSample(samples, 200, hour * 2)
  assert.equal(next.length, 2)
})

test('storage runway requires enough positive growth history', () => {
  const day = 24 * 60 * 60 * 1000
  const runway = calculateStorageRunway([
    { size: 100, sampledAt: 0 },
    { size: 200, sampledAt: day },
  ], 300)
  assert.equal(runway.growthPerDay, 100)
  assert.equal(runway.daysRemaining, 3)
  assert.equal(calculateStorageRunway([{ size: 200, sampledAt: day }], 300).growthPerDay, null)
})

test('protocol upgrade timestamps produce useful urgency states', () => {
  const now = 2_000_000_000_000
  assert.deepEqual(protocolUpgradeStatus(0, now), { scheduled: false, urgency: 'none' })
  assert.equal(protocolUpgradeStatus((now + 2 * 86_400_000) / 1000, now).urgency, 'soon')
  assert.equal(protocolUpgradeStatus(now - 1, now).urgency, 'overdue')
})

test('peer stability reports churn, sources, and known versions', () => {
  const summary = summarizePeerStability([
    { peer_id: 'b', source: 'derived' },
    { peer_id: 'c', source: 'collected', contact_info: { snapchain_version: '0.14.3' } },
  ], ['a', 'b'])
  assert.deepEqual(summary.gained, ['c'])
  assert.deepEqual(summary.lost, ['a'])
  assert.deepEqual(summary.sources, { collected: 1, derived: 1, unknown: 0 })
  assert.deepEqual(summary.versions, { '0.14.3': 1 })
})
