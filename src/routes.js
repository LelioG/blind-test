const fs = require("fs");
const path = require("path");
const { state, resetGameState, currentQuestion } = require("./state");
const { detectPlaylistSource, extractDeezerPlaylistId, extractPlaylistId, parsePlayers, parseRequestedTrackCount } = require("./utils");
const { spotifyAuthUrl, exchangeCodeForToken, getSpotifyPlaylistTracks } = require("./spotify");
const { getDeezerPlaylistTracks, prepareDeezerPlayableTracks, preparePlayableTracks } = require("./deezer");

const reactIndexPath = path.resolve(process.cwd(), "client", "dist", "index.html");

function sendReactApp(res) {
  if (fs.existsSync(reactIndexPath)) {
    return res.type("html").send(fs.readFileSync(reactIndexPath, "utf8"));
  }

  return res.status(503).type("html").send(`<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><title>Blind Test</title></head>
  <body><p>Frontend React non construit. Lance <code>npm run build</code>.</p></body>
</html>`);
}

function isTeamMode() {
  return state.gameState.gameMode === "teams";
}

function getScoringEntries() {
  return isTeamMode() ? state.gameState.teams : state.gameState.players;
}

function getRanking() {
  return [...getScoringEntries()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function serializeRanking() {
  const ranking = getRanking();
  let previousScore = null;
  let previousRank = 0;

  return ranking.map((entry, index) => {
    const rank = entry.score === previousScore ? previousRank : index + 1;
    previousScore = entry.score;
    previousRank = rank;
    return { ...(isTeamMode() ? serializeTeam(entry) : serializePlayer(entry)), rank };
  });
}

function toIdArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return value ? [String(value)] : [];
}

function awardToTargets(targetIds, points) {
  const uniqueIds = [...new Set(toIdArray(targetIds))];

  for (const targetId of uniqueIds) {
    if (isTeamMode()) {
      const member = findTeamMember(targetId);
      if (!member) continue;
      member.member.score += points;
      member.team.score += points;
    } else {
      const player = state.gameState.players.find((candidate) => candidate.id === targetId);
      if (player) player.score += points;
    }
  }
}

function findTeamMember(memberId) {
  for (const team of state.gameState.teams) {
    const member = team.members.find((candidate) => candidate.id === memberId);
    if (member) return { team, member };
  }

  return null;
}

function serializePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    score: player.score,
  };
}

function serializeTeam(team) {
  return {
    id: team.id,
    name: team.name,
    score: team.score,
    members: team.members.map(serializePlayer),
  };
}

function serializeAwardTarget(target) {
  return {
    id: target.id,
    name: target.name,
    score: target.score,
    teamId: target.teamId || null,
    teamName: target.teamName || null,
    label: target.teamName ? target.name + " (" + target.teamName + ")" : target.name,
  };
}

function getAwardTargets() {
  if (!isTeamMode()) return state.gameState.players.map(serializeAwardTarget);

  return state.gameState.teams.flatMap((team) => team.members.map((member) => serializeAwardTarget({
    ...member,
    teamId: team.id,
    teamName: team.name,
  })));
}

function serializeTrack(track, index) {
  if (!track) return null;

  return {
    id: track.id,
    round: index + 1,
    source: track.source || null,
    title: track.title || track.spotifyTitle,
    artist: track.artist || track.spotifyArtist,
    fullName: track.fullName || ((track.spotifyTitle || "") + " - " + (track.spotifyArtist || "")),
    spotifyTitle: track.spotifyTitle || track.title,
    spotifyArtist: track.spotifyArtist || track.artist,
    deezerTitle: track.deezerTitle || track.title,
    deezerArtist: track.deezerArtist || track.artist,
    preview: track.preview,
    albumCover: track.albumCover,
    featuredArtists: Array.isArray(track.featuredArtists) ? track.featuredArtists : [],
    alreadyPlayed: Boolean(track.alreadyPlayed),
  };
}

function serializeGame() {
  const game = state.gameState;
  const totalRounds = game.playableTracks.length;
  const currentRoundIndex = game.currentRoundIndex;
  const question = currentQuestion();
  let stage = "setup";

  if (game.playlistUrl && !game.gameStarted) stage = "ready";
  if (game.gameStarted && currentRoundIndex < totalRounds) stage = "playing";
  if (game.gameStarted && totalRounds > 0 && currentRoundIndex >= totalRounds) stage = "results";

  return {
    spotifyConnected: Boolean(state.accessToken),
    stage,
    gameMode: game.gameMode || "players",
    playlistUrl: game.playlistUrl,
    playlistSource: game.playlistSource,
    requestedTrackCount: game.requestedTrackCount,
    players: game.players.map(serializePlayer),
    teams: game.teams.map(serializeTeam),
    scoreEntries: getScoringEntries().map((entry) => isTeamMode() ? serializeTeam(entry) : serializePlayer(entry)),
    awardTargets: getAwardTargets(),
    totalRounds,
    currentRoundIndex,
    currentRoundNumber: Math.min(currentRoundIndex + 1, Math.max(totalRounds, 1)),
    currentTrack: serializeTrack(question, currentRoundIndex),
    preparationStats: game.preparationStats,
    ranking: serializeRanking(),
  };
}

