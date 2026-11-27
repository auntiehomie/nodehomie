# NodeHomie

A mobile-friendly Snapchain node monitor. Enter your node URL (e.g. your Tailscale IP) and watch your shards sync in real time.

## Features

- Shard 1 and 2 health, wall-clock sync delay, block-processing rate, and height
- Total indexed messages, messages since the previous refresh, and live indexing rate
- Optional localhost host monitor for container state, CPU, memory, and disk space
- Database growth history and estimated disk-space runway
- Scheduled protocol-upgrade countdown from the node's engine timestamp
- Peer churn, connection source, and reported peer versions
- Mesh addresses: the address each peer and validator advertises (from a mesh crawl), named, with a "Who is this IP?" lookup
- Collapsible shard 0 network-engine status with read-node-aware mempool reporting
- Cast index backfill progress per shard and source (needs the host monitor)
- Incident timeline recorded on the node, with redacted error text and a copyable report (needs the host monitor)
- Validator roles, roster coverage, and sampled voting evidence from signed commit certificates
- Color coded sync status (green/amber/red)
- Auto-refresh (15s, 30s, 1m, 5m)
- Remembers your node URL between sessions
- Works on iPhone and Android via Tailscale

## Requirements

- Node.js 18 or newer (for the web app and `npm test`)
- Python 3.11+ on the node machine if you run the optional host monitor (Ubuntu 24.04 ships 3.12)

The web app needs no environment variables. The host monitor's settings are listed in the Setup Guide.

## Deploy to Vercel

```bash
npm install
npm run build
vercel deploy
```

Or connect your GitHub repo to Vercel for automatic deploys on push.

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` serves the dashboard only. The public voting sample comes from a Vercel function (`api/validator-votes.js`), so run `vercel dev` instead if you want that card to work locally.

Run the tests:

```bash
npm test                                      # web app
python3 -m unittest discover -s host-health   # host monitor
```

## Setup Guide

The full node setup walkthrough lives in the app at `/guide` (source: `src/SetupGuide.jsx`). It covers installing Hypersnap, Tailscale HTTPS access, and the optional read-only host monitor in `host-health/`, including its settings and how to update it when a new NodeHomie release needs a newer helper.

## Usage

1. Open the app on your phone (via Vercel URL or local network)
2. Enter your node URL: `http://your-tailscale-ip:3381`
3. Hit Connect
4. Set auto-refresh interval
5. If your node has admin auth on `/v1/mesh`, enter the admin username and password when the Mesh addresses panel asks (kept in that browser tab only)

## Built for

[Hypersnap](https://hypersnap.org) / Snapchain node operators.
