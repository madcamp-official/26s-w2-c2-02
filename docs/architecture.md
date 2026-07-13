# Roomi Architecture

Roomi is organized as a small TypeScript monorepo so the desktop client, API server,
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
  - Roomi LLM orchestrator
  - Daily join info provider
  - Summary/event aggregation
```

The MVP keeps video analysis local to the desktop app. The server receives state
signals such as `focused`, `away`, `break`, and `paused`, not raw camera frames.

For multi-PC testing, Roomi should run a single central `services/api` process and
all desktop clients should set `VITE_ROOMI_API_URL` to that server, for example
`http://192.168.0.23:4100`. REST endpoints and Socket.IO events then share one
`RoomService` instance and one room store, so room creation, invite-code joins,
participant updates, and leave events are broadcast from the same source of truth.

Daily remains the media provider only. The API server creates private Daily rooms
and participant tokens, while Roomi room codes, participant lists, and session
state stay in the Roomi API. Daily API keys are server-side environment variables
and must not be exposed to the renderer.

## Early Storage Decision

The initial API uses an in-memory room store to keep Day 1 and Day 2 feedback fast.
Persistence should be introduced behind the same room-service boundary once the
room/session flows settle.
Because this store is process-local, restarting the central API clears active
rooms and running multiple API processes will not share room state until a database
backed `RoomStore` is added.