function parseApiPlayers(body) {
  if (Array.isArray(body.players)) {
    return body.players
      .map((player, index) => ({
        id: String(player.id || index + 1),
        name: String(player.name || "").trim() || "Joueur " + (index + 1),
        score: Number(player.score || 0),
      }))
      .slice(0, 12);
  }

  return parsePlayers(body);
}

function parseApiTeams(body) {
  if (!Array.isArray(body.teams)) return [];

  return body.teams
    .map((team, teamIndex) => {
      const teamId = String(team.id || "team-" + (teamIndex + 1));
      const members = Array.isArray(team.members) ? team.members : [];

      return {
        id: teamId,
        name: String(team.name || "").trim() || "Team " + (teamIndex + 1),
        score: Number(team.score || 0),
        members: members
          .map((member, memberIndex) => ({
            id: String(member.id || teamId + "-member-" + (memberIndex + 1)),
            name: String(member.name || "").trim() || "Joueur " + (memberIndex + 1),
            score: Number(member.score || 0),
          }))
          .slice(0, 12),
      };
    })
    .filter((team) => team.members.length > 0)
    .slice(0, 8);
}

function sendApiError(res, status, message, details) {
  return res.status(status).json({ ok: false, error: message, details: details || null });
}

function sendOAuthError(res, status, message, details) {
  const params = new URLSearchParams({ error: message });
  if (details) params.set("details", String(details));

  if (fs.existsSync(reactIndexPath)) {
    return res.redirect("/?" + params.toString());
  }

  return res.status(status).type("text").send(details ? message + "\n" + details : message);
}

async function prepareGameFromState() {
  const source = state.gameState.playlistSource || detectPlaylistSource(state.gameState.playlistUrl);
  const requestedCount = state.gameState.requestedTrackCount;
  let prepared;

  if (source === "spotify") {
    if (!state.accessToken) {
      const error = new Error("Connecte-toi d'abord avec Spotify pour utiliser une playlist Spotify.");
      error.statusCode = 401;
      throw error;
    }

    const playlistId = extractPlaylistId(state.gameState.playlistUrl);
    if (!playlistId) {
      const error = new Error("Playlist Spotify invalide.");
      error.statusCode = 400;
      throw error;
    }

    const allSpotifyTracks = await getSpotifyPlaylistTracks(playlistId);

    if (allSpotifyTracks.length === 0) {
      const error = new Error("Spotify ne renvoie aucun titre lisible pour cette playlist.");
      error.statusCode = 400;
      throw error;
    }

    prepared = await preparePlayableTracks(allSpotifyTracks, Math.min(requestedCount, allSpotifyTracks.length));
    state.gameState.allSpotifyTracks = allSpotifyTracks;
  } else if (source === "deezer") {
    const deezerTracks = await getDeezerPlaylistTracks(state.gameState.playlistUrl);

    if (deezerTracks.length === 0) {
      const error = new Error("Playlist Deezer introuvable, privee ou sans titres accessibles.");
      error.statusCode = 404;
      throw error;
    }

    prepared = prepareDeezerPlayableTracks(deezerTracks, requestedCount);
  } else {
    const error = new Error("Source de playlist non reconnue. Colle un lien Spotify ou un lien Deezer contenant /playlist/ID.");
    error.statusCode = 400;
    throw error;
  }

  if (prepared.playableTracks.length === 0) {
    const error = new Error(source === "deezer"
      ? "Aucune preview disponible dans cette playlist Deezer."
      : "Aucun titre selectionne n'a de preview Deezer utilisable.");
    error.statusCode = 400;
    error.details = prepared.stats;
    throw error;
  }

  state.gameState.playlistSource = source;
  state.gameState.playableTracks = prepared.playableTracks;
  state.gameState.preparationStats = prepared.stats;
  state.gameState.currentRoundIndex = 0;
  state.gameState.gameStarted = true;

  return state.gameState;
}

