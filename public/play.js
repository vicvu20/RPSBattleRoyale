const socket = io();

const joinBtn = document.getElementById("joinBtn");
const nameInput = document.getElementById("name");
const codeInput = document.getElementById("code");
const joinErrorEl = document.getElementById("joinError");
const identityEl = document.getElementById("identity");
const stateEl = document.getElementById("state");
const roundEl = document.getElementById("round");
const messageEl = document.getElementById("message");
const opponentEl = document.getElementById("opponent");
const scoreEl = document.getElementById("score");
const moveButtons = [...document.querySelectorAll("[data-move]")];

let joinedCode = "";
let joinedName = "";

function setMoveEnabled(enabled) {
  for (const btn of moveButtons) {
    btn.disabled = !enabled;
  }
}

setMoveEnabled(false);

joinBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  const code = codeInput.value.trim().toUpperCase();
  joinErrorEl.textContent = "";
  socket.emit("player:join", { code, name });
});

for (const button of moveButtons) {
  button.addEventListener("click", () => {
    if (!joinedCode) return;
    socket.emit("player:move", { code: joinedCode, move: button.dataset.move });
  });
}

socket.on("player:error", (msg) => {
  joinErrorEl.textContent = msg;
});

socket.on("player:joined", ({ code, name }) => {
  joinedCode = code;
  joinedName = name;
  identityEl.textContent = `You: ${name} | Lobby: ${code}`;
  messageEl.textContent = "Joined. Waiting for host to start.";
});

socket.on("player:status", (payload) => {
  stateEl.textContent = payload.phase.replace("_", " ");
  roundEl.textContent = `Round: ${payload.round || "-"}`;

  if (payload.phase === "finished") {
    if (payload.champion === joinedName) {
      messageEl.textContent = "You are the champion.";
    } else {
      messageEl.textContent = `Tournament ended. Champion: ${payload.champion || "-"}`;
    }
    setMoveEnabled(false);
    opponentEl.textContent = "Opponent: -";
    scoreEl.textContent = "Score: -";
    return;
  }

  if (payload.you.eliminated) {
    messageEl.textContent = "You are eliminated. Watching results.";
    setMoveEnabled(false);
    opponentEl.textContent = "Opponent: -";
    scoreEl.textContent = "Score: -";
    return;
  }

  if (!payload.match) {
    messageEl.textContent = payload.phase === "waiting" ? "Waiting in lobby." : "Waiting for next match.";
    setMoveEnabled(false);
    opponentEl.textContent = "Opponent: -";
    scoreEl.textContent = "Score: -";
    return;
  }

  opponentEl.textContent = `Opponent: ${payload.match.opponent}`;
  scoreEl.textContent = `Score: ${payload.match.yourScore} - ${payload.match.opponentScore}`;

  if (payload.match.youLocked) {
    messageEl.textContent = payload.match.opponentLocked ? "Resolving..." : "Move locked. Waiting for opponent.";
    setMoveEnabled(false);
  } else {
    messageEl.textContent = "Choose your move.";
    setMoveEnabled(true);
  }
});

socket.on("player:roundResult", ({ yourMove, opponentMove, yourScore, opponentScore }) => {
  messageEl.textContent = `You played ${yourMove}, opponent played ${opponentMove}.`;
  scoreEl.textContent = `Score: ${yourScore} - ${opponentScore}`;
});

socket.on("player:message", (msg) => {
  messageEl.textContent = msg;
});
