const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const LOBBY_CODE_LENGTH = 5;
const WIN_TARGET = 2;

const lobbies = new Map();
const socketMeta = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/host", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "host.html"));
});

app.get("/play", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "play.html"));
});

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < LOBBY_CODE_LENGTH; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function createUniqueCode() {
  let code = randomCode();
  while (lobbies.has(code)) {
    code = randomCode();
  }
  return code;
}

function shuffle(list) {
  const clone = [...list];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function determineRoundWinner(a, b) {
  if (a === b) return null;
  if (
    (a === "rock" && b === "scissors") ||
    (a === "paper" && b === "rock") ||
    (a === "scissors" && b === "paper")
  ) {
    return "a";
  }
  return "b";
}

function getPlayerMatch(lobby, playerId) {
  for (const match of lobby.matches.values()) {
    if (!match.completed && (match.p1Id === playerId || match.p2Id === playerId)) {
      return match;
    }
  }
  return null;
}

function playerName(lobby, playerId) {
  const player = lobby.players.get(playerId);
  return player ? player.name : "Unknown";
}

function hostState(lobby) {
  const players = [...lobby.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    eliminated: p.eliminated,
    connected: p.connected,
  }));

  const matches = [...lobby.matches.values()].map((m) => ({
    id: m.id,
    round: m.round,
    completed: m.completed,
    score: { ...m.score },
    p1: playerName(lobby, m.p1Id),
    p2: playerName(lobby, m.p2Id),
    winner: m.winnerId ? playerName(lobby, m.winnerId) : null,
  }));

  return {
    code: lobby.code,
    phase: lobby.phase,
    round: lobby.round,
    players,
    matches,
    champion: lobby.championId ? playerName(lobby, lobby.championId) : null,
  };
}

function emitHostState(lobby) {
  if (!lobby.hostSocketId) return;
  io.to(lobby.hostSocketId).emit("host:lobbyState", hostState(lobby));
}

function emitPlayerStatus(lobby, player) {
  const match = getPlayerMatch(lobby, player.id);
  const payload = {
    code: lobby.code,
    phase: lobby.phase,
    round: lobby.round,
    you: {
      name: player.name,
      eliminated: player.eliminated,
    },
    champion: lobby.championId ? playerName(lobby, lobby.championId) : null,
    match: null,
  };

  if (match) {
    const isP1 = match.p1Id === player.id;
    const opponentId = isP1 ? match.p2Id : match.p1Id;
    payload.match = {
      id: match.id,
      opponent: playerName(lobby, opponentId),
      yourScore: isP1 ? match.score.p1 : match.score.p2,
      opponentScore: isP1 ? match.score.p2 : match.score.p1,
      youLocked: Boolean(match.moves[player.id]),
      opponentLocked: Boolean(match.moves[opponentId]),
    };
  }

  io.to(player.id).emit("player:status", payload);
}

function emitAllPlayerStatuses(lobby) {
  for (const player of lobby.players.values()) {
    emitPlayerStatus(lobby, player);
  }
}

function maybeAdvanceRound(lobby) {
  if (lobby.phase !== "in_progress") return;

  const active = [...lobby.matches.values()].some((m) => !m.completed);
  if (active) return;

  const survivors = [...lobby.players.values()].filter((p) => !p.eliminated);
  if (survivors.length <= 1) {
    lobby.phase = "finished";
    lobby.championId = survivors[0] ? survivors[0].id : null;
    emitHostState(lobby);
    emitAllPlayerStatuses(lobby);
    return;
  }

  startNextRound(lobby);
}