function registerApiRoutes(app) {
  app.get("/api/session", (req, res) => {
    res.json({ ok: true, game: serializeGame() });
  });

  app.post("/api/setup", (req, res) => {
    const playlistUrl = String(req.body.playlistUrl || "").trim();
    const playlistSource = detectPlaylistSource(playlistUrl);

    if (!playlistSource) {
      return sendApiError(res, 400, "Source non reconnue. Colle un lien Spotify ou un lien Deezer classique contenant /playlist/ID.");
    }

    if (playlistSource === "spotify" && !extractPlaylistId(playlistUrl)) {
      return sendApiError(res, 400, "Colle un lien de playlist Spotify valide.");
    }

    if (playlistSource === "deezer" && !extractDeezerPlaylistId(playlistUrl)) {
      return sendApiError(res, 400, "Lien Deezer invalide. Utilise un lien classique contenant /playlist/ID, pas un lien deezer.page.link.");
    }

    if (playlistSource === "spotify" && !state.accessToken) {
      return sendApiError(res, 401, "Connecte-toi d'abord avec Spotify pour utiliser une playlist Spotify.");
    }

    const gameMode = req.body.gameMode === "teams" ? "teams" : "players";
    const players = gameMode === "players" ? parseApiPlayers(req.body) : [];
    const teams = gameMode === "teams" ? parseApiTeams(req.body) : [];

    if (gameMode === "players" && players.length === 0) {
      return sendApiError(res, 400, "Ajoute au moins un joueur.");
    }

    if (gameMode === "teams" && teams.length < 2) {
      return sendApiError(res, 400, "Ajoute au moins deux teams avec des joueurs.");
    }

    resetGameState({
      gameMode,
      players,
      teams,
      playlistUrl,
      playlistSource,
      requestedTrackCount: parseRequestedTrackCount(req.body.requestedTrackCount),
    });

    res.json({ ok: true, game: serializeGame() });
  });


  app.get("/api/deezer-playlist", async (req, res) => {
    try {
      const playlistUrl = String(req.query.url || req.query.id || "").trim();
      const tracks = await getDeezerPlaylistTracks(playlistUrl);
      res.json({ ok: true, tracks });
    } catch (error) {
      sendApiError(res, error.statusCode || 502, error.message || "Erreur API Deezer.", error.details || error.deezer || null);
    }
  });

  app.post("/api/prepare-game", async (req, res) => {
    try {
      await prepareGameFromState();
      res.json({ ok: true, game: serializeGame() });
    } catch (error) {
      sendApiError(res, error.statusCode || 502, error.message || "Impossible de preparer la partie.", error.details || error.spotify || error.deezer || null);
    }
  });

  app.get("/api/game", (req, res) => {
    res.json({ ok: true, game: serializeGame() });
  });

  app.post("/api/award-points", (req, res) => {
    const question = currentQuestion();
    if (!question) return sendApiError(res, 404, "Aucune manche en cours.");
    if (question.alreadyPlayed) return sendApiError(res, 409, "Les points de cette manche ont deja ete attribues.");

    awardToTargets(req.body.titleWinnerIds || req.body.titleWinnerId, 2);
    awardToTargets(req.body.artistWinnerIds || req.body.artistWinnerId, 1);

    const featuredArtists = Array.isArray(question.featuredArtists) ? question.featuredArtists : [];
    const featWinnerIds = Array.isArray(req.body.featWinnerIds) ? req.body.featWinnerIds : [];
    featuredArtists.forEach((_, index) => {
      awardToTargets(featWinnerIds[index], 1);
    });

    question.alreadyPlayed = true;
    res.json({ ok: true, game: serializeGame() });
  });

  app.post("/api/next-round", (req, res) => {
    if (!state.gameState.gameStarted) return sendApiError(res, 400, "La partie n'a pas encore commence.");

    state.gameState.currentRoundIndex += 1;
    res.json({ ok: true, game: serializeGame() });
  });

  app.get("/api/results", (req, res) => {
    const ranking = serializeRanking();
    res.json({ ok: true, winner: ranking[0] || null, ranking, game: serializeGame() });
  });

  app.post("/api/reset", (req, res) => {
    const previousPlaylistUrl = state.gameState.playlistUrl;
    const previousGameMode = state.gameState.gameMode;
    const previousPlayers = state.gameState.players.map((player) => ({ ...player, score: 0 }));
    const previousTeams = state.gameState.teams.map((team) => ({
      ...team,
      score: 0,
      members: team.members.map((member) => ({ ...member, score: 0 })),
    }));
    const previousRequestedTrackCount = state.gameState.requestedTrackCount;
    const mode = req.body.mode;
    resetGameState(mode === "same" ? {
      gameMode: previousGameMode,
      players: previousPlayers,
      teams: previousTeams,
      playlistUrl: previousPlaylistUrl,
      playlistSource: state.gameState.playlistSource,
      requestedTrackCount: previousRequestedTrackCount,
    } : {});
    res.json({ ok: true, game: serializeGame() });
  });
}

function registerRoutes(app) {
  registerApiRoutes(app);

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  app.get("/login", (req, res) => {
    res.redirect(spotifyAuthUrl());
  });

  app.get("/callback", async (req, res) => {
    if (req.query.error) {
      return sendOAuthError(res, 400, "Spotify a refuse la connexion.", String(req.query.error));
    }

    if (!req.query.code) {
      return sendOAuthError(res, 400, "Spotify n'a pas renvoye de code d'autorisation.");
    }

    try {
      state.accessToken = await exchangeCodeForToken(String(req.query.code));
      res.redirect("/");
    } catch (error) {
      const details = JSON.stringify(error.spotify || { message: error.message }, null, 2);
      sendOAuthError(res, 502, "Impossible d'obtenir le token Spotify.", details);
    }
  });

  app.get(/^(?!\/api(?:\/|$)|\/login$|\/callback$|\/health$).*/, (req, res) => {
    sendReactApp(res);
  });
}

module.exports = { registerRoutes };
