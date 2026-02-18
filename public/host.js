const socket = io();

const createLobbyBtn = document.getElementById("createLobby");
const startGameBtn = document.getElementById("startGame");
const lobbyCodeEl = document.getElementById("lobbyCode");
const hostErrorEl = document.getElementById("hostError");
const playersEl = document.getElementById("players");
const matchesEl = document.getElementById("matches");
const phaseEl = document.getElementById("phase");
const roundEl = document.getElementById("round");
const championEl = document.getElementById("champion");

let currentCode = null;

function textPhase(phase) {
  if (phase === "waiting") return "Waiting for Players";
  if (phase === "in_progress") return "In Progress";
  if (phase === "finished") return "Finished";
  return phase;
}

function renderList(container, items, emptyText) {
  container.innerHTML = "";
  if (!items.length) {
    const div = document.createElement("div");
    div.className = "item small";
    div.textContent = emptyText;
    container.appendChild(div);
    return;
  }

  for (const item of items) {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = item;
    container.appendChild(div);
  }
}

createLobbyBtn.addEventListener("click", () => {
  hostErrorEl.textContent = "";
  socket.emit("host:createLobby");
});

startGameBtn.addEventListener("click", () => {
  hostErrorEl.textContent = "";
  if (!currentCode) {
    hostErrorEl.textContent = "Create a lobby first.";
    return;
  }
  socket.emit("host:start", { code: currentCode });
});

socket.on("host:error", (msg) => {
  hostErrorEl.textContent = msg;
});

socket.on("host:lobbyState", (state) => {
  currentCode = state.code;
  lobbyCodeEl.textContent = state.code;
  phaseEl.textContent = textPhase(state.phase);
  roundEl.textContent = `Round: ${state.round || "-"}`;

  championEl.textContent = state.champion ? `Champion: ${state.champion}` : "";

  const playerRows = state.players.map((p) => {
    const status = p.eliminated
      ? "Eliminated"
      : p.connected
      ? "Active"
      : "Disconnected";
    const statusClass = p.eliminated ? "eliminated" : p.connected ? "active" : "disconnected";
    return `<span>${p.name}</span><span class="host-pill ${statusClass}">${status}</span>`;
  });
  renderList(playersEl, playerRows, "No players yet.");

  const matchRows = state.matches.map((m) => {
    const result = m.completed ? `Winner: ${m.winner}` : "Playing";
    const resultClass = m.completed ? "winner" : "playing";
    return `<span>${m.p1} (${m.score.p1}) vs ${m.p2} (${m.score.p2})</span><span class="host-pill ${resultClass}">${result}</span>`;
  });
  renderList(matchesEl, matchRows, "No matches yet.");
});