function startNextRound(lobby) {
  lobby.round += 1;
  lobby.matches.clear();

  const survivors = shuffle([...lobby.players.values()].filter((p) => !p.eliminated));

  if (survivors.length <= 1) {
    lobby.phase = "finished";
    lobby.championId = survivors[0] ? survivors[0].id : null;
    emitHostState(lobby);
    emitAllPlayerStatuses(lobby);
    return;
  }

  if (survivors.length % 2 === 1) {
    const byePlayer = survivors.pop();
    if (byePlayer) {
      io.to(byePlayer.id).emit("player:message", "You got a bye this round.");
    }
  }

  for (let i = 0; i < survivors.length; i += 2) {
    const p1 = survivors[i];
    const p2 = survivors[i + 1];

    const id = `${lobby.round}-${i / 2 + 1}`;
    lobby.matches.set(id, {
      id,
      round: lobby.round,
      p1Id: p1.id,
      p2Id: p2.id,
      score: { p1: 0, p2: 0 },
      moves: {},
      completed: false,
      winnerId: null,
    });

    io.to(p1.id).emit("player:message", `Match start vs ${p2.name}`);
    io.to(p2.id).emit("player:message", `Match start vs ${p1.name}`);
  }

  emitHostState(lobby);
  emitAllPlayerStatuses(lobby);
}

function forfeitPlayer(lobby, playerId, reason) {
  const match = getPlayerMatch(lobby, playerId);
  if (!match || match.completed) return;

  const winnerId = match.p1Id === playerId ? match.p2Id : match.p1Id;
  match.completed = true;
  match.winnerId = winnerId;

  const loser = lobby.players.get(playerId);
  const winner = lobby.players.get(winnerId);

  if (loser) loser.eliminated = true;

  if (winner && winner.id === match.p1Id) {
    match.score.p1 = WIN_TARGET;
  } else if (winner) {
    match.score.p2 = WIN_TARGET;
  }

  io.to(winnerId).emit("player:message", reason || "Opponent forfeited.");
  emitHostState(lobby);
  emitAllPlayerStatuses(lobby);
  maybeAdvanceRound(lobby);
}

function removeLobby(code, message) {
  const lobby = lobbies.get(code);
  if (!lobby) return;

  for (const player of lobby.players.values()) {
    io.to(player.id).emit("player:error", message || "Lobby closed.");
    socketMeta.delete(player.id);
  }

  if (lobby.hostSocketId) {
    socketMeta.delete(lobby.hostSocketId);
  }

  lobbies.delete(code);
}

