import assert from 'node:assert/strict'
import test from 'node:test'
import { addressesDiffer, buildAddressBook, hostIndex, lookupHost, parseMultiaddr, sortedEntries } from './meshAddresses.js'

test('parses multiaddrs and host:port strings', () => {
  assert.deepEqual(parseMultiaddr('/ip4/45.157.179.78/udp/3382/quic-v1'), { host: '45.157.179.78', port: '3382', text: '45.157.179.78:3382' })
  assert.deepEqual(parseMultiaddr('/dns4/haatz.quilibrium.com/udp/3382/quic-v1'), { host: 'haatz.quilibrium.com', port: '3382', text: 'haatz.quilibrium.com:3382' })
  assert.equal(parseMultiaddr('/ip6/2001:db8::1/udp/3382/quic-v1').text, '[2001:db8::1]:3382')
  assert.equal(parseMultiaddr('5.161.212.135:3382').host, '5.161.212.135')
  assert.equal(parseMultiaddr(''), null)
  assert.equal(parseMultiaddr(undefined), null)
})

const mvr = '12D3KooWJ6jCWWekTbNMn9MUGg6io4dYmSGbnguV9CnyQwzFiRn1'
const cassie = '12D3KooWMYfkXiNcn9LifPkLYiHtGmXYnknYG1yFBD53rUseUMUc'
const reader = '12D3KooWreader'
const me = '12D3KooW9uPjmgKNasKiu6j8D4h5pRCLNwLDJxovaAccnz3iRFvS'

test('prefers self-announced crawl addresses and keeps observed ones separately', () => {
  const mesh = {
    self: { peer_id: me },
    peers: new Map([
      [mvr, { peer_id: mvr, node_type: 'validator', connected: true, observed_address: '/ip4/10.99.0.1/udp/40000/quic-v1' }],
      [reader, { peer_id: reader, node_type: 'non-val', connected: true, name: 'neynar reader', observed_address: '/ip4/107.20.169.236/udp/3382/quic-v1', contact_info: { gossip_address: '/ip4/107.20.169.236/udp/3382/quic-v1' } }],
    ]),
  }
  const topology = {
    nodes: [
      { self: { peer_id: me, gossip_address: '/ip4/45.55.104.71/udp/3382/quic-v1', is_validator: true }, peers: [] },
      { self: { peer_id: mvr, gossip_address: '/ip4/45.157.179.78/udp/3382/quic-v1', is_validator: true }, peers: [] },
    ],
    unreachable: [{ peer_id: cassie, reason: 'not_connected' }],
  }
  const book = buildAddressBook({ mesh, topology, knownNames: { [mvr]: 'mvr', [cassie]: 'cassie' }, localPeerId: me })
  assert.equal(book.has(me), false)
  const m = book.get(mvr)
  assert.equal(m.name, 'mvr')
  assert.equal(m.advertised.text, '45.157.179.78:3382')
  assert.equal(m.advertisedFrom, 'self-announced')
  assert.equal(m.observed.host, '10.99.0.1')
  assert.equal(addressesDiffer(m), true)
  assert.equal(book.get(cassie).unreachable, 'not_connected')
  assert.equal(book.get(cassie).advertised, null)
  assert.equal(book.get(reader).name, 'neynar reader')
  assert.equal(book.get(reader).advertisedFrom, 'contact info')
  assert.deepEqual(sortedEntries(book).map(e => e.name), ['cassie', 'mvr', 'neynar reader'])
})

test('ignores private advertised addresses', () => {
  const mesh = { peers: new Map([[mvr, { peer_id: mvr, contact_info: { gossip_address: '/ip4/127.0.0.1/udp/3382/quic-v1' } }]]) }
  assert.equal(buildAddressBook({ mesh }).get(mvr).advertised, null)
})

test('looks up who uses an IP', () => {
  const topology = { nodes: [{ self: { peer_id: mvr, gossip_address: '/ip4/45.157.179.78/udp/3382/quic-v1' } }] }
  const index = hostIndex(buildAddressBook({ topology, knownNames: { [mvr]: 'mvr' } }))
  assert.deepEqual(lookupHost(index, '45.157.179.78').matches, [{ peerId: mvr, name: 'mvr', kind: 'advertised' }])
  assert.deepEqual(lookupHost(index, '45.157.179.78:3382').matches.length, 1)
  assert.deepEqual(lookupHost(index, '5.161.212.135').matches, [])
})
