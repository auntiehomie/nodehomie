// Helpers for the "Mesh addresses" view.
//
// Hypersnap reports two kinds of address for a peer:
//   - advertised: the address the peer announces for itself (its own
//     gossip.announce_address). Validators do not publish contact info, so for
//     them this only comes from a mesh crawl, where each validator reports its
//     own `self.gossip_address`. Other peers carry it in `contact_info`.
//   - observed: the address this node happens to see the live connection come
//     from. Behind NAT or a relay it can differ from the advertised one.

// "/ip4/45.157.179.78/udp/3382/quic-v1" -> { host: "45.157.179.78", port: "3382", text: "45.157.179.78:3382" }
export function parseMultiaddr(addr) {
  if (typeof addr !== 'string' || !addr.trim()) return null
  const parts = addr.trim().split('/').filter(Boolean)
  let host = null
  let port = null
  for (let i = 0; i < parts.length - 1; i += 1) {
    const [key, value] = [parts[i], parts[i + 1]]
    if (!host && ['ip4', 'ip6', 'dns', 'dns4', 'dns6'].includes(key)) host = value
    if (!port && ['udp', 'tcp'].includes(key)) port = value
  }
  if (!host) {
    // Plain "host:port" (or bare host) strings, which some endpoints return.
    const match = addr.trim().match(/^\[?([^\]\s/]+?)\]?(?::(\d+))?$/)
    if (!match) return null
    host = match[1]
    port = match[2] ?? null
  }
  const shownHost = host.includes(':') ? `[${host}]` : host
  return { host, port, text: port ? `${shownHost}:${port}` : shownHost }
}

export function isPublicHost(host) {
  if (!host) return false
  if (/^(0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return false
  if (host === '::' || host === '::1' || /^f[cd]/i.test(host) || /^fe80:/i.test(host)) return false
  return true
}

function entryFor(book, peerId) {
  if (!book.has(peerId)) {
    book.set(peerId, { peerId, name: null, isValidator: false, advertised: null, advertisedFrom: null, observed: null, connected: false, unreachable: null })
  }
  return book.get(peerId)
}

function setAdvertised(entry, addr, from) {
  const parsed = parseMultiaddr(addr)
  if (!parsed || !isPublicHost(parsed.host)) return
  // A node's own announcement (from a crawl) beats what others relayed for it.
  if (entry.advertised && entry.advertisedFrom === 'self-announced' && from !== 'self-announced') return
  entry.advertised = parsed
  entry.advertisedFrom = from
}

// mesh: the local view ({ self, peers: Map }) as App.jsx stores it.
// topology: the JSON from /v1/mesh?format=json&crawl=true, or null.
// knownNames: peer id -> name fallback (peerNames.json).
export function buildAddressBook({ mesh, topology, knownNames = {}, localPeerId } = {}) {
  const book = new Map()
  const nameOf = (id, fromNode) => fromNode || (Object.hasOwn(knownNames, id) ? knownNames[id] : null)

  for (const peer of mesh?.peers?.values?.() ?? []) {
    if (!peer?.peer_id) continue
    const entry = entryFor(book, peer.peer_id)
    entry.name = nameOf(peer.peer_id, peer.name) ?? entry.name
    entry.isValidator ||= peer.node_type === 'validator'
    entry.connected ||= Boolean(peer.connected)
    const observed = parseMultiaddr(peer.observed_address)
    if (observed) entry.observed = observed
    setAdvertised(entry, peer.contact_info?.gossip_address, 'contact info')
  }

  for (const node of topology?.nodes ?? []) {
    const self = node?.self
    if (!self?.peer_id) continue
    const entry = entryFor(book, self.peer_id)
    entry.name = nameOf(self.peer_id, self.name) ?? entry.name
    entry.isValidator ||= Boolean(self.is_validator)
    // The crawl only reaches validators this node is connected to.
    entry.connected = true
    entry.unreachable = null
    setAdvertised(entry, self.gossip_address, 'self-announced')
    // Peers of that node can carry contact info for nodes we never met.
    for (const peer of node.peers ?? []) {
      if (!peer?.peer_id || !peer.contact_info?.gossip_address) continue
      const other = entryFor(book, peer.peer_id)
      other.name = nameOf(peer.peer_id, peer.name) ?? other.name
      setAdvertised(other, peer.contact_info.gossip_address, 'contact info')
    }
  }

  for (const node of topology?.unreachable ?? []) {
    if (!node?.peer_id) continue
    const entry = entryFor(book, node.peer_id)
    entry.name = nameOf(node.peer_id, node.name) ?? entry.name
    entry.isValidator = true
    if (!entry.advertised) entry.unreachable = node.reason || 'unreachable'
  }

  for (const [id, entry] of book) {
    if (!entry.name && Object.hasOwn(knownNames, id)) entry.name = knownNames[id]
  }
  if (localPeerId) book.delete(localPeerId)
  return book
}

// Every IP seen in the book -> the names that use it, so an address like
// 45.157.179.78 can be traced back to "mvr".
export function hostIndex(book) {
  const index = new Map()
  for (const entry of book.values()) {
    for (const [addr, kind] of [[entry.advertised, 'advertised'], [entry.observed, 'observed']]) {
      if (!addr?.host) continue
      if (!index.has(addr.host)) index.set(addr.host, [])
      const list = index.get(addr.host)
      if (!list.some(item => item.peerId === entry.peerId && item.kind === kind)) {
        list.push({ peerId: entry.peerId, name: entry.name, kind })
      }
    }
  }
  return index
}

export function lookupHost(index, query) {
  const parsed = parseMultiaddr(query)
  const host = parsed?.host ?? query?.trim()
  if (!host) return null
  return { host, matches: index.get(host) ?? [] }
}

export function sortedEntries(book) {
  return [...book.values()].sort((a, b) =>
    Number(b.isValidator) - Number(a.isValidator) ||
    Number(Boolean(b.name)) - Number(Boolean(a.name)) ||
    (a.name ?? a.peerId).localeCompare(b.name ?? b.peerId))
}

export function addressesDiffer(entry) {
  return Boolean(entry.advertised && entry.observed && entry.advertised.host !== entry.observed.host)
}
