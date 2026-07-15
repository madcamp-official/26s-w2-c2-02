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

The server owns study timing through `currentSession.startedAt`,
`currentSession.plannedMinutes`, and optional `breakEndsAt`. Game timing is
stored separately on `currentGame.round.endsAt` and
`currentGame.nextRoundStartsAt`. Clients render clocks from those timestamps, so
late joiners and reconnecting players see the same remaining time without each
client becoming its own timer authority.

Rooms store `settings.activityKind` to distinguish the original study-room flow
from face party game rooms. `study` enables study goals and break controls;
`hidden_mission`, `poker_bluff`, and `copycat_relay` hide break controls and use
`currentGame` plus Socket.IO events for round changes. The room's
`defaultGameKind` is selected during room creation and shown again in the waiting
room; the active game room starts that configured game instead of choosing a
mode from the live controls. The API starts rounds, stores hidden missions and
scores, sends each player's assigned mission to that participant for the private
mission card, and includes the round's assigned mission prompts in game
snapshots so accusation choices can contain the real answer. Game
rooms use `settings.roundCount`; between rounds the API tracks
`nextRoundReadyParticipantIds`, starts the next round when everyone is ready,
and falls back to an automatic start after the 5-minute countdown. The renderer
uses local expression signals to update mission progress, while the API remains
the authority for multiplayer results.

The waiting-room text slot still uses the compatibility `goals` collection, but
its product meaning depends on `activityKind`. Study rooms treat it as the
participant's study goal. Game rooms treat it as that player's "today's play
style", can ask Roomi to recommend one through `/goals/refine` with
`mode: 'play_style'`, and pass the saved style into game host-message prompts so
Roomi can reference player-authored characters during live reactions. The active
video room renders saved study goals directly in study rooms; in game rooms,
play styles live in the detailed results modal beside current ranking and
round-by-round results.

Roomi's live game host lines are generated on the API side in Korean for game
start, mission results, bluff bets/results, relay progress, and reveal. The
orchestrator calls the configured LLM when available and uses Korean template
fallback messages otherwise. These prompts only receive player nicknames, game
actions, scores, participant-authored play styles, and visible expression signal
labels; raw video frames and facial landmarks stay out of the LLM path.
Hidden mission clients report intermediate count increases as well as final
success, so Roomi can react as soon as a visible mission action is detected, but
live hidden-mission reactions avoid naming the player or announcing success and
instead hint only at visible clues like a raised brow or brief smile.

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