io.on("connection", (socket) => {
  socket.on("host:createLobby", () => {
    const code = createUniqueCode();
    const lobby = {
      code,
      hostSocketId: socket.id,
      phase: "waiting",
      round: 0,
      championId: null,
      players: new Map(),
      matches: new Map(),
    };

    lobbies.set(code, lobby);
    socket.join(code);
    socketMeta.set(socket.id, { role: "host", code });

    emitHostState(lobby);
  });

  socket.on("host:start", ({ code }) => {
    const key = String(code || "").trim().toUpperCase();
    const lobby = lobbies.get(key);

    if (!lobby) {
      socket.emit("host:error", "Lobby not found.");
      return;
    }

    if (lobby.hostSocketId !== socket.id) {
      socket.emit("host:error", "Only the host can start.");
      return;
    }

    if (lobby.phase !== "waiting") {
      socket.emit("host:error", "Tournament already started.");
      return;
    }

    if (lobby.players.size < 2) {
      socket.emit("host:error", "Need at least 2 players.");
      return;
    }

    lobby.phase = "in_progress";
    startNextRound(lobby);
  });

  socket.on("player:join", ({ code, name }) => {
    const key = String(code || "").trim().toUpperCase();
    const cleanName = String(name || "").trim().slice(0, 20);
    const lobby = lobbies.get(key);

    if (!lobby) {
      socket.emit("player:error", "Lobby not found.");
      return;
    }

    if (lobby.phase !== "waiting") {
      socket.emit("player:error", "Game already in progress.");
      return;
    }

    if (!cleanName) {
      socket.emit("player:error", "Enter a nickname.");
      return;
    }

    const duplicate = [...lobby.players.values()].some(
      (p) => p.name.toLowerCase() === cleanName.toLowerCase()
    );

    if (duplicate) {
      socket.emit("player:error", "Name already taken in this lobby.");
      return;
    }

    const player = {
      id: socket.id,
      name: cleanName,
      eliminated: false,
      connected: true,
    };

    lobby.players.set(socket.id, player);
    socket.join(key);
    socketMeta.set(socket.id, { role: "player", code: key });

    socket.emit("player:joined", { code: key, name: cleanName });
    emitHostState(lobby);
    emitAllPlayerStatuses(lobby);
  });

  socket.on("player:move", ({ code, move }) => {
    const key = String(code || "").trim().toUpperCase();
    const choice = String(move || "").trim().toLowerCase();
    const lobby = lobbies.get(key);

    if (!lobby || lobby.phase !== "in_progress") {
      socket.emit("player:error", "No active game.");
      return;
    }

    if (!["rock", "paper", "scissors"].includes(choice)) {
      socket.emit("player:error", "Invalid move.");
      return;
    }

    const player = lobby.players.get(socket.id);
    if (!player || player.eliminated) {
      socket.emit("player:error", "You are not active in this game.");
      return;
    }

    const match = getPlayerMatch(lobby, socket.id);
    if (!match) {
      socket.emit("player:error", "You are not in an active match.");
      return;
    }

    if (match.moves[socket.id]) {
      socket.emit("player:error", "Move already locked.");
      return;
    }

    match.moves[socket.id] = choice;
    emitAllPlayerStatuses(lobby);

    const p1Move = match.moves[match.p1Id];
    const p2Move = match.moves[match.p2Id];

    if (!p1Move || !p2Move) {
      return;
    }

    const winner = determineRoundWinner(p1Move, p2Move);

    if (winner === "a") {
      match.score.p1 += 1;
    } else if (winner === "b") {
      match.score.p2 += 1;
    }

    io.to(match.p1Id).emit("player:roundResult", {
      yourMove: p1Move,
      opponentMove: p2Move,
      yourScore: match.score.p1,
      opponentScore: match.score.p2,
    });

    io.to(match.p2Id).emit("player:roundResult", {
      yourMove: p2Move,
      opponentMove: p1Move,
      yourScore: match.score.p2,
      opponentScore: match.score.p1,
    });

    match.moves = {};

    if (match.score.p1 >= WIN_TARGET || match.score.p2 >= WIN_TARGET) {
      match.completed = true;
      const winnerId = match.score.p1 > match.score.p2 ? match.p1Id : match.p2Id;
      const loserId = winnerId === match.p1Id ? match.p2Id : match.p1Id;
      match.winnerId = winnerId;

      const loser = lobby.players.get(loserId);
      if (loser) loser.eliminated = true;

      io.to(winnerId).emit("player:message", "You won this match.");
      io.to(loserId).emit("player:message", "You were eliminated.");

      emitHostState(lobby);
      emitAllPlayerStatuses(lobby);

      setTimeout(() => {
        maybeAdvanceRound(lobby);
      }, 1200);
      return;
    }

    emitHostState(lobby);
    emitAllPlayerStatuses(lobby);
  });

  socket.on("disconnect", () => {
    const meta = socketMeta.get(socket.id);
    if (!meta) return;

    socketMeta.delete(socket.id);
    const lobby = lobbies.get(meta.code);
    if (!lobby) return;

    if (meta.role === "host") {
      removeLobby(meta.code, "Host disconnected. Lobby closed.");
      return;
    }

    const player = lobby.players.get(socket.id);
    if (!player) return;

    if (lobby.phase === "waiting") {
      lobby.players.delete(socket.id);
      emitHostState(lobby);
      emitAllPlayerStatuses(lobby);
      return;
    }

    player.connected = false;
    forfeitPlayer(lobby, socket.id, "Opponent disconnected. You advance.");
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`RPS Royale running on http://localhost:${PORT}`);
});
