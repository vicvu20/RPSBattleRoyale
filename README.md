# RPS Royale (Jackbox-style MVP)

A real-time Rock Paper Scissors tournament game:
- `Host screen` creates lobby and starts bracket
- `Player screen` joins by code from phones
- Best-of-3 matches, winners advance until one champion remains

## Run locally

```bash
npm install
npm start
```

Open:
- `http://localhost:3000/host` on main screen
- `http://localhost:3000/play` on player devices

## Notes

- Server state is in-memory (resets on restart)
- If host disconnects, lobby closes
- If player disconnects mid-match, they forfeit
