# Roomi API Draft

Roomi is currently framed as a face party games app. The backend still exposes some
legacy study-session names (`goals`, `sessions`, `focus`) because the runtime
contracts have not been renamed yet. Treat those names as compatibility API until
the code and docs are migrated together.

## REST

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Check API availability. |
| `POST` | `/rooms` | Create a party room with a host participant and return the caller participant id. |
| `POST` | `/rooms/join` | Join an existing party room by invite code and return the caller participant id. |
| `GET` | `/rooms/:inviteCode` | Read a room snapshot by invite code. |
| `POST` | `/rooms/:roomId/goals` | Legacy prompt/mission slot. In study rooms this stores the participant goal; in game rooms this stores the participant's "today's play style" text (`participantId`, `rawText`) and returns the room snapshot. |
| `POST` | `/goals/refine` | Legacy text helper. With `mode: 'study_goal'` it refines a raw study goal (`rawGoal`, `sessionMinutes`). With `mode: 'play_style'` and `gameKind`, it can recommend a game play style even when `rawGoal` is empty. Returns `{ refinedText, reason, source }`; `source` is `template` when the LLM is unavailable. |
| `GET` | `/v1/models` | Forward an OpenAI-compatible model list request to the configured internal LLM server. |
| `POST` | `/v1/chat/completions` | Forward an OpenAI-compatible chat completion request to the configured internal LLM server. |
| `POST` | `/focus/predict` | Forward a local face-analysis feature window to the internal ML server's `/v1/focus/predict` endpoint. Returns the ML response unchanged, `502` when unavailable, and `504` on timeout. |
| `POST` | `/focus/feedback` | Forward a user correction for local face-analysis output to `/v1/focus/feedback`. |
| `DELETE` | `/focus/feedback/:userId` | Reset that user's ML feedback and personalization on the internal ML server. |
| `POST` | `/sessions` | Host starts the live game round (`roomId`, `participantId`). Sets `room.status = 'studying'` for compatibility, creates `currentSession`, and broadcasts `room:updated`. `403` for non-host, `409` if not startable, `404` for unknown room. |
| `POST` | `/sessions/break/start` | Host starts a room-wide intermission when `room.settings.breakMode === 'room'`. Sets `room.status = 'break'`, stores `breakEndsAt`, and broadcasts the state. |
| `POST` | `/sessions/break/end` | Host ends a room-wide intermission and returns the room to the active round. |
| `POST` | `/sessions/break/extend` | Host extends `currentSession.breakEndsAt` by `minutes` (default `5`). |

Invite codes are 6-character uppercase alphanumeric strings. Roomi excludes
ambiguous characters (`0`, `O`, `1`, `I`, `L`) and normalizes user input before
lookup.

`POST /rooms` and `POST /rooms/join` return a `RoomSession`:

```ts
{
  snapshot: RoomSnapshot;
  currentParticipantId: string;
  videoJoin?: {
    provider: 'daily';
    roomUrl: string;
    token: string;
  };
}
```

The renderer uses `currentParticipantId` to mark the local player, drive
camera/mic controls, and decide whether host-only controls should be visible.
When Daily credentials are configured, `videoJoin` contains a private Daily room
URL and participant meeting token. The API creates one Daily room per Roomi room
and issues a token per participant with the Roomi participant id as Daily
`user_id`. If Daily room or token creation fails, the REST request returns `503`
and rolls back the participant instead of returning a local-only video session.

## Renderer Behavior

- The lobby uses `room.status` as its route contract: `waiting` shows invite and
  host start controls, `studying` is the active room, `break` is a study-only
  intermission, and `ended` opens the results/recap flow.
- Room creation stores `room.settings.activityKind`. `study` keeps the original
  study-room flow with break controls; `hidden_mission`, `poker_bluff`, and
  `copycat_relay` create game rooms. Break settings and break controls are only
  available when `activityKind === 'study'`. Study rooms use
  `sessionMinutes`; game rooms use `roundCount` for the number of game rounds.
- The waiting-room text slot is mode-aware. Study rooms label it as `내 목표`
  and use `/goals/refine` to narrow the goal. Game rooms label it as `오늘의
  플레이 스타일`, allow empty-text recommendations from Roomi, and require a
  saved style before entering the active game room.
- The active video room shows every participant's saved study goal in study
  rooms. In game rooms, the right-side summary becomes `현재 순위`; saved play
  styles move into the detailed game-results modal. The pre-round Roomi message
  is based on the configured `defaultGameKind` instead of the study-session
  start copy.
- In the active room, the host can start `hidden_mission`, `poker_bluff`, or
  `copycat_relay` when `room.settings.activityKind` is a game kind. The desktop
  app sends `room.settings.defaultGameKind`, which is chosen during room
  creation. The renderer exposes hidden mission progress, bluff bet/tell-check
  controls, and relay target/similarity controls through the shared Socket.IO
  events below.
