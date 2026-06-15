function shuffleArray(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}


function detectPlaylistSource(url) {
  if (!url) return null;

  const value = String(url).trim().toLowerCase();
  if (value.includes("open.spotify.com/playlist/") || value.startsWith("spotify:playlist:")) return "spotify";
  if (value.includes("deezer.com/") && value.includes("/playlist/")) return "deezer";
  if (value.includes("deezer.page.link/")) return "deezer";

  return null;
}

function extractDeezerPlaylistId(url) {
  if (!url) return null;

  const value = String(url).trim();
  const playlistMatch = value.match(/deezer\.com\/(?:[a-z]{2}\/)?playlist\/(\d+)/i);
  if (playlistMatch) return playlistMatch[1];

  return /^\d+$/.test(value) ? value : null;
}

function extractPlaylistId(url) {
  if (!url) return null;

  const value = String(url).trim();
  const openSpotifyMatch = value.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  if (openSpotifyMatch) return openSpotifyMatch[1];

  const uriMatch = value.match(/^spotify:playlist:([a-zA-Z0-9]+)$/);
  if (uriMatch) return uriMatch[1];

  return /^[a-zA-Z0-9]{20,}$/.test(value) ? value : null;
}

function normalizeAnswer(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/s+/g, " ")
    .trim();
}

function levenshteinDistance(a, b) {
  const left = normalizeAnswer(a);
  const right = normalizeAnswer(b);
  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));

  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function similarityLevenshtein(a, b) {
  const left = normalizeAnswer(a);
  const right = normalizeAnswer(b);
  const maxLength = Math.max(left.length, right.length);

  if (maxLength === 0) return 1;

  return 1 - levenshteinDistance(left, right) / maxLength;
}

function isCloseEnough(userAnswer, realAnswer) {
  return similarityLevenshtein(userAnswer, realAnswer) >= 0.8;
}

function parseRequestedTrackCount(value) {
  const count = Number(value);
  return [10, 20, 30].includes(count) ? count : 10;
}

function parsePlayers(body) {
  const playerCount = Math.min(Math.max(Number(body.playerCount || 1), 1), 12);
  const names = Array.isArray(body.playerNames) ? body.playerNames : [body.playerNames];

  return Array.from({ length: playerCount }, (_, index) => ({
    id: String(index + 1),
    name: String(names[index] || "").trim() || "Joueur " + (index + 1),
    score: 0,
  }));
}

module.exports = {
  shuffleArray,
  detectPlaylistSource,
  extractDeezerPlaylistId,
  extractPlaylistId,
  normalizeAnswer,
  levenshteinDistance,
  similarityLevenshtein,
  isCloseEnough,
  parseRequestedTrackCount,
  parsePlayers,
};
