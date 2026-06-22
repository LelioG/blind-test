const crypto = require("crypto");
const { state } = require("./state");
const { detectPlaylistSource, extractDeezerPlaylistId, extractPlaylistId, parseRequestedTrackCount, shuffleArray } = require("./utils");
const { getSpotifyPlaylistTracks } = require("./spotify");
const { getDeezerPlaylistTracks, prepareDeezerPlayableTracks, preparePlayableTracks } = require("./deezer");

const rooms = new Map();
const QUESTION_DURATION_MS = 10000;
const MAX_PLAYERS = 40;

function createToken() { return crypto.randomBytes(18).toString("hex"); }

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = "";
    for (let index = 0; index < 6; index += 1) code += alphabet[crypto.randomInt(0, alphabet.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error("Impossible de générer un code de partie.");
}

function cleanExpiredRooms() {
  const expiry = Date.now() - 6 * 60 * 60 * 1000;
  for (const [code, room] of rooms) if (room.updatedAt < expiry) rooms.delete(code);
}

function buildChoices(tracks, correctIndex) {
  const correctTitle = tracks[correctIndex].title;
  const distractors = shuffleArray(tracks
    .filter((_, index) => index !== correctIndex)
    .map((track) => track.title)
    .filter((title, index, titles) => title !== correctTitle && titles.indexOf(title) === index))
    .slice(0, 3);
  return shuffleArray([correctTitle, ...distractors]).map((title, index) => ({ id: `choice-${correctIndex + 1}-${index + 1}`, title }));
}

function getPlayer(room, playerToken) { return room.players.find((player) => player.token === playerToken) || null; }

function getRanking(room) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let previousScore = null;
  let previousRank = 0;
  return sorted.map((player, index) => {
    const rank = player.score === previousScore ? previousRank : index + 1;
    previousScore = player.score;
    previousRank = rank;
    const roundAnswer = player.answers[room.currentRoundIndex] || null;
    return {
      id: player.id,
      name: player.name,
      score: player.score,
      rank,
      roundPoints: roundAnswer?.points || 0,
      roundCorrect: roundAnswer?.correct || false,
      answered: Boolean(roundAnswer),
    };
  });
}

function advanceRoom(room) {
  const now = Date.now();
  if (room.status === "question" && now >= room.phaseEndsAt) {
    room.status = "reveal";
    room.phaseStartedAt = room.phaseEndsAt;
    room.phaseEndsAt = null;
    room.updatedAt = now;
  }
  return room;
}

function serializeRoom(room, role, token) {
  advanceRoom(room);
  const track = room.tracks[room.currentRoundIndex] || null;
  const player = getPlayer(room, token);
  const answer = player?.answers?.[room.currentRoundIndex] || null;
  const revealAnswer = room.status === "reveal" || room.status === "results";
  return {
    code: room.code,
    role,
    status: room.status,
    playlistUrl: role === "host" ? room.playlistUrl : undefined,
    requestedTrackCount: room.requestedTrackCount,
    totalRounds: room.tracks.length,
    currentRoundIndex: room.currentRoundIndex,
    currentRoundNumber: Math.min(room.currentRoundIndex + 1, room.tracks.length),
    phaseStartedAt: room.phaseStartedAt,
    phaseEndsAt: room.phaseEndsAt,
    serverNow: Date.now(),
    players: getRanking(room),
    player: player ? { id: player.id, name: player.name, score: player.score, answer } : null,
    question: track && room.status !== "lobby" ? {
      choices: room.choices[room.currentRoundIndex],
      preview: track.preview,
      albumCover: revealAnswer ? track.albumCover : undefined,
      correctTitle: revealAnswer ? track.title : undefined,
      artist: revealAnswer ? track.artist : undefined,
    } : null,
    preparationStats: role === "host" ? room.preparationStats : undefined,
  };
}

async function prepareTracks(playlistUrl, requestedTrackCount) {
  const source = detectPlaylistSource(playlistUrl);
  let prepared;
  if (source === "spotify") {
    if (!state.accessToken) {
      const error = new Error("Connecte-toi d'abord avec Spotify pour utiliser cette playlist.");
      error.statusCode = 401;
      throw error;
    }
    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) {
      const error = new Error("Playlist Spotify invalide.");
      error.statusCode = 400;
      throw error;
    }
    const tracks = await getSpotifyPlaylistTracks(playlistId);
    prepared = await preparePlayableTracks(tracks, Math.min(requestedTrackCount, tracks.length));
  } else if (source === "deezer") {
    if (!extractDeezerPlaylistId(playlistUrl)) {
      const error = new Error("Lien Deezer invalide. Utilise un lien contenant /playlist/ID.");
      error.statusCode = 400;
      throw error;
    }
    const tracks = await getDeezerPlaylistTracks(playlistUrl);
    prepared = prepareDeezerPlayableTracks(tracks, requestedTrackCount);
  } else {
    const error = new Error("Colle un lien de playlist Spotify ou Deezer valide.");
    error.statusCode = 400;
    throw error;
  }
  const seenTitles = new Set();
  prepared.playableTracks = prepared.playableTracks.filter((track) => {
    const key = String(track.title || "").trim().toLowerCase();
    if (!key || seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });
  if (prepared.playableTracks.length < 4) {
    const error = new Error("Le tournoi nécessite au moins 4 titres avec un extrait audio.");
    error.statusCode = 400;
    throw error;
  }
  return prepared;
}

