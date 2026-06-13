# Video Support Platform

Self-hosted LiveKit video support app for AtomQuest: agent creates a session, customer joins by invite, both use server-routed audio/video, chat, file sharing, history, admin dashboard, metrics, and recording controls.

## Local Demo

Requirements:
- Node.js 20+
- Docker Desktop
- Chrome/Edge for browser testing

Start infra and app:

```powershell
npm.cmd install
npm.cmd run local:start
npm.cmd run dev
```

Open:
- Agent app: http://localhost:5173
- API health: http://localhost:4000/health
- Metrics: http://localhost:4000/metrics

Demo login:

```text
agent@demo.com / demo1234
```

For LAN testing, use the host IP configured in `.env` and `infra/livekit-native/livekit.yaml` (currently `192.168.1.2`). Customer laptop opens the copied invite link.

## Recording

Recording uses LiveKit Egress:
- Redis and `livekit/egress` run from `infra/docker-compose.yml`.
- Native Windows LiveKit runs from `infra/livekit-native/livekit-server.exe`.
- Egress writes MP4s into `recordings/` through the `/out/recordings` container mount.

If Docker/Egress is not running, Start recording fails safely with `FAILED` status instead of breaking the call.

## Useful Commands

```powershell
npm.cmd run local:start
npm.cmd run local:stop
npm.cmd run infra:status
npm.cmd run infra:egress:logs
npm.cmd run dev
npm.cmd run build --workspace=apps/api
npm.cmd run build --workspace=apps/web
cd apps/api; npx.cmd tsx scripts\smoke.ts
```

## Implemented

- Agent auth and RBAC
- Session create/list/detail/end
- Customer invite join
- Server-routed LiveKit audio/video/screen share
- Persisted chat transcript
- File sharing in call and history
- Participant join/leave history via webhooks
- Admin live dashboard
- Prometheus metrics
- Recording UI/API/status/download path
