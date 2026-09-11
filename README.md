# Cr1mson

Cr1mson is a self-hosted proxy homepage with Scramjet/Ultraviolet browsing, a crimson-themed interface, realtime `#general` chat, and the Lumin Games page.

## Requirements

- Node.js 20 or newer
- npm or pnpm

## Install

```bash
npm install
```

Or:

```bash
pnpm install
```

## Build

Generate the static Astro pages before starting the production server:

```bash
npm run build
```

## Run

Start on the default port, `8080`:

```bash
npm start
```

Open `http://localhost:8080`.

To use another port, set `PORT` before the command:

```bash
PORT=8081 npm start
```

Then open `http://localhost:8081`.

The development server runs Astro on port `3000`:

```bash
npm run dev
```

## Chat

Open `/chat` or select Chat from the homepage. Create an account with Sign up, then sign in with the same username and password. Accounts are stored in `data/chat-users.json` as salted `scrypt` password hashes. Chat uses a single realtime WebSocket room named `#general`.

## Proxy runtime

The server must run as a Node process because the proxy uses service workers, Wisp, BareMux, and WebSocket transport. Static-only hosts are not supported.

## Useful commands

```bash
npm run build   # build Astro output
npm start       # serve dist on PORT or 8080
npm run dev     # Astro development server on 3000
npm run astro   # run the Astro CLI
```
