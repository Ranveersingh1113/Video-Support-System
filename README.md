# Video Support Platform

Self-hosted LiveKit video support app for AtomQuest: agent creates a session, customer joins by invite, both use server-routed audio/video, chat, file sharing, history, admin dashboard, metrics, and recording controls.

> **Note:** The deployment and infrastructure config (Fly.io, Oracle Cloud, the
> `infra/` directory, and the production Docker stack) has been removed. The
> application source under `apps/` remains, but you'll need to provision your own
> LiveKit SFU, PostgreSQL, and Redis (plus a LiveKit Egress worker for recording)
> and point the app at them via environment variables before it will run. See
> `.env.example` for the required values.

## Development

Requirements:
- Node.js 20+
- A reachable LiveKit server, PostgreSQL, and Redis (configure via `.env`)

```bash
npm install
cp .env.example .env   # then fill in real values
npm run dev
```

Open:
- Agent app: http://localhost:5173
- API health: http://localhost:4000/health
- Metrics: http://localhost:4000/metrics

Demo login:

```text
agent@demo.com / demo1234
```

## Useful Commands

```bash
npm run dev                              # run api + web together
npm run dev:api                          # api only
npm run dev:web                          # web only
npm run build --workspace=apps/api
npm run build --workspace=apps/web
npm run smoke                            # api smoke test
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
