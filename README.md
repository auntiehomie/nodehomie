# NodeHomie

A mobile-friendly Snapchain node monitor. Enter your node URL (e.g. your Tailscale IP) and watch your shards sync in real time.

## Features

- Shard-by-shard lag, block rate, and height
- Color coded sync status (green/amber/red)
- Auto-refresh (15s, 30s, 1m, 5m)
- Remembers your node URL between sessions
- Works on iPhone and Android via Tailscale

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

## Usage

1. Open the app on your phone (via Vercel URL or local network)
2. Enter your node URL: `http://your-tailscale-ip:3381`
3. Hit Connect
4. Set auto-refresh interval

## Built for

[Hypersnap](https://hypersnap.org) / Snapchain node operators.