- Hidden mission rounds assign each participant one private mission from a
  shuffled mission pool. Mission text is not included in public game snapshots
  until the host reveals the game. When a participant returns from the lobby to
  an active hidden-mission round, the server replaces that participant's private
  mission.
- Hidden mission success stops the current round without ending the video room.
  If more rounds remain, `currentGame.status` becomes `between_round`, the top
  room timer shows the next-round countdown, and participants can send
  `game:next-round-ready`. The next round starts immediately when every active
  participant is ready, or automatically when the 5-minute countdown expires.
- Roomi game host messages are emitted through `roomi:message` on game start,
  player reactions, and reveal. The API asks the configured LLM for these lines
  and falls back to templates when the LLM is unavailable; prompts include only
  game actions, visible expression signals, and participant-authored play style
  text, not raw camera frames. Hidden mission live reactions avoid naming the
  player or declaring mission success; they only hint at visible expression
  clues such as a raised brow or brief smile.
- The server owns study timing through `currentSession.startedAt`,
  `currentSession.plannedMinutes`, and optional `breakEndsAt`. Game timing lives
  on `currentGame.round.endsAt` and `currentGame.nextRoundStartsAt`. Clients
  calculate remaining time from server timestamps, so late joiners see the same
  clock.
- If the configured central API is unavailable during local development, the
  desktop renderer can still create a local demo room and run the face party
  game UI on one machine. That fallback is intentionally process-local: invite
  joins, Socket.IO sync, Daily video, and server-owned scoring still require the
  central API.
- Room leave behavior is split by context: the active-room leave control returns
  to the lobby without removing the participant, while the lobby leave control
  sends `room:leave` and returns to onboarding.
- Face analysis runs locally in the desktop renderer. The server receives
  derived state or feature windows, not raw camera frames.

Join failures return JSON error messages:

| Status | Meaning |
|---|---|
| `404` | Invite code does not match an active room. |
| `409` | Room exists but is already full or not in a compatible state. |
| `503` | Daily room or meeting token could not be prepared. |

## Socket.IO Events

Client events are defined in `packages/shared/src/realtime-events.ts`.

| Event | Direction | Purpose |
|---|---|---|
| `room:subscribe` | client to server | Subscribe to an existing room after REST create/join and receive snapshots. Send `{ roomId, participantId }`; membership is created only via REST. |
| `room:leave` | client to server | Remove the participant from the room and leave the realtime channel. If the host leaves, the earliest-joined remaining participant becomes host. |
| `participant:ready` | client to server | Set the lobby readiness flag and broadcast `room:updated`. |
| `goal:submit` | client to server | Legacy prompt/mission text update. Mirrors `POST /rooms/:roomId/goals` and broadcasts `room:updated`. |
| `participant:update-status` | client to server | Publish player presence and local face-analysis state. Compatibility statuses include `online`, `focused`, `distracted`, `away`, `break`, and `paused`. |
| `game:start` | client to server | Host starts a face party game (`hidden_mission`, `poker_bluff`, or `copycat_relay`) for game-mode rooms. The desktop app normally sends the room's `defaultGameKind`. The server creates `currentGame`, assigns any private missions, and broadcasts `game:round-begin`. |
| `expression:report` | client to server | Submit local expression-derived game results. Hidden mission rounds send a `missionResult` whenever a mission count advances or completes; poker bluff rounds send `signals` so the server can calculate `bluffResult`. |
| `bluff:bet` | client to server | Submit a player's guess for an expression bluff target. |
| `relay:advance` | client to server | Submit one relay mirror step with prompt, player expression signals, and similarity score. |
| `game:reveal` | client to server | Host reveals the current game and asks the server to finalize scores. |
| `game:next-round-ready` | client to server | Mark the participant ready during `between_round`. When all active participants are ready, the server starts the next round and broadcasts `game:round-begin`. |
| `room:snapshot` | server to client | Send the current room snapshot to a newly subscribed client. |
| `room:updated` | server to client | Broadcast the latest room snapshot. |
| `game:round-begin` | server to client | Broadcast the public game state for the new round or between-round state. Hidden missions are removed from public snapshots. |
| `mission:assign` | server to client | Send one hidden mission only to the assigned participant. |
| `mission:result` | server to client | Broadcast a submitted mission result without raw camera frames. |
| `game:reveal` | server to client | Broadcast the revealed game state, including final scores and missions that are now safe to show. |
| `roomi:message` | server to client | Send a typed Roomi operator/game message. Game messages cover start, live reactions, and reveal. Targeted messages use `targetParticipantId`. |
| `error` | server to client | Report a recoverable realtime error. |

REST joins also publish `room:updated` to subscribed clients, so a host in the
lobby sees new players without refreshing.

## Environment

Roomi uses separate environment files for the API server and the desktop
renderer. Keep server secrets only on the machine that runs the central API
server.

