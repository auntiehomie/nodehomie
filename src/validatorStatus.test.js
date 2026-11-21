import test from 'node:test'
import assert from 'node:assert/strict'
import { peerRole, votingStatus } from './validatorStatus.js'

test('mesh roles work without host data and descriptive names do not imply a role', () => {
  assert.equal(peerRole('a', { node_type: 'validator' }), 'Validator')
  assert.equal(peerRole('a', { node_type: 'non-val' }), 'Mesh reports non-validator')
  assert.equal(peerRole('a', { name: 'wake 2' }), 'Role unknown')
  assert.equal(peerRole('a', null, [{ id: 1, active: ['a'] }]), 'Validator · shards 1')
})

test('voting summary requires signatures and distinguishes stale or lagging samples', () => {
  const row = { votes: { checked: 6, signed: 2 }, delay: 4 }
  assert.equal(votingStatus([]), 'Awaiting voting evidence')
  assert.equal(votingStatus([row]), 'Voting confirmed in recent commits')
  assert.equal(votingStatus([row], true), 'Last sample is stale')
  assert.equal(votingStatus([{ ...row, delay: 120 }]), 'Votes confirmed at sampled heights')
  assert.equal(votingStatus([{ votes: { checked: 2, signed: 0 } }]), 'No signature in sampled commits')
})

test('matches a scheduled consensus key when the transport peer ID differs', () => {
  const key = '0149adb8c10672b17a86fb0b9247433d12b7e22c1b888499d3be5cde5171c463'
  const active = ['12D3KooW9uPjmgKNasKiu6j8D4h5pRCLNwLDJxovaAccnz3iRFvS']
  assert.equal(peerRole('transport', { node_type: 'non-val', consensus_public_key: key }, [{ id: 2, active }]), 'Validator · shards 2')
})
