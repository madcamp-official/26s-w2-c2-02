# Roomi API Draft

## REST

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Check API availability. |
| `POST` | `/rooms` | Create a room with a host participant and return the caller participant id. |
| `POST` | `/rooms/join` | Join an existing room by invite code and return the caller participant id. |
| `POST` | `/rooms/:roomId/goals` | Upsert the calling participant's goal (`participantId`, `rawText`) and return the room snapshot. Allowed regardless of room status (late joiners can set goals). |
| `POST` | `/goals/refine` | Refine a raw goal (`rawGoal`, `sessionMinutes`) via Gemini and return `{ refinedText, reason, source }`. Always `200`; `source` is `template` when the LLM is unavailable. The raw goal is not persisted. |
| `POST` | `/focus/predict` | Forward a renderer feature window to the internal ML server's `/v1/focus/predict` endpoint. Returns the ML response unchanged, `502` when the upstream is unavailable, and `504` when it times out. |
| `POST` | `/focus/feedback` | Forward a renderer user correction to the internal ML server's `/v1/focus/feedback` endpoint. Returns the ML response unchanged, `502` when the upstream is unavailable, and `504` when it times out. |
| `DELETE` | `/focus/feedback/:userId` | Forward a feedback reset request to the internal ML server's `/v1/focus/feedback/:userId` endpoint. Deletes that user's feedback and resets personalization on the ML server. |
| `POST` | `/sessions` | Host starts the study session (`roomId`, `participantId`) regardless of participants' `isReady` state. Sets `room.status = 'studying'`, creates `currentSession`, and changes the host status to `focused`; other participants remain `online` in the waiting room. Returns the snapshot. `403` for non-host, `409` if not `waiting`, `404` for unknown room. Transition reaches everyone via `room:updated`. |
| `GET` | `/rooms/:inviteCode` | Read a room snapshot by invite code. |

Invite codes are 6-character uppercase alphanumeric strings. Roomi excludes ambiguous characters (`0`, `O`, `1`, `I`, `L`) and normalizes user input before lookup.

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

The renderer uses `currentParticipantId` to mark the local participant, drive camera/mic controls, and decide whether host-only actions should be visible.
When Daily credentials are configured, `videoJoin` contains a Daily room URL and participant meeting token. The API creates one private Daily room per Roomi room and issues a token per participant with the Roomi participant id as Daily `user_id`. If Daily room or token creation fails, the REST request returns `503` and rolls back the participant instead of returning a local-only video session.

## Renderer session behavior

- The waiting room uses `room.status` as its route contract: `waiting` shows readiness and the host-only start action; `studying`/`break` lets a late participant submit a goal and join without interrupting the active session; the study-room `나가기` control returns there without removing the participant, while the waiting-room `방 나가기` control sends `room:leave` and returns to onboarding; `ended` opens the retrospective screen instead of a joinable waiting room.
- The study-room timer is calculated on each client from `currentSession.startedAt` and `currentSession.plannedMinutes`, so it keeps the server session's remaining time when a participant joins late.
- The waiting room calls `POST /goals/refine` only after the participant enters a goal. Choosing **이 목표로 저장** submits the suggested text through the normal goal-upsert API. Gemini is optional: a `template` response is displayed and can be accepted in the same way.

Join failures return JSON error messages:

| Status | Meaning |
|---|---|
| `404` | Invite code does not match an active room. |
| `409` | Room exists but is already full. |
| `503` | Daily room or meeting token could not be prepared. |

## Socket.IO Events

Client events are defined in `packages/shared/src/realtime-events.ts`.

| Event | Direction | Purpose |
|---|---|---|
| `room:subscribe` | client to server | Subscribe to an existing room after REST create/join and receive snapshots. Send `{ roomId, participantId }`; the participant id also scopes private Roomi messages to that socket channel. Membership is created only via REST (`POST /rooms`, `POST /rooms/join`); sockets never add participants. |
| `room:leave` | client to server | Remove the participant from the room and leave the realtime channel. A socket disconnect also removes its subscribed participant. If that participant was the host, the earliest-joined remaining participant becomes host. |
| `participant:ready` | client to server | Set the waiting-room readiness flag (`isReady`) for a participant; broadcasts `room:updated`. |
| `goal:submit` | client to server | Upsert the participant's goal (`rawText`); mirrors `POST /rooms/:roomId/goals` and broadcasts `room:updated`. |
| `participant:update-status` | client to server | Publish study-room presence and focus/break/away status updates. During an active session, `online` means waiting-room only; `focused`, `distracted`, `away`, `break`, and `paused` mean the participant has entered the study room. |
| `room:snapshot` | server to client | Send the current room snapshot to a newly subscribed client. |
| `room:updated` | server to client | Broadcast the latest room snapshot. |
| `roomi:message` | server to client | Send a typed Roomi operator message. Session-start messages go to the room; `focus_recovery` messages are delivered only to `targetParticipantId`. |
| `error` | server to client | Report a recoverable realtime error. |

## Live-session Roomi messages

