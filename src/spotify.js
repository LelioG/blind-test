const { SPOTIFY_AUTH_URL, SPOTIFY_TOKEN_URL, SPOTIFY_API_URL, spotifyConfig } = require("./config");
const { fetchWithTimeout, readJsonResponse } = require("./http");
const { state } = require("./state");

async function fetchSpotifyJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const data = await readJsonResponse(response);

  if (!response.ok || data.error) {
    const error = new Error("Erreur API Spotify");
    error.spotify = data;
    throw error;
  }

  return data;
}

function spotifyAuthUrl() {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: spotifyConfig.clientId,
    scope: "playlist-read-private playlist-read-collaborative",
    redirect_uri: spotifyConfig.redirectUri,
  });

  return SPOTIFY_AUTH_URL + "?" + params.toString();
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: spotifyConfig.redirectUri,
  });
  const authHeader = Buffer.from(spotifyConfig.clientId + ":" + spotifyConfig.clientSecret).toString("base64");
  const data = await fetchSpotifyJson(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!data.access_token) {
    throw new Error("Spotify n'a pas renvoye de token.");
  }

  return data.access_token;
}

function spotifyItemToTrack(item) {
  const track = item && (item.track || item.item);
  if (!track || !track.name) return null;

  const spotifyArtist = (track.artists || [])
    .map((artist) => artist.name)
    .filter(Boolean)
    .join(", ");

  return {
    spotifyTitle: track.name,
    spotifyArtist: spotifyArtist || "Artiste inconnu",
    spotifyFullName: track.name + " - " + (spotifyArtist || "Artiste inconnu"),
  };
}

async function getSpotifyPlaylistTracks(playlistId) {
  const tracks = [];
  let nextUrl = new URL(SPOTIFY_API_URL + "/playlists/" + encodeURIComponent(playlistId) + "/items");
  nextUrl.searchParams.set("limit", "100");
  nextUrl.searchParams.set("additional_types", "track,episode");
  nextUrl.searchParams.set("market", "from_token");

  while (nextUrl) {
    console.log("Spotify playlist request: " + nextUrl.toString());
    const data = await fetchSpotifyJson(nextUrl.toString(), {
      headers: { Authorization: "Bearer " + state.accessToken },
    });

    for (const item of data.items || []) {
      const track = spotifyItemToTrack(item);
      if (track) tracks.push(track);
    }

    nextUrl = data.next ? new URL(data.next) : null;
  }

  return tracks;
}

module.exports = {
  spotifyAuthUrl,
  exchangeCodeForToken,
  getSpotifyPlaylistTracks,
};
