const { DEEZER_SEARCH_URL, DEEZER_TIMEOUT_MS, MAX_DEEZER_ATTEMPTS_MULTIPLIER } = require("./config");
const { fetchWithTimeout, readJsonResponse } = require("./http");
const {
  extractDeezerPlaylistId,
  normalizeAnswer,
  shuffleArray,
  extractFeaturedArtistsFromText,
  stripFeaturedCreditsFromTitle,
  normalizeFeaturedArtists,
} = require("./utils");

const DEEZER_PLAYLIST_TRACKS_URL = "https://api.deezer.com/playlist";

async function fetchDeezerJson(url) {
  let response;

  try {
    response = await fetchWithTimeout(url, {}, DEEZER_TIMEOUT_MS);
  } catch (error) {
    const deezerError = new Error("Impossible de contacter l'API Deezer. Reessaie dans quelques instants.");
    deezerError.deezer = { message: error.message };
    throw deezerError;
  }

  const data = await readJsonResponse(response);

  if (!response.ok || data.error) {
    const message = data.error && data.error.message ? data.error.message : "Erreur API Deezer";
    const error = new Error(message);
    error.deezer = data.error || data;
    throw error;
  }

  return data;
}

function normalizeSearchText(value) {
  return normalizeAnswer(value).replace(/\bfeat\b|\bft\b/g, "").trim();
}

function scoreDeezerResult(result, title, artist) {
  const wantedTitle = normalizeSearchText(title);
  const wantedArtist = normalizeSearchText(artist);
  const resultTitle = normalizeSearchText(result.title_short || result.title);
  const resultArtist = normalizeSearchText(result.artist && result.artist.name);
  let score = 0;

  if (result.preview) score += 100;
  if (resultTitle === wantedTitle) score += 50;
  else if (resultTitle.includes(wantedTitle) || wantedTitle.includes(resultTitle)) score += 25;
  if (resultArtist === wantedArtist) score += 40;
  else if (resultArtist.includes(wantedArtist) || wantedArtist.includes(resultArtist)) score += 20;

  return score;
}

function getAlbumCover(album) {
  return album ? album.cover_big || album.cover_medium || album.cover || null : null;
}

function deezerResultToPreview(result) {
  return {
    deezerId: result.id || null,
    deezerTitle: result.title || result.title_short || null,
    deezerArtist: result.artist && result.artist.name ? result.artist.name : null,
    preview: result.preview || null,
    albumCover: getAlbumCover(result.album),
  };
}

function deezerTrackToCommonTrack(track) {
  const rawTitle = track && (track.title || track.title_short);
  const artist = track && track.artist && track.artist.name;

  if (!rawTitle || !artist) return null;

  const contributorArtists = Array.isArray(track.contributors)
    ? track.contributors.map((contributor) => contributor.name).filter(Boolean)
    : [];
  const featuredArtists = normalizeFeaturedArtists(artist, [
    ...contributorArtists,
    ...extractFeaturedArtistsFromText(rawTitle),
  ]);
  const title = stripFeaturedCreditsFromTitle(rawTitle) || rawTitle;

  return {
    source: "deezer",
    title,
    artist,
    featuredArtists,
    fullName: title + " - " + artist,
    preview: track.preview || null,
    albumCover: getAlbumCover(track.album),
    deezerId: track.id || null,
  };
}

function commonTrackToPlayableTrack(track, index) {
  return {
    id: index + 1,
    source: track.source,
    title: track.title,
    artist: track.artist,
    featuredArtists: track.featuredArtists || [],
    fullName: track.fullName,
    preview: track.preview,
    albumCover: track.albumCover,
    deezerId: track.deezerId || null,
    // Compatibility fields kept for existing UI/state consumers.
    spotifyTitle: track.title,
    spotifyArtist: track.artist,
    deezerTitle: track.title,
    deezerArtist: track.artist,
    alreadyPlayed: false,
  };
}

async function searchDeezerPreview(title, artist) {
  const strictQuery = `track:"${title}" artist:"${artist}"`;
  const fallbackQuery = `${title} ${artist}`;
  const queries = [strictQuery, fallbackQuery];

  for (const query of queries) {
    const url = DEEZER_SEARCH_URL + "?q=" + encodeURIComponent(query) + "&limit=5";
    const data = await fetchDeezerJson(url);
    const results = Array.isArray(data.data) ? data.data : [];

    if (results.length === 0) continue;

    const best = results
      .map((result) => ({ result, score: scoreDeezerResult(result, title, artist) }))
      .sort((a, b) => b.score - a.score)[0].result;

    return deezerResultToPreview(best);
  }

  return null;
}