async function createTournament({ playlistUrl, requestedTrackCount, hostName }) {
  cleanExpiredRooms();
  const count = parseRequestedTrackCount(requestedTrackCount);
  const prepared = await prepareTracks(playlistUrl, count);
  const code = createRoomCode();
  const now = Date.now();
  const cleanHostName = String(hostName || "").trim().slice(0, 28) || "Hôte";
  const hostToken = createToken();
  const room = {
    code,
    hostToken,
    playlistUrl,
    requestedTrackCount: count,
    tracks: prepared.playableTracks,
    choices: prepared.playableTracks.map((_, index, tracks) => buildChoices(tracks, index)),
    preparationStats: prepared.stats,
    players: [{ id: crypto.randomUUID(), token: hostToken, name: cleanHostName, score: 0, answers: {}, isHost: true }],
    status: "lobby",
    currentRoundIndex: 0,
    phaseStartedAt: null,
    phaseEndsAt: null,
    createdAt: now,
    updatedAt: now,
  };
  rooms.set(code, room);
  return { room, token: room.hostToken };
}

function joinTournament(code, name) {
  cleanExpiredRooms();
  const room = rooms.get(String(code || "").trim().toUpperCase());
  if (!room) {
    const error = new Error("Aucune partie ne correspond à ce code.");
    error.statusCode = 404;
    throw error;
  }
  if (room.status !== "lobby") {
    const error = new Error("Cette partie a déjà commencé.");
    error.statusCode = 409;
    throw error;
  }
  if (room.players.length >= MAX_PLAYERS) {
    const error = new Error("Cette partie est complète.");
    error.statusCode = 409;
    throw error;
  }
  const cleanName = String(name || "").trim().slice(0, 28);
  if (!cleanName) {
    const error = new Error("Choisis un pseudo.");
    error.statusCode = 400;
    throw error;
  }
  const player = { id: crypto.randomUUID(), token: createToken(), name: cleanName, score: 0, answers: {} };
  room.players.push(player);
  room.updatedAt = Date.now();
  return { room, token: player.token };
}

function getTournament(code, token) {
  const room = rooms.get(String(code || "").trim().toUpperCase());
  if (!room) {
    const error = new Error("Partie introuvable ou expirée.");
    error.statusCode = 404;
    throw error;
  }
  if (token === room.hostToken) return { room, role: "host" };
  if (getPlayer(room, token)) return { room, role: "player" };
  const error = new Error("Accès à la partie refusé.");
  error.statusCode = 403;
  throw error;
}

function startTournament(code, token) {
  const { room, role } = getTournament(code, token);
  if (role !== "host") {
    const error = new Error("Seul l'hôte peut lancer la partie.");
    error.statusCode = 403;
    throw error;
  }
  if (room.status !== "lobby") {
    const error = new Error("La partie est déjà lancée.");
    error.statusCode = 409;
    throw error;
  }
  const now = Date.now();
  room.status = "question";
  room.currentRoundIndex = 0;
  room.phaseStartedAt = now;
  room.phaseEndsAt = room.phaseStartedAt + QUESTION_DURATION_MS;
  room.updatedAt = now;
  return room;
}

function submitTournamentAnswer(code, token, choiceId) {
  const { room, role } = getTournament(code, token);
  advanceRoom(room);
  if (room.status !== "question") {
    const error = new Error("Les réponses sont fermées pour cette manche.");
    error.statusCode = 409;
    throw error;
  }
  const player = getPlayer(room, token);
  const roundIndex = room.currentRoundIndex;
  if (player.answers[roundIndex]) {
    const error = new Error("Ta réponse est déjà enregistrée.");
    error.statusCode = 409;
    throw error;
  }
  const choice = room.choices[roundIndex].find((candidate) => candidate.id === choiceId);
  if (!choice) {
    const error = new Error("Choix invalide.");
    error.statusCode = 400;
    throw error;
  }
  const answeredAt = Date.now();
  const responseTimeMs = Math.max(0, answeredAt - room.phaseStartedAt);
  const correct = choice.title === room.tracks[roundIndex].title;
  const speedRatio = Math.max(0, 1 - responseTimeMs / QUESTION_DURATION_MS);
  const points = correct ? Math.round(500 + speedRatio * 500) : 0;
  player.score += points;
  player.answers[roundIndex] = { choiceId, correct, points, responseTimeMs };
  room.updatedAt = answeredAt;
  return room;
}


function nextTournamentRound(code, token) {
  const { room, role } = getTournament(code, token);
  advanceRoom(room);
  if (role !== "host") {
    const error = new Error("Seul l'hôte peut passer à la manche suivante.");
    error.statusCode = 403;
    throw error;
  }
  if (room.status !== "reveal") {
    const error = new Error("Attends la fin de la manche avant de continuer.");
    error.statusCode = 409;
    throw error;
  }

  room.currentRoundIndex += 1;
  room.updatedAt = Date.now();
  if (room.currentRoundIndex >= room.tracks.length) {
    room.status = "results";
    room.phaseStartedAt = null;
    room.phaseEndsAt = null;
  } else {
    room.status = "question";
    room.phaseStartedAt = room.updatedAt;
    room.phaseEndsAt = room.phaseStartedAt + QUESTION_DURATION_MS;
  }
  return room;
}

module.exports = { createTournament, joinTournament, getTournament, startTournament, submitTournamentAnswer, nextTournamentRound, serializeRoom };
