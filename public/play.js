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
const battleAnimEl = document.getElementById("battleAnim");
const battleYouImgEl = document.getElementById("battleYouImg");
const battleOppImgEl = document.getElementById("battleOppImg");
const battleEffectEl = document.getElementById("battleEffect");
const vsIntroEl = document.getElementById("vsIntro");
const vsYouNameEl = document.getElementById("vsYouName");
const vsOpponentNameEl = document.getElementById("vsOpponentName");
const moveButtons = [...document.querySelectorAll("[data-move]")];

let joinedCode = "";
let joinedName = "";
let currentMatchId = "";
let vsTimeout = null;
let battleTimeout = null;
const hiddenMoveImage = "/assets/blank.svg";

function moveImage(move) {
  if (move === "paper") return "/assets/paper.svg";
  if (move === "scissors") return "/assets/scissors.svg";
  return "/assets/rock.svg";
}

function decideWinner(you, opp) {
  if (you === opp) return "tie";
  if (
    (you === "rock" && opp === "scissors") ||
    (you === "paper" && opp === "rock") ||
    (you === "scissors" && opp === "paper")
  ) {
    return "you";
  }
  return "opp";
}

function actionType(winnerMove, loserMove) {
  if (winnerMove === "paper" && loserMove === "rock") return "paper-wrap";
  if (winnerMove === "rock" && loserMove === "scissors") return "rock-smash";
  if (winnerMove === "scissors" && loserMove === "paper") return "scissors-cut";
  return "tie";
}

function showBattleAnimation(yourMove, opponentMove) {
  if (!battleAnimEl) return;
  if (battleTimeout) clearTimeout(battleTimeout);

  battleYouImgEl.src = moveImage(yourMove);
  battleOppImgEl.src = moveImage(opponentMove);

  battleAnimEl.className = "battle-anim";
  const winner = decideWinner(yourMove, opponentMove);

  if (winner === "tie") {
    battleEffectEl.textContent = "CLASH";
    battleAnimEl.classList.add("show", "tie");
  } else {
    const winnerMove = winner === "you" ? yourMove : opponentMove;
    const loserMove = winner === "you" ? opponentMove : yourMove;
    const action = actionType(winnerMove, loserMove);
    battleEffectEl.textContent =
      action === "paper-wrap" ? "WRAP" : action === "rock-smash" ? "SMASH" : "CUT";
    battleAnimEl.classList.add("show", action, winner === "you" ? "winner-you" : "winner-opp");
  }

  battleTimeout = setTimeout(() => {
    resetBattleStage();
  }, 1300);
}

function resetBattleStage() {
  battleAnimEl.className = "battle-anim";
  battleYouImgEl.src = hiddenMoveImage;
  battleOppImgEl.src = hiddenMoveImage;
  battleEffectEl.textContent = "FIGHT";
}

function setMoveEnabled(enabled) {
  for (const btn of moveButtons) {
    btn.disabled = !enabled;
  }
}

function showVsIntro(opponentName) {
  if (!vsIntroEl) return;
  if (vsTimeout) clearTimeout(vsTimeout);
  vsYouNameEl.textContent = joinedName || "You";
  vsOpponentNameEl.textContent = opponentName || "Opponent";
  vsIntroEl.classList.add("show");
  vsTimeout = setTimeout(() => {
    vsIntroEl.classList.remove("show");
  }, 2200);
}

setMoveEnabled(false);
resetBattleStage();

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
    currentMatchId = "";
    if (payload.champion === joinedName) {
      messageEl.textContent = "You are the champion.";
    } else {
      messageEl.textContent = `Tournament ended. Champion: ${payload.champion || "-"}`;
    }
    setMoveEnabled(false);
    opponentEl.textContent = "Opponent: -";
    scoreEl.textContent = "Score: -";
    resetBattleStage();
    return;
  }

  if (payload.you.eliminated) {
    currentMatchId = "";
    messageEl.textContent = "You are eliminated. Watching results.";
    setMoveEnabled(false);
    opponentEl.textContent = "Opponent: -";
    scoreEl.textContent = "Score: -";
    resetBattleStage();
    return;
  }

  if (!payload.match) {
    currentMatchId = "";
    messageEl.textContent = payload.phase === "waiting" ? "Waiting in lobby." : "Waiting for next match.";
    setMoveEnabled(false);
    opponentEl.textContent = "Opponent: -";
    scoreEl.textContent = "Score: -";
    resetBattleStage();
    return;
  }

  opponentEl.textContent = `Opponent: ${payload.match.opponent}`;
  scoreEl.textContent = `Score: ${payload.match.yourScore} - ${payload.match.opponentScore}`;
  if (payload.match.id !== currentMatchId) {
    currentMatchId = payload.match.id;
    showVsIntro(payload.match.opponent);
  }

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
  showBattleAnimation(yourMove, opponentMove);
});

socket.on("player:message", (msg) => {
  messageEl.textContent = msg;
});
