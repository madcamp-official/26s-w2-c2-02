# Roomi Architecture

Roomi is a TypeScript monorepo for a desktop-first face party games MVP. The
desktop client, API server, and shared realtime contracts live together so the
party-room flow can evolve quickly while keeping room state, invite codes, Daily
video, and Socket.IO contracts aligned.

## Packages

| Path | Purpose |
|---|---|
| `apps/desktop` | Electron desktop app with a React renderer, local camera access, and game UI. |
| `services/api` | Backend REST API, Socket.IO realtime gateway, room/session state, Daily adapter, and LLM/ML proxy adapters. |
| `packages/shared` | Shared room/session types and realtime event names. |
| `packages/config` | Shared TypeScript config for Node and React packages. |

## Runtime Shape

```text
Electron Desktop App
  - React renderer
  - Electron main/preload bridge
  - Local face analysis
  - Socket.IO client
  - Daily video client
        |
        | HTTPS / WebSocket
        v
Backend API Server
  - Room/invite endpoints
  - Socket.IO realtime gateway
  - Server-owned round timer
  - Daily room/token provider
  - Optional LLM and ML proxy adapters
```

Roomi keeps face analysis local to the desktop app. The renderer may publish
derived player state or feature windows for prediction/feedback, but raw camera
frames stay on the client. This preserves privacy while still allowing party
games to react to expressions, attention, or pose-derived signals.

For multi-PC testing, run a single central `services/api` process and point all
desktop clients at it with `VITE_ROOMI_API_URL`, for example
`http://192.168.0.23:4100`. REST endpoints and Socket.IO events then share one
`RoomService` instance and one room store, so room creation, invite-code joins,
participant updates, host transfer, and leave events are broadcast from the same
source of truth.

Daily is the media provider only. The API server creates private Daily rooms and
participant tokens, while Roomi room codes, player lists, host state, round
state, and timers stay in the Roomi API. Daily API keys are server-side
environment variables and must not be exposed to the renderer.

The server owns round timing through `currentSession.startedAt`,
`currentSession.plannedMinutes`, and optional `breakEndsAt`. Clients render the
clock from those timestamps, so late joiners and reconnecting players see the
same remaining time without each client becoming its own timer authority.

Face party games use `currentGame` on the room snapshot and Socket.IO events for
round changes. The API starts rounds, stores hidden missions and scores, sends
private mission assignments only to the matching participant, and broadcasts
public game snapshots without hidden mission text until reveal. The renderer
uses local expression signals to update mission progress, while the API remains
the authority for multiplayer results.

Roomi's live game host lines are generated on the API side for game start,
mission results, bluff bets/results, relay progress, and reveal. The
orchestrator calls the configured LLM when available and uses template fallback
messages otherwise. These prompts only receive player nicknames, game actions,
scores, and visible expression signal labels; raw video frames and facial
landmarks stay out of the LLM path.

When the central API is unavailable, the desktop renderer can enter a local
single-machine demo room so UI and local expression work can continue. That path
does not replace the central server contract: cross-device joins, Daily media
tokens, realtime synchronization, and authoritative multiplayer scoring still
depend on `services/api`.

## Compatibility Naming

Some runtime names still come from the earlier study-room prototype:
`sessions`, `goals`, `focused`, `distracted`, and `break` remain in shared types,
REST routes, and Socket.IO payloads. New product copy should describe rooms,
players, prompts, rounds, intermissions, and face party games, but code-facing
docs should keep the current identifiers until a coordinated API migration
renames them.

## Early Storage Decision

The initial API uses an in-memory room store to keep MVP iteration fast.
Persistence should be introduced behind the same room-service boundary once the
room/game flows settle. Because this store is process-local, restarting the
central API clears active rooms and running multiple API processes will not share
room state until a database-backed `RoomStore` is added.
