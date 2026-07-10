# LumI Architecture

LumI is organized as a small TypeScript monorepo so the desktop client, API server,
and shared realtime contracts can evolve together during the MVP.

## Packages

| Path | Purpose |
|---|---|
| `apps/desktop` | Electron desktop app with a React renderer. |
| `services/api` | Backend API, Socket.IO realtime gateway, and service adapters. |
| `packages/shared` | Shared room/session types and realtime event names. |
| `packages/config` | Shared TypeScript config for Node and React packages. |

## Runtime Shape

```text
Electron Desktop App
  - React renderer
  - Electron main/preload bridge
  - Local camera/focus detection
  - Socket.IO client
  - Daily video client
        |
        | HTTPS / WebSocket
        v
Backend API Server
  - Room/session endpoints
  - Socket.IO realtime gateway
  - LumI LLM orchestrator
  - Daily join info provider
  - Summary/event aggregation
```

The MVP keeps video analysis local to the desktop app. The server receives state
signals such as `focused`, `away`, `break`, and `paused`, not raw camera frames.

## Early Storage Decision

The initial API uses an in-memory room store to keep Day 1 and Day 2 feedback fast.
Persistence should be introduced behind the same room-service boundary once the
room/session flows settle.