- A successful `POST /sessions` generates a `start` message through Gemini and broadcasts it to every subscribed participant. If Gemini is unavailable, Roomi sends a deterministic template instead.
- During a `studying` session, a `distracted` or `away` status update can generate a private `focus_recovery` message for that participant. The server limits this to one message per participant per five minutes.
- The renderer listens for `roomi:message` and displays the latest message in the StudyRoom Roomi panel. Focus-recovery text never travels through `room:updated` snapshots.

REST joins also publish `room:updated` to clients already subscribed to the room, so a host waiting in the room sees new participants without refreshing.

## Environment

Roomi uses separate environment files for the API server and the desktop renderer.
Keep server secrets only on the machine that runs the central API server.

### API Server Environment

Copy the root `.env.example` to the repository root `.env` on the API server machine.
The API server loads the root `.env` first, then loads `services/api/.env` if it exists. Values in `services/api/.env` override the root file, which is useful for server-specific deployment settings.

| Variable | Purpose |
|---|---|
| `API_PORT` | Backend HTTP and Socket.IO port. |
| `API_HOST` | Backend listen host. Use `0.0.0.0` when the API must accept LAN or deployed traffic. |
| `CLIENT_ORIGIN` | Comma-separated allowlist of renderer/browser origins allowed by REST CORS and Socket.IO CORS. Supports `*` inside an origin pattern, but a bare `*` is ignored. |
| `DAILY_API_KEY` | Daily API key for room/token creation. |
| `DAILY_DOMAIN` | Daily domain used by the video provider. |
| `GEMINI_API_KEY` | Google Gemini API key for goal refinement, kept server-side only. When unset, `POST /goals/refine` returns a deterministic template instead of calling the LLM. |
| `ROOMI_ML_API_URL` | Internal ML server base URL. Defaults to `http://192.168.0.83:8080`; keep this server-side. |
| `ROOMI_ML_API_TIMEOUT_MS` | Timeout in milliseconds for central API requests to the internal ML server. Defaults to `5000`. |

During local development, the API also accepts renderer origins on `localhost` and `127.0.0.1` in the `5100-5199` port range. Packaged Electron requests are allowed with the `file://` and serialized `null` origins. This lets Electron and a browser guest join the same central API. If another PC serves the renderer from a LAN address, add an exact origin or a narrow wildcard such as `http://192.168.*:5175`.

Daily credentials belong only in the API server `.env`. The renderer receives a Daily room URL and participant token from `POST /rooms` or `POST /rooms/join`; it must not receive `DAILY_API_KEY`.

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

To let multiple PCs join the same Roomi room during development, run one API server on the host machine and point every client at that server.

Server `.env` example:

```env
API_PORT=4100
API_HOST=0.0.0.0
CLIENT_ORIGIN=http://localhost:5175,http://127.0.0.1:5175,http://192.168.*:5175
DAILY_API_KEY=...
DAILY_DOMAIN=...
ROOMI_ML_API_URL=http://192.168.0.83:8080
ROOMI_ML_API_TIMEOUT_MS=5000
GEMINI_API_KEY=
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

Client `apps/desktop/.env` example for the desktop renderer:

```env
VITE_ROOMI_API_URL=http://192.168.0.23:4100
```

With that setting, REST room creation/join and Socket.IO subscriptions both connect to the central API server. The host creates a room with `POST /rooms`, another participant joins with `POST /rooms/join`, and all subscribed clients receive participant changes through `room:updated`.

## Cloudflare Tunnel for External Access

If the central API server runs inside a restricted campus network, such as KAIST internal network, expose it through Cloudflare Tunnel instead of opening inbound firewall ports.

Roomi API server `.env` on the internal server. Put this in the repository root `.env`, or in `services/api/.env` if this server needs API-only overrides:

```env
API_PORT=4100
API_HOST=127.0.0.1
CLIENT_ORIGIN=http://localhost:5175,http://127.0.0.1:5175,http://192.168.*:5175
DAILY_API_KEY=...
DAILY_DOMAIN=...
GEMINI_API_KEY=
```

Run Roomi API locally on the internal server:

```sh
pnpm dev:api
```

For a named Cloudflare Tunnel, route a public hostname such as `roomi-api.example.com` to the local API service:

```yaml
tunnel: <cloudflare-tunnel-id>
credentials-file: /home/roomi/.cloudflared/<cloudflare-tunnel-id>.json

ingress:
  - hostname: roomi-api.example.com
    service: http://localhost:4100
  - service: http_status:404
```

Then run the tunnel with `cloudflared tunnel run <tunnel-name>`. For short-lived demos, a quick tunnel can point directly at the local API:

```sh
cloudflared tunnel --url http://localhost:4100
```

Clients outside the campus network should use the Cloudflare HTTPS URL:

```env
VITE_ROOMI_API_URL=https://api.roomi.madcamp-kaist.org
```

Socket.IO uses the same API base URL, so WebSocket/polling traffic follows the tunnel with the REST API. If the renderer is served from a non-local browser origin, add that browser origin to `CLIENT_ORIGIN`; do not add the API hostname unless the browser page itself is served from that hostname.

## Storage Limit

The current API uses `InMemoryRoomStore`, so rooms and participants are shared only inside one running API process and disappear when that process restarts. This is acceptable for MVP LAN testing, but production or long-running deployments need a persistent `RoomStore` implementation behind the existing `RoomStore` interface.
