function createEmptyGameState() {
  return {
    gameMode: "players",
    players: [],
    teams: [],
    playlistUrl: "",
    playlistSource: null,
    requestedTrackCount: 10,
    allSpotifyTracks: [],
    playableTracks: [],
    currentRoundIndex: 0,
    gameStarted: false,
    preparationError: null,
    preparationStats: null,
  };
}

const state = {
  accessToken: null,
  gameState: createEmptyGameState(),
};

function resetGameState(nextState = {}) {
  state.gameState = {
    ...createEmptyGameState(),
    ...nextState,
  };

  return state.gameState;
}

function currentQuestion() {
  return state.gameState.playableTracks[state.gameState.currentRoundIndex] || null;
}

module.exports = {
  state,
  createEmptyGameState,
  resetGameState,
  currentQuestion,
};
