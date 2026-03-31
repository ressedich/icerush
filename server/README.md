## Ice Rush WS backend (100% online)

This server provides **authoritative 1v1** via WebSocket. Clients only send striker target positions.

### Local run
```bash
cd server
npm i
npm start
```
Health: `http://localhost:8080/health`

### Deploy (Docker)
Build + run:
```bash
docker build -t ice-rush-ws .
docker run -p 8080:8080 ice-rush-ws
```

### Frontend config
Set `WS_BACKEND_URL` in `game.js` to your deployed backend, e.g.:
`wss://your-app.onrender.com/ws`

