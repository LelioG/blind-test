const path = require("path");
const dotenv = require("dotenv");

const ENV_PATH = path.join(__dirname, "..", ".env");

// En local, on charge .env s'il existe.
// Sur Render, il n'y a souvent pas de fichier .env : ce n'est pas une erreur.
dotenv.config({ path: ENV_PATH });

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "0.0.0.0";

const REQUEST_TIMEOUT_MS = 10000;
const DEEZER_TIMEOUT_MS = 8000;
const MAX_DEEZER_ATTEMPTS_MULTIPLIER = 4;

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_URL = "https://api.spotify.com/v1";
const DEEZER_SEARCH_URL = "https://api.deezer.com/search";

const spotifyConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI || "http://127.0.0.1:8080/callback",
};

const missingEnvVars = Object.entries({
  SPOTIFY_CLIENT_ID: spotifyConfig.clientId,
  SPOTIFY_CLIENT_SECRET: spotifyConfig.clientSecret,
})
  .filter(([, value]) => !value)
  .map(([name]) => name);

const spotifyEnabled = missingEnvVars.length === 0;

if (!spotifyEnabled) {
  console.warn(
    "Spotify désactivé : variables manquantes " + missingEnvVars.join(", ") +
    ". Les playlists Deezer restent disponibles."
  );
}

module.exports = {
  PORT,
  HOST,
  REQUEST_TIMEOUT_MS,
  DEEZER_TIMEOUT_MS,
  MAX_DEEZER_ATTEMPTS_MULTIPLIER,
  SPOTIFY_AUTH_URL,
  SPOTIFY_TOKEN_URL,
  SPOTIFY_API_URL,
  DEEZER_SEARCH_URL,
  spotifyConfig,
  spotifyEnabled,
};