### API Server Environment

Copy the root `.env.example` to the repository root `.env` on the API server
machine. The API server loads the root `.env` first, then loads
`services/api/.env` if it exists. Values in `services/api/.env` override the root
file.

| Variable | Purpose |
|---|---|
| `API_PORT` | Backend HTTP and Socket.IO port. |
| `API_HOST` | Backend listen host. Use `0.0.0.0` for LAN or deployed traffic. |
| `CLIENT_ORIGIN` | Comma-separated allowlist of renderer/browser origins for REST CORS and Socket.IO CORS. Supports `*` inside an origin pattern, but a bare `*` is ignored. |
| `DAILY_API_KEY` | Daily API key for room/token creation. Server-side only. |
| `DAILY_DOMAIN` | Daily domain used by the video provider. |
| `ROOMI_ML_API_URL` | Internal ML server base URL. Defaults to `http://192.168.0.83:8080`; keep this server-side. |
| `ROOMI_ML_API_TIMEOUT_MS` | Timeout in milliseconds for central API requests to the internal ML server. Defaults to `5000`. |
| `OLLAMA_BASE_URL` | Base URL for an OpenAI-compatible Ollama endpoint. When unset, text helpers use deterministic templates. |
| `OLLAMA_MODEL` | Ollama model name to request. Defaults to `gemma3:12b`. |
| `OLLAMA_TIMEOUT_MS` | Timeout in milliseconds for Ollama requests. Defaults to `20000`. |
| `ROOMI_LLM_API_URL` | Internal OpenAI-compatible LLM server base URL. Defaults to `http://192.168.0.83:8081`; keep this server-side. |
| `ROOMI_LLM_API_TIMEOUT_MS` | Timeout in milliseconds for LLM proxy requests. Defaults to `30000`. |

During local development, the API also accepts renderer origins on `localhost`,
`127.0.0.1`, and private LAN addresses (`10.*`, `172.16-31.*`, `192.168.*`) in
the `5100-5199` port range. Packaged Electron requests are allowed with `file://`
and serialized `null` origins.

Daily credentials belong only in the API server `.env`. The renderer receives a
Daily room URL and participant token from `POST /rooms` or `POST /rooms/join`; it
must not receive `DAILY_API_KEY`.

### Desktop Renderer Environment

Copy `apps/desktop/.env.example` to `apps/desktop/.env` on each client machine.

| Variable | Purpose |
|---|---|
| `VITE_ROOMI_API_URL` | Central Roomi API base URL used by REST and Socket.IO from the renderer. |

Client-only machines should only need this renderer env file:

```env
VITE_ROOMI_API_URL=https://api.roomi.madcamp-kaist.org
```

## Central Development Server

To let multiple PCs join the same party room during development, run one API
server on the host machine and point every client at that server.

Server `.env` example:

```env
API_PORT=4100
API_HOST=0.0.0.0
CLIENT_ORIGIN=http://localhost:5175,http://127.0.0.1:5175,http://192.168.*:5175
DAILY_API_KEY=...
DAILY_DOMAIN=...
ROOMI_ML_API_URL=http://192.168.0.83:8080
ROOMI_ML_API_TIMEOUT_MS=5000
OLLAMA_BASE_URL=
OLLAMA_MODEL=gemma3:12b
OLLAMA_TIMEOUT_MS=20000
ROOMI_LLM_API_URL=http://192.168.0.83:8081
ROOMI_LLM_API_TIMEOUT_MS=30000
```

Start the API:

```sh
pnpm dev:api
```

From another PC on the same network, verify the API is reachable:

```sh
curl http://192.168.0.23:4100/health
```

Expected response:

```json
{ "ok": true, "service": "roomi-api" }
```

Client `apps/desktop/.env` example:

```env
VITE_ROOMI_API_URL=http://192.168.0.23:4100
```

With that setting, REST room creation/join and Socket.IO subscriptions both
connect to the central API server. The host creates a room with `POST /rooms`,
another player joins with `POST /rooms/join`, and all subscribed clients receive
player changes through `room:updated`.

## Cloudflare Tunnel for External Access

If the central API server runs inside a restricted campus network, expose it
through Cloudflare Tunnel instead of opening inbound firewall ports. Clients
outside the network should use the Cloudflare HTTPS URL:

```env
VITE_ROOMI_API_URL=https://api.roomi.madcamp-kaist.org
```

Socket.IO uses the same API base URL, so WebSocket/polling traffic follows the
tunnel with the REST API. If the renderer is served from a non-local browser
origin, add that browser origin to `CLIENT_ORIGIN`.

## Storage Limit

The current API uses `InMemoryRoomStore`, so rooms and participants are shared
only inside one running API process and disappear when that process restarts.
This is acceptable for MVP LAN testing, but production or long-running
deployments need a persistent `RoomStore` implementation behind the existing
`RoomStore` interface.