async function getDeezerPlaylistTracks(playlistUrl) {
  const playlistId = extractDeezerPlaylistId(playlistUrl);

  if (!playlistId) {
    const error = new Error("Lien Deezer invalide. Utilise un lien classique contenant /playlist/ID, par exemple https://www.deezer.com/fr/playlist/1234567890.");
    error.statusCode = 400;
    throw error;
  }

  const tracks = [];
  let nextUrl = DEEZER_PLAYLIST_TRACKS_URL + "/" + encodeURIComponent(playlistId) + "/tracks";

  while (nextUrl) {
    let data;

    try {
      data = await fetchDeezerJson(nextUrl);
    } catch (error) {
      const deezerCode = error.deezer && error.deezer.code;
      const message = deezerCode === 800
        ? "Playlist Deezer introuvable, privee ou inaccessible. Verifie que la playlist est publique."
        : "Erreur API Deezer pendant la recuperation de la playlist.";
      const wrapped = new Error(message);
      wrapped.statusCode = deezerCode === 800 ? 404 : 502;
      wrapped.details = error.deezer || { message: error.message };
      throw wrapped;
    }

    const pageTracks = Array.isArray(data.data) ? data.data : [];
    for (const track of pageTracks) {
      const normalized = deezerTrackToCommonTrack(track);
      if (normalized) tracks.push(normalized);
    }

    nextUrl = data.next || null;
  }

  return tracks;
}

async function preparePlayableTracks(allSpotifyTracks, requestedCount) {
  const shuffled = shuffleArray(allSpotifyTracks);
  const playableTracks = [];
  const usedKeys = new Set();
  const maxAttempts = Math.min(shuffled.length, requestedCount * MAX_DEEZER_ATTEMPTS_MULTIPLIER);
  let attempts = 0;
  let deezerErrors = 0;

  for (const spotifyTrack of shuffled) {
    if (playableTracks.length >= requestedCount || attempts >= maxAttempts) break;

    attempts += 1;
    const key = normalizeAnswer(spotifyTrack.spotifyFullName);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);

    console.log("Recherche Deezer : " + spotifyTrack.spotifyFullName);

    try {
      const deezer = await searchDeezerPreview(spotifyTrack.spotifyTitle, spotifyTrack.spotifyArtist);

      if (!deezer || !deezer.preview) {
        console.log("Preview introuvable");
        continue;
      }

      console.log("Preview trouvee");
      playableTracks.push(commonTrackToPlayableTrack({
        source: "spotify",
        title: stripFeaturedCreditsFromTitle(spotifyTrack.spotifyTitle) || spotifyTrack.spotifyTitle,
        artist: spotifyTrack.spotifyPrimaryArtist || spotifyTrack.spotifyArtist,
        featuredArtists: normalizeFeaturedArtists(spotifyTrack.spotifyPrimaryArtist || spotifyTrack.spotifyArtist, [
          ...(spotifyTrack.spotifyFeaturedArtists || []),
          ...extractFeaturedArtistsFromText(spotifyTrack.spotifyTitle),
        ]),
        fullName: spotifyTrack.spotifyFullName,
        preview: deezer.preview,
        albumCover: deezer.albumCover,
        deezerId: deezer.deezerId,
      }, playableTracks.length));
    } catch (error) {
      deezerErrors += 1;
      console.error("Erreur Deezer :", error.deezer || error.message);
    }
  }

  return {
    playableTracks,
    stats: {
      source: "spotify",
      requestedCount,
      attempts,
      deezerErrors,
      spotifyTracksAvailable: allSpotifyTracks.length,
      playableFound: playableTracks.length,
    },
  };
}

function prepareDeezerPlayableTracks(deezerTracks, requestedCount) {
  const withPreview = deezerTracks.filter((track) => track.preview);
  const shuffled = shuffleArray(withPreview);
  const selected = shuffled.slice(0, requestedCount);

  return {
    playableTracks: selected.map(commonTrackToPlayableTrack),
    stats: {
      source: "deezer",
      requestedCount,
      deezerTracksAvailable: deezerTracks.length,
      playableFound: withPreview.length,
      selectedCount: selected.length,
      warning: withPreview.length < requestedCount
        ? "Seulement " + withPreview.length + " titres avec extrait audio ont ete trouves dans cette playlist."
        : null,
    },
  };
}

module.exports = {
  fetchDeezerJson,
  searchDeezerPreview,
  getDeezerPlaylistTracks,
  preparePlayableTracks,
  prepareDeezerPlayableTracks,
};
