import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Award,
  ChevronDown,
  CircleStop,
  Headphones,
  Loader2,
  LogIn,
  LogOut,
  Music2,
  Pause,
  Volume2,
  Play,
  Plus,
  RotateCcw,
  Search,
  SkipForward,
  Trophy,
  UserPlus,
  X,
} from "lucide-react";
import { PRESET_PLAYLISTS } from "./data/presetPlaylists";
import { ARTIST_PLAYLISTS } from "./data/artistPlaylists";
import "./styles.css";

const DEFAULT_PLAYERS = ["Joueur 1", "Joueur 2"];
const DEFAULT_TEAMS = [
  { id: "team-1", name: "Team 1", members: [{ id: "team-1-member-1", name: "Joueur 1" }] },
  { id: "team-2", name: "Team 2", members: [{ id: "team-2-member-1", name: "Joueur 2" }] },
];
const ROUND_SECONDS = 10;
const DEFAULT_VOLUME = 0.85;

function readStoredVolume() {
  const stored = Number(localStorage.getItem("blindTestVolume"));
  return Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : DEFAULT_VOLUME;
}

function createTeams(count, currentTeams = []) {
  return Array.from({ length: count }, (_, teamIndex) => {
    const existingTeam = currentTeams[teamIndex];
    const teamId = existingTeam?.id || `team-${teamIndex + 1}`;
    return {
      id: teamId,
      name: existingTeam?.name || `Team ${teamIndex + 1}`,
      members: existingTeam?.members?.length ? existingTeam.members : [{ id: `${teamId}-member-1`, name: `Joueur ${teamIndex + 1}` }],
    };
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "Une erreur est survenue.");
  }

  return data;
}

function cls(...values) {
  return values.filter(Boolean).join(" ");
}

function useGameSession() {
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setError("");
    const data = await api("/api/session");
    setGame(data.game);
    return data.game;
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  return { game, setGame, loading, error, setError, refresh };
}

function getRankedPlayers(players = []) {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let previousScore = null;
  let previousRank = 0;

  return sorted.map((player, index) => {
    const rank = player.score === previousScore ? previousRank : index + 1;
    previousScore = player.score;
    previousRank = rank;
    return { ...player, rank };
  });
}

function VolumeControl({ volume, onVolumeChange }) {
  const percent = Math.round(volume * 100);

  return (
    <label className="volumeControl">
      <Volume2 size={17} />
      <span className="volumeSlider" style={{ "--volume-percent": percent + "%" }}>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={percent}
          onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
          aria-label="Volume"
        />
      </span>
      <span className="volumeValue">{percent}%</span>
    </label>
  );
}

function Scoreboard({ entries = [], compact = false }) {
  const sorted = useMemo(() => getRankedPlayers(entries), [entries]);

  return (
    <aside className={cls("scoreboard", compact && "scoreboardCompact")}>
      <div className="panelTitle">
        <Trophy size={18} />
        <span>Scoreboard</span>
      </div>
      <div className="scoreList">
        {sorted.length === 0 ? (
          <p className="muted">Ajoute les participants pour lancer la partie.</p>
        ) : (
          sorted.map((player) => (
            <div className="scoreRow" key={player.id}>
              <div className="rank">{player.rank}</div>
              <div className="scoreName">{player.name}</div>
              <div className="scoreValue">{player.score} pt</div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function TournamentJoinCard({ onTournament, setError }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function join(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/tournaments/join", {
        method: "POST",
        body: JSON.stringify({ code: code.toUpperCase(), name }),
      });
      onTournament(data.tournament, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="joinCard" onSubmit={join}>
      <div>
        <span className="eyebrow">Rejoindre un tournoi</span>
        <strong>Entre le code de l'hôte</strong>
      </div>
      <input value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase())} placeholder="ABC123" aria-label="Code de partie" required />
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ton pseudo" maxLength={28} aria-label="Pseudo" required />
      <button className="primaryButton" type="submit" disabled={busy || code.length !== 6}>
        {busy ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />} Rejoindre
      </button>
    </form>
  );
}


function SetupScreen({ game, onGame, setError, onTournament }) {
  const [playlistUrl, setPlaylistUrl] = useState(game?.playlistUrl || "");
  const [selectedPresetPlaylistId, setSelectedPresetPlaylistId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("Toutes");
  const [presetTab, setPresetTab] = useState("themes");
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [requestedTrackCount, setRequestedTrackCount] = useState(String(game?.requestedTrackCount || 10));
  const [gameMode, setGameMode] = useState(game?.gameMode || "players");
  const [hostName, setHostName] = useState("Hôte");
  const [players, setPlayers] = useState(
    game?.players?.length ? game.players.map((player) => player.name) : DEFAULT_PLAYERS
  );
  const [teams, setTeams] = useState(() => createTeams(game?.teams?.length || DEFAULT_TEAMS.length, game?.teams?.length ? game.teams : DEFAULT_TEAMS));
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const activePresetPlaylists = presetTab === "artists" ? ARTIST_PLAYLISTS : PRESET_PLAYLISTS;
  const presetCategories = useMemo(() => ["Toutes", ...new Set(activePresetPlaylists.map((playlist) => playlist.category))], [presetTab]);
  const filteredPresetPlaylists = useMemo(() => {
    const normalizedSearch = playlistSearch.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return activePresetPlaylists.filter((playlist) => {
      const matchesCategory = selectedCategory === "Toutes" || playlist.category === selectedCategory;
      const haystack = [playlist.artist, playlist.name, playlist.category, playlist.description].filter(Boolean).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return matchesCategory && (!normalizedSearch || haystack.includes(normalizedSearch));
    });
  }, [activePresetPlaylists, playlistSearch, selectedCategory]);
  const selectedPresetPlaylist = [...PRESET_PLAYLISTS, ...ARTIST_PLAYLISTS].find((playlist) => playlist.id === selectedPresetPlaylistId) || null;

  function updatePlayer(index, value) {
    setPlayers((current) => current.map((name, i) => (i === index ? value : name)));
  }

  function addPlayer() {
    setPlayers((current) => (current.length >= 12 ? current : [...current, `Joueur ${current.length + 1}`]));
  }

  function removePlayer(index) {
    setPlayers((current) => current.filter((_, i) => i !== index));
  }


  function updateTeamCount(count) {
    setTeams((current) => createTeams(count, current));
  }

  function updateTeamName(teamIndex, value) {
    setTeams((current) => current.map((team, index) => index === teamIndex ? { ...team, name: value } : team));
  }

  function addTeamMember(teamIndex) {
    setTeams((current) => current.map((team, index) => {
      if (index !== teamIndex || team.members.length >= 12) return team;
      return {
        ...team,
        members: [...team.members, { id: `${team.id}-member-${team.members.length + 1}`, name: `Joueur ${team.members.length + 1}` }],
      };
    }));
  }

  function updateTeamMember(teamIndex, memberIndex, value) {
    setTeams((current) => current.map((team, index) => index === teamIndex ? {
      ...team,
      members: team.members.map((member, currentMemberIndex) => currentMemberIndex === memberIndex ? { ...member, name: value } : member),
    } : team));
  }

  function removeTeamMember(teamIndex, memberIndex) {
    setTeams((current) => current.map((team, index) => index === teamIndex ? {
      ...team,
      members: team.members.filter((_, currentMemberIndex) => currentMemberIndex !== memberIndex),
    } : team));
  }

  function selectPresetPlaylist(playlist) {
    if (playlist.available === false) return;
    setSelectedPresetPlaylistId(playlist.id);
    setPlaylistUrl(playlist.url);
  }

  function changePresetTab(tab) {
    setPresetTab(tab);
    setSelectedCategory("Toutes");
  }

  function updatePlaylistUrl(value) {
    setPlaylistUrl(value);
    setSelectedPresetPlaylistId(null);
  }

  async function submitSetup(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (gameMode === "tournament") {
        const tournamentData = await api("/api/tournaments", {
          method: "POST",
          body: JSON.stringify({ playlistUrl, requestedTrackCount, hostName }),
        });
        onTournament(tournamentData.tournament, tournamentData.token);
        return;
      }
      const data = await api("/api/setup", {
        method: "POST",
        body: JSON.stringify({
          playlistUrl,
          gameMode,
          requestedTrackCount,
          players: players.map((name, index) => ({ id: String(index + 1), name })),
          teams,
        }),
      });
      onGame(data.game);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function prepareGame() {
    setPreparing(true);
    setError("");

    try {
      const data = await api("/api/prepare-game", { method: "POST", body: "{}" });
      onGame(data.game);
    } catch (err) {
      setError(err.message);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <main className="setupGrid">
      <section className="heroPanel setupPanel">
        <div className="eyebrow"><Headphones size={16} /> Studio game session</div>
        <h1>Composer la session</h1>
        <p className="lead">Colle une playlist Spotify ou Deezer publique pour composer la session.</p>

        <TournamentJoinCard onTournament={onTournament} setError={setError} />

        {!game?.spotifyConnected && (
          <a className="spotifyButton" href="/login">
            <LogIn size={18} /> Connecter Spotify
          </a>
        )}

        <form className="setupForm" onSubmit={submitSetup}>
          <label>
            Lien de playlist Spotify ou Deezer
            <input
              value={playlistUrl}
              onChange={(event) => updatePlaylistUrl(event.target.value)}
              placeholder="https://open.spotify.com/playlist/... ou https://www.deezer.com/fr/playlist/..."
              disabled={busy || preparing}
            />
            <span className="fieldHelp">Les playlists Deezer publiques peuvent etre utilisees directement. Pour Spotify, seules les playlists accessibles avec votre compte fonctionnent.</span>
          </label>

          <section className={cls("presetSection", presetMenuOpen && "open")} aria-labelledby="preset-playlists-title">
            <button
              type="button"
              className="presetToggle"
              onClick={() => setPresetMenuOpen((open) => !open)}
              aria-expanded={presetMenuOpen}
              aria-controls="preset-playlists-panel"
            >
              <span>
                <span className="eyebrow">Playlists rapides</span>
                <strong id="preset-playlists-title">Choisir une playlist pré-enregistrée</strong>
                <small>{selectedPresetPlaylist ? `Sélectionnée : ${selectedPresetPlaylist.name}` : "Disney, Rap FR, années 2000, films et tubes"}</small>
              </span>
              <ChevronDown className="presetChevron" size={22} />
            </button>

            <div className="presetDropdown" id="preset-playlists-panel" aria-hidden={!presetMenuOpen}>
              <div className="presetTabs" role="tablist" aria-label="Type de playlists">
                <button type="button" role="tab" aria-selected={presetTab === "themes"} className={presetTab === "themes" ? "active" : ""} onClick={() => changePresetTab("themes")}>Thèmes</button>
                <button type="button" role="tab" aria-selected={presetTab === "artists"} className={presetTab === "artists" ? "active" : ""} onClick={() => changePresetTab("artists")}>Artistes <span>{ARTIST_PLAYLISTS.length}</span></button>
              </div>

              <label className="presetSearch">
                <Search size={18} />
                <input
                  type="search"
                  value={playlistSearch}
                  onChange={(event) => setPlaylistSearch(event.target.value)}
                  placeholder={presetTab === "artists" ? "Rechercher un artiste..." : "Rechercher une playlist..."}
                  aria-label="Rechercher parmi les playlists"
                />
              </label>

              <div className="categoryFilters" aria-label="Filtrer les playlists pré-enregistrées">
                {presetCategories.map((category) => (
                  <button
                    type="button"
                    key={category}
                    className={selectedCategory === category ? "active" : ""}
                    onClick={() => setSelectedCategory(category)}
                    disabled={busy || preparing}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="presetGrid">
                {filteredPresetPlaylists.map((playlist) => {
                  const isSelected = selectedPresetPlaylistId === playlist.id;

                  return (
                    <article className={cls("presetCard", isSelected && "selected")} key={playlist.id}>
                      <span className="presetCategory">{playlist.category}</span>
                      {playlist.artist && <span className="presetArtist">{playlist.artist}</span>}
                      <h3>{playlist.name}</h3>
                      <p>{playlist.description}</p>
                      <button
                        type="button"
                        className={isSelected ? "presetSelectedButton" : "presetUseButton"}
                        onClick={() => selectPresetPlaylist(playlist)}
                        disabled={busy || preparing || playlist.available === false}
                      >
                        {playlist.available === false ? "Playlist indisponible" : isSelected ? "Sélectionnée" : "Utiliser cette playlist"}
                      </button>
                    </article>
                  );
                })}
              </div>
              {filteredPresetPlaylists.length === 0 && (
                <div className="presetEmpty">Aucune playlist ne correspond à cette recherche.</div>
              )}
            </div>
          </section>

          <div className="segmented" aria-label="Nombre de manches">
            {[10, 20, 30].map((count) => (
              <button
                type="button"
                key={count}
                className={requestedTrackCount === String(count) ? "active" : ""}
                onClick={() => setRequestedTrackCount(String(count))}
                disabled={busy || preparing}
              >
                <span className="roundCount">{count}</span>
                <span className="roundLabel">manches</span>
              </button>
            ))}
          </div>

          <div className="segmented modeSegment" aria-label="Mode de jeu">
            <button
              type="button"
              className={gameMode === "players" ? "active" : ""}
              onClick={() => setGameMode("players")}
              disabled={busy || preparing}
            >
              <span className="roundCount">Solo</span>
              <span className="roundLabel">joueurs</span>
            </button>
            <button
              type="button"
              className={gameMode === "teams" ? "active" : ""}
              onClick={() => setGameMode("teams")}
              disabled={busy || preparing}
            >
              <span className="roundCount">Teams</span>
              <span className="roundLabel">equipes</span>
            </button>
            <button
              type="button"
              className={gameMode === "tournament" ? "active" : ""}
              onClick={() => setGameMode("tournament")}
              disabled={busy || preparing}
            >
              <span className="roundCount">Tournoi</span>
              <span className="roundLabel">avec un code</span>
            </button>
          </div>

          {gameMode === "players" ? (
            <>
              <div className="playersHeader">
                <div className="playersTitle">
                  <span>Joueurs</span>
                  <small>{players.length} / 12 participants</small>
                </div>
                <button type="button" className="iconText" onClick={addPlayer} disabled={players.length >= 12 || busy || preparing}>
                  <UserPlus size={17} /> Ajouter
                </button>
              </div>

              <div className="playerInputs">
                {players.map((player, index) => (
                  <div className="playerInput" key={index}>
                    <input
                      value={player}
                      onChange={(event) => updatePlayer(index, event.target.value)}
                      disabled={busy || preparing}
                      aria-label={`Nom joueur ${index + 1}`}
                    />
                    <button type="button" aria-label="Retirer joueur" onClick={() => removePlayer(index)} disabled={players.length <= 1 || busy || preparing}>
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : gameMode === "teams" ? (
            <>
              <div className="playersHeader">
                <div className="playersTitle">
                  <span>Teams</span>
                  <small>{teams.length} equipes</small>
                </div>
              </div>

              <div className="segmented teamCountSegment" aria-label="Nombre de teams">
                {[2, 3, 4].map((count) => (
                  <button
                    type="button"
                    key={count}
                    className={teams.length === count ? "active" : ""}
                    onClick={() => updateTeamCount(count)}
                    disabled={busy || preparing}
                  >
                    <span className="roundCount">{count}</span>
                    <span className="roundLabel">teams</span>
                  </button>
                ))}
              </div>

              <div className="teamSetupGrid">
                {teams.map((team, teamIndex) => (
                  <section className="teamSetupCard" key={team.id}>
                    <label>
                      Nom de team
                      <input
                        value={team.name}
                        onChange={(event) => updateTeamName(teamIndex, event.target.value)}
                        disabled={busy || preparing}
                        aria-label={`Nom team ${teamIndex + 1}`}
                      />
                    </label>
                    <div className="teamMembersHeader">
                      <span>{team.members.length} joueur{team.members.length > 1 ? "s" : ""}</span>
                      <button type="button" className="iconText" onClick={() => addTeamMember(teamIndex)} disabled={team.members.length >= 12 || busy || preparing}>
                        <UserPlus size={17} /> Ajouter
                      </button>
                    </div>
                    <div className="teamMemberInputs">
                      {team.members.map((member, memberIndex) => (
                        <div className="playerInput" key={member.id}>
                          <input
                            value={member.name}
                            onChange={(event) => updateTeamMember(teamIndex, memberIndex, event.target.value)}
                            disabled={busy || preparing}
                            aria-label={`Joueur ${memberIndex + 1} ${team.name}`}
                          />
                          <button type="button" aria-label="Retirer joueur" onClick={() => removeTeamMember(teamIndex, memberIndex)} disabled={team.members.length <= 1 || busy || preparing}>
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : (
            <div className="tournamentNote">
              <span className="eyebrow">Mode live</span>
              <strong>L'hôte joue aussi.</strong>
              <p>Choisis ton pseudo, puis partage le code à 6 caractères. Chaque bonne réponse rapporte entre 500 et 1 000 points selon la vitesse.</p>
              <label>
                Ton pseudo d'hôte
                <input value={hostName} onChange={(event) => setHostName(event.target.value)} maxLength={28} placeholder="Hôte" required />
              </label>
            </div>
          )}

          <button className="primaryButton" type="submit" disabled={busy || preparing}>
            {busy ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
            {gameMode === "tournament" ? "Créer le tournoi" : "Valider la direction"}
          </button>
        </form>

        {gameMode !== "tournament" && game?.stage === "ready" && (
          <button className="prepareButton" type="button" onClick={prepareGame} disabled={preparing}>
            {preparing ? <Loader2 className="spin" size={18} /> : <Music2 size={18} />}
            {preparing ? "Assemblage des previews..." : "Assembler les manches"}
          </button>
        )}
      </section>

      <Scoreboard entries={game?.scoreEntries || game?.players || []} />
    </main>
  );
}

function PlayerChoice({ title, points, players, selectedIds, onSelect, disabled }) {
  const selected = Array.isArray(selectedIds) ? selectedIds : [];

  function togglePlayer(playerId) {
    onSelect(selected.includes(playerId)
      ? selected.filter((id) => id !== playerId)
      : [...selected, playerId]);
  }

  return (
    <div className="choiceBlock">
      <div className="choiceTitle">
        <Award size={17} />
        <span>{title}</span>
        <strong>{points}</strong>
      </div>
      <div className="winnerGrid">
        <button className={selected.length === 0 ? "selected" : ""} onClick={() => onSelect([])} disabled={disabled}>Personne</button>
        {players.map((player) => (
          <button key={player.id} className={selected.includes(player.id) ? "selected" : ""} onClick={() => togglePlayer(player.id)} disabled={disabled}>
            {player.label || player.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function GameScreen({ game, onGame, setError, volume }) {
  const audioRef = useRef(null);
  const track = game.currentTrack;
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [revealed, setRevealed] = useState(Boolean(track?.alreadyPlayed));
  const [pointsValidated, setPointsValidated] = useState(Boolean(track?.alreadyPlayed));
  const [titleWinnerIds, setTitleWinnerIds] = useState([]);
  const [artistWinnerIds, setArtistWinnerIds] = useState([]);
  const [featWinnerIds, setFeatWinnerIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [audioHint, setAudioHint] = useState("");

  function revealTrack() {
    setRevealed(true);
    setSecondsLeft(0);
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  async function startAudio({ restart = false, userGesture = false } = {}) {
    if (userGesture) setError("");
    setAudioHint("");

    const audio = audioRef.current;
    if (!audio || !track?.preview) return;

    if (restart) {
      audio.currentTime = 0;
      setSecondsLeft(ROUND_SECONDS);
      setRevealed(false);
    }

    if (audio.readyState === 0) {
      audio.load();
    }

    try {
      await audio.play();
      setIsPlaying(true);
    } catch (err) {
      setIsPlaying(false);
      if (userGesture) {
        setError("Impossible de lancer cet extrait. Essaie la manche suivante ou recharge la page.");
      } else {
        setAudioHint("Clique sur Play pour lancer l'extrait.");
      }
    }
  }

  function pauseAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
  }

  function toggleAudio() {
    if (isPlaying) {
      pauseAudio();
      return;
    }

    startAudio({ userGesture: true });
  }

  useEffect(() => {
    setSecondsLeft(ROUND_SECONDS);
    setIsPlaying(false);
    setRevealed(Boolean(track?.alreadyPlayed));
    setPointsValidated(Boolean(track?.alreadyPlayed));
    setTitleWinnerIds([]);
    setArtistWinnerIds([]);
    setFeatWinnerIds((track?.featuredArtists || []).map(() => []));

    const audio = audioRef.current;
    if (!audio) return undefined;

    audio.pause();
    audio.currentTime = 0;
    audio.load();
    setAudioHint("");

    if (!track?.preview || track?.alreadyPlayed) return undefined;

    const autoplayTimer = window.setTimeout(() => {
      startAudio({ restart: true, userGesture: false });
    }, 180);

    return () => {
      window.clearTimeout(autoplayTimer);
      audio.pause();
    };
  }, [track?.id]);

  useEffect(() => {
    if (!isPlaying || revealed) return undefined;

    const timer = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          revealTrack();
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPlaying, revealed]);

  async function awardPoints() {
    setBusy(true);
    setError("");

    try {
      const data = await api("/api/award-points", {
        method: "POST",
        body: JSON.stringify({ titleWinnerIds, artistWinnerIds, featWinnerIds }),
      });
      setPointsValidated(true);
      setRevealed(true);
      onGame(data.game);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function nextRound() {
    setBusy(true);
    setError("");
    pauseAudio();

    try {
      const data = await api("/api/next-round", { method: "POST", body: "{}" });
      onGame(data.game);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const progress = ((ROUND_SECONDS - secondsLeft) / ROUND_SECONDS) * 100;
  const featuredArtists = track?.featuredArtists || [];
  const awardTargets = game.awardTargets || game.players;
  const showChoices = !track?.alreadyPlayed || pointsValidated;

  function updateFeatWinnerIds(index, winnerIds) {
    setFeatWinnerIds((current) => {
      const next = featuredArtists.map((_, featIndex) => current[featIndex] || []);
      next[index] = winnerIds;
      return next;
    });
  }

  return (
    <main className="gameGrid">
      <section className="roundPanel">
        <div className="roundHeader">
          <div>
            <span className="eyebrow"><Music2 size={16} /> Manche {game.currentRoundNumber} / {game.totalRounds}</span>
            <h1>{revealed ? "Reveal" : "Ecoute. Devine. Score."}</h1>
          </div>
          <div className="timerBadge">{secondsLeft}s</div>
        </div>

        <div className="turntable">
          <div className={cls("disc", isPlaying && "discPlaying", revealed && "discReveal")}>
            {revealed && track?.albumCover ? (
              <img src={track.albumCover} alt="Cover album" />
            ) : (
              <img className="vinylArt" src="/assets/vinyl-record.png" alt="Vinyle en lecture" />
            )}
          </div>
          <div className="progressTrack"><span style={{ width: `${progress}%` }} /></div>
        </div>

        <audio
          ref={audioRef}
          src={track?.preview || ""}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            revealTrack();
          }}
          preload="auto"
        />

        {audioHint && !revealed && <p className="audioHint">{audioHint}</p>}

        {!revealed ? (
          <div className="roundActions">
            <button className="primaryButton" onClick={toggleAudio} disabled={!track?.preview}>
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button className="secondaryButton" onClick={revealTrack} disabled={!track}>
              <SkipForward size={18} /> Skip
            </button>
          </div>
        ) : (
          <div className="revealPanel">
            <div className="answerBlock">
              <span>Titre</span>
              <strong>{track?.title || track?.spotifyTitle}</strong>
            </div>
            <div className="answerBlock">
              <span>Artiste</span>
              <strong>{track?.artist || track?.spotifyArtist}</strong>
            </div>
            {featuredArtists.length > 0 && (
              <div className="answerBlock">
                <span>Feat</span>
                <strong>{featuredArtists.join(", ")}</strong>
              </div>
            )}

            {showChoices && (
              <>
                <PlayerChoice title="Qui a trouve le titre ?" points="+2 pts" players={awardTargets} selectedIds={titleWinnerIds} onSelect={setTitleWinnerIds} disabled={busy || pointsValidated} />
                <PlayerChoice title="Qui a trouve l'artiste ?" points="+1 pt" players={awardTargets} selectedIds={artistWinnerIds} onSelect={setArtistWinnerIds} disabled={busy || pointsValidated} />
                {featuredArtists.map((artist, index) => (
                  <PlayerChoice
                    key={`${artist}-${index}`}
                    title={`Qui a trouve le feat : ${artist} ?`}
                    points="+1 pt"
                    players={awardTargets}
                    selectedIds={featWinnerIds[index] || []}
                    onSelect={(winnerIds) => updateFeatWinnerIds(index, winnerIds)}
                    disabled={busy || pointsValidated}
                  />
                ))}
              </>
            )}

            {!pointsValidated && !track?.alreadyPlayed ? (
              <button className="primaryButton" onClick={awardPoints} disabled={busy}>
                {busy ? <Loader2 className="spin" size={18} /> : <CircleStop size={18} />}
                Valider les points
              </button>
            ) : (
              <button className="prepareButton" onClick={nextRound} disabled={busy}>
                {busy ? <Loader2 className="spin" size={18} /> : <SkipForward size={18} />}
                {game.currentRoundIndex + 1 >= game.totalRounds ? "Voir les resultats" : "Manche suivante"}
              </button>
            )}
          </div>
        )}
      </section>

      <Scoreboard entries={game.scoreEntries || game.players} />
    </main>
  );
}

function TournamentScreen({ tournament, token, onTournament, onLeave, setError, volume }) {
  const audioRef = useRef(null);
  if (!audioRef.current && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
    audioRef.current.preload = "auto";
    audioRef.current.playsInline = true;
  }
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioActivated, setAudioActivated] = useState(false);
  const question = tournament.question;
  const isHost = tournament.role === "host";
  const answer = tournament.player?.answer;
  const remainingMs = tournament.phaseEndsAt ? Math.max(0, tournament.phaseEndsAt - (now + (tournament.serverNow - Date.now()))) : 0;
  const secondsLeft = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const onCanPlay = () => setAudioReady(true);
    const onPlay = () => { setIsAudioPlaying(true); setAudioBlocked(false); };
    const onPause = () => setIsAudioPlaying(false);
    const onError = () => setError("Cet extrait audio ne peut pas être chargé sur cet appareil.");
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
      audio.removeEventListener("error", onError);
      audio.pause();
    };
  }, []);

  useEffect(() => {
    if (tournament.status !== "question" || !question?.preview) return undefined;
    const audio = audioRef.current;
    if (!audio) return undefined;
    setAudioReady(false);
    setAudioBlocked(false);
    setIsAudioPlaying(false);
    audio.pause();
    audio.src = question.preview;
    audio.currentTime = 0;
    audio.load();

    const delay = Math.max(0, tournament.phaseStartedAt - tournament.serverNow);
    const timer = window.setTimeout(() => {
      if (!audioActivated) {
        setAudioBlocked(true);
        return;
      }
      audio.play().catch(() => {
        setAudioBlocked(true);
        setAudioActivated(false);
        setIsAudioPlaying(false);
      });
    }, delay);
    return () => {
      window.clearTimeout(timer);
      audio.pause();
    };
  }, [audioActivated, tournament.currentRoundIndex, tournament.status, question?.preview]);

  async function activateTournamentAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    setError("");
    setAudioBlocked(false);
    const silentWav = "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
    try {
      audio.pause();
      audio.src = silentWav;
      audio.currentTime = 0;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      setAudioActivated(true);
    } catch (err) {
      setAudioActivated(false);
      setAudioBlocked(true);
      setError("Impossible d'activer le son. Vérifie que le téléphone n'est pas en mode silencieux puis réessaie.");
    }
  }

  async function playTournamentAudio() {
    const audio = audioRef.current;
    if (!audio || !question?.preview || !audio.paused) return;
    setError("");
    setAudioBlocked(false);
    try {
      if (audio.ended) audio.currentTime = 0;
      await audio.play();
    } catch (err) {
      setAudioBlocked(true);
      setError("Le navigateur bloque le son. Vérifie le volume puis appuie de nouveau sur Lancer le son.");
    }
  }

  async function start() {
    setBusy(true);
    setError("");
    try {
      const data = await api(`/api/tournaments/${tournament.code}/start`, {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      onTournament(data.tournament, token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function answerQuestion(choiceId) {
    if (busy || answer || tournament.status !== "question") return;
    setBusy(true);
    setError("");
    try {
      const data = await api(`/api/tournaments/${tournament.code}/answer`, {
        method: "POST",
        body: JSON.stringify({ token, choiceId }),
      });
      onTournament(data.tournament, token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function nextRound() {
    setBusy(true);
    setError("");
    try {
      const data = await api(`/api/tournaments/${tournament.code}/next`, {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      onTournament(data.tournament, token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (tournament.status === "lobby") {
    return (
      <main className="tournamentLobby">
        <section className="heroPanel lobbyPanel">
          <span className="eyebrow"><Trophy size={16} /> Tournoi live</span>
          <p className="lobbyLabel">Code de la partie</p>
          <h1 className="roomCode">{tournament.code}</h1>
          <p className="lead">{isHost ? "Partage ce code. Chaque appareil doit activer le son avant le lancement." : "Tu es connecté. Active le son sur ce téléphone avant que l'hôte lance la partie."}</p>

          <div className={cls("soundActivationCard", audioActivated && "activated")}>
            <div className="soundActivationIcon">{audioActivated ? <Music2 size={28} /> : <Headphones size={28} />}</div>
            <div>
              <strong>{audioActivated ? "Son activé" : "Active le son sur cet appareil"}</strong>
              <span>{audioActivated ? "Les extraits pourront démarrer automatiquement." : "Un seul clic est nécessaire avant le début du tournoi."}</span>
            </div>
            <button type="button" onClick={activateTournamentAudio} disabled={audioActivated}>
              {audioActivated ? "Prêt" : "Activer le son"}
            </button>
          </div>

          {isHost && (
            <button className="primaryButton" onClick={start} disabled={busy || !audioActivated}>
              {busy ? <Loader2 className="spin" size={18} /> : <Play size={18} />} Lancer le tournoi
            </button>
          )}
          {!isHost && <div className="waitingPulse">{audioActivated ? <Loader2 className="spin" size={20} /> : <Headphones size={20} />} {audioActivated ? "En attente de l'hôte" : "Active le son pour être prêt"}</div>}
        </section>
        <Scoreboard entries={tournament.players} />
      </main>
    );
  }

  if (tournament.status === "results") {
    const winner = tournament.players[0];
    return (
      <main className="resultsGrid">
        <section className="heroPanel resultsPanel">
          <span className="eyebrow"><Trophy size={16} /> Classement final</span>
          <h1>{winner ? `${winner.name} gagne` : "Tournoi terminé"}</h1>
          <div className="podiumList">
            {tournament.players.map((player) => (
              <div className={cls("podiumRow", player.rank === 1 && "winner")} key={player.id}>
                <div className="rank">{player.rank}</div><strong>{player.name}</strong><span>{player.score} pt</span>
              </div>
            ))}
          </div>
          <button className="secondaryButton" onClick={onLeave}><LogOut size={18} /> Quitter</button>
        </section>
        <Scoreboard entries={tournament.players} compact />
      </main>
    );
  }

  const revealing = tournament.status === "reveal";

  if (revealing) {
    const topThree = tournament.players.slice(0, 3);
    return (
      <main className="intermissionShell">
        <section className="intermissionPanel">
          <div className="intermissionGlow" />
          <span className="eyebrow"><Award size={16} /> Résultats de la manche {tournament.currentRoundNumber}</span>

          <div className="intermissionAnswer">
            <div className="intermissionCover">
              {question?.albumCover ? <img src={question.albumCover} alt="Pochette de l'album" /> : <img src="/assets/vinyl-record.png" alt="Vinyle" />}
            </div>
            <div>
              <span>La bonne réponse était</span>
              <h1>{question?.correctTitle}</h1>
              <p>{question?.artist}</p>
            </div>
          </div>

          <div className={cls("personalRoundResult", answer?.correct ? "success" : "failure")}>
            <div className="personalResultIcon">{answer?.correct ? <Trophy size={26} /> : <X size={26} />}</div>
            <div>
              <span>{answer?.correct ? "Bonne réponse" : answer ? "Mauvaise réponse" : "Pas de réponse"}</span>
              <strong>{answer?.correct ? `+${answer.points} points` : "+0 point"}</strong>
            </div>
            <div className="personalTotal">Total <strong>{tournament.player?.score || 0}</strong></div>
          </div>

          <div className="roundRanking">
            <div className="roundRankingHeader">
              <div>
                <span className="eyebrow">Classement en direct</span>
                <h2>Après cette manche</h2>
              </div>
              <span>{tournament.players.length} joueur{tournament.players.length > 1 ? "s" : ""}</span>
            </div>
            <div className="roundPodium">
              {topThree.map((player, index) => (
                <div className={cls("roundPodiumCard", index === 0 && "leader")} key={player.id}>
                  <div className="roundPodiumRank">{player.rank}</div>
                  <strong>{player.name}</strong>
                  <span>{player.score} pt</span>
                  <small>{player.roundCorrect ? `+${player.roundPoints} cette manche` : "+0 cette manche"}</small>
                </div>
              ))}
            </div>
            {tournament.players.length > 3 && (
              <div className="roundRankingRest">
                {tournament.players.slice(3).map((player) => (
                  <div key={player.id} className={player.id === tournament.player?.id ? "current" : ""}>
                    <span>{player.rank}</span><strong>{player.name}</strong><small>+{player.roundPoints}</small><b>{player.score} pt</b>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isHost ? (
            <button className="intermissionNext" onClick={nextRound} disabled={busy}>
              {busy ? <Loader2 className="spin" size={20} /> : <SkipForward size={20} />}
              {tournament.currentRoundIndex + 1 >= tournament.totalRounds ? "Voir les résultats" : "Lancer la manche suivante"}
            </button>
          ) : (
            <div className="waitingNext"><Loader2 className="spin" size={20} /> L'hôte prépare la suite</div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="gameGrid tournamentGame">
      <section className="roundPanel">
        <div className="roundHeader">
          <div>
            <span className="eyebrow"><Music2 size={16} /> Manche {tournament.currentRoundNumber} / {tournament.totalRounds}</span>
            <h1>{answer ? "Réponse envoyée" : "Écoute. Choisis."}</h1>
          </div>
          <div className="timerBadge">{secondsLeft}s</div>
        </div>

        <div className="tournamentPlayLayout">
          <div className="tournamentAudioStage">
            <button className={cls("disc", isAudioPlaying && "discPlaying")} onClick={playTournamentAudio} aria-label={isAudioPlaying ? "Son en cours" : "Lancer le son"}>
              <img className="vinylArt" src="/assets/vinyl-record.png" alt="Vinyle en lecture" />
            </button>
            <button className="tournamentAudioButton" type="button" onClick={playTournamentAudio} disabled={!question?.preview || isAudioPlaying}>
              {isAudioPlaying ? <Music2 size={19} /> : <Play size={19} />}
              {isAudioPlaying ? "Son en cours" : audioReady ? "Lancer le son" : "Charger le son"}
            </button>
            <p className={cls("hostHint", audioBlocked && "audioBlocked")}>{audioBlocked ? "Lecture automatique bloquée : appuie sur le bouton pour entendre le son." : "Le même extrait est disponible sur chaque appareil."}</p>
          </div>

          <div className="answerGrid">
            {(question?.choices || []).map((choice, index) => {
              const selected = answer?.choiceId === choice.id;
              return (
                <button
                  key={choice.id}
                  className={cls("answerChoice", `answerChoice${index + 1}`, selected && "selected")}
                  onClick={() => answerQuestion(choice.id)}
                  disabled={busy || Boolean(answer)}
                >
                  <span>{index + 1}</span><strong>{choice.title}</strong>
                </button>
              );
            })}
          </div>
        </div>

        {answer && <div className="answerLocked">Réponse enregistrée — attends la fin du chrono</div>}
      </section>
      <Scoreboard entries={tournament.players} />
    </main>
  );

}


function ResultsScreen({ game, onGame, setError }) {
  const [busy, setBusy] = useState(false);
  const [openTeamId, setOpenTeamId] = useState(null);
  const ranking = game.ranking || [];
  const topScore = ranking[0]?.score;
  const winners = ranking.filter((player) => player.score === topScore);
  const winner = winners[0];

  async function reset(mode) {
    setBusy(true);
    setError("");

    try {
      const data = await api("/api/reset", { method: "POST", body: JSON.stringify({ mode }) });
      onGame(data.game);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="resultsGrid">
      <section className="heroPanel resultsPanel">
        <span className="eyebrow"><Trophy size={16} /> Classement final</span>
        <h1>{winners.length > 1 ? "Egalite" : winner ? `${winner.name} gagne` : "Session terminee"}</h1>
        <p className="lead">{winners.length > 1 ? `${winners.map((player) => player.name).join(" et ")} terminent a egalite.` : `Une derniere vue du classement, apres ${game.totalRounds} manches.`}</p>

        <div className="podiumList">
          {ranking.map((player) => (
            <div className="podiumItem" key={player.id}>
              <button
                type="button"
                className={cls("podiumRow", player.score === topScore && "winner", game.gameMode === "teams" && "clickable")}
                onClick={() => game.gameMode === "teams" && setOpenTeamId((current) => current === player.id ? null : player.id)}
              >
                <div className="rank">{player.rank || 1}</div>
                <strong>{player.name}</strong>
                <span>{player.score} pt</span>
              </button>
              {game.gameMode === "teams" && openTeamId === player.id && (
                <div className="teamDetailList">
                  {(player.members || []).map((member) => (
                    <div className="teamDetailRow" key={member.id}>
                      <span>{member.name}</span>
                      <strong>{member.score} pt</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="roundActions">
          <button className="primaryButton" onClick={() => reset("same")} disabled={busy}>
            <RotateCcw size={18} /> Rejouer
          </button>
          <button className="secondaryButton" onClick={() => reset("new")} disabled={busy}>
            <Plus size={18} /> Nouvelle partie
          </button>
        </div>
      </section>
      <Scoreboard entries={game.scoreEntries || game.players} compact />
    </main>
  );
}

function App() {
  const { game, setGame, loading, error, setError } = useGameSession();
  const [tournament, setTournament] = useState(null);
  const [tournamentToken, setTournamentToken] = useState(() => localStorage.getItem("tournamentToken") || "");
  const [tournamentCode, setTournamentCode] = useState(() => localStorage.getItem("tournamentCode") || "");
  const [quitting, setQuitting] = useState(false);
  const [volume, setVolume] = useState(readStoredVolume);
  const canQuitGame = Boolean(tournament || (game && (game.stage === "ready" || game.stage === "playing" || game.stage === "results")));

  function updateVolume(nextVolume) {
    const safeVolume = Math.min(1, Math.max(0, nextVolume));
    setVolume(safeVolume);
    localStorage.setItem("blindTestVolume", String(safeVolume));
  }

  function openTournament(nextTournament, token) {
    setTournament(nextTournament);
    setTournamentToken(token);
    setTournamentCode(nextTournament.code);
    localStorage.setItem("tournamentToken", token);
    localStorage.setItem("tournamentCode", nextTournament.code);
  }

  function leaveTournament() {
    setTournament(null);
    setTournamentToken("");
    setTournamentCode("");
    localStorage.removeItem("tournamentToken");
    localStorage.removeItem("tournamentCode");
  }

  useEffect(() => {
    if (!tournamentCode || !tournamentToken) return undefined;
    let active = true;
    async function refreshTournament() {
      try {
        const data = await api("/api/tournaments/" + tournamentCode + "?token=" + tournamentToken);
        if (active) setTournament(data.tournament);
      } catch (err) {
        if (active && (err.message.includes("expirée") || err.message.includes("refusé"))) leaveTournament();
      }
    }
    refreshTournament();
    const timer = window.setInterval(refreshTournament, 700);
    return () => { active = false; window.clearInterval(timer); };
  }, [tournamentCode, tournamentToken]);

  async function quitGame() {
    if (tournament) {
      leaveTournament();
      return;
    }
    setQuitting(true);
    setError("");

    try {
      const data = await api("/api/reset", { method: "POST", body: JSON.stringify({ mode: "new" }) });
      setGame(data.game);
    } catch (err) {
      setError(err.message);
    } finally {
      setQuitting(false);
    }
  }

  if (loading) {
    return (
      <div className="appShell centerShell">
        <Loader2 className="spin" size={34} />
        <p>Chargement de la session...</p>
      </div>
    );
  }

  return (
    <div className="appShell">
      <div className="topBar">
        <div className="brand"><Headphones size={21} /> Blind Test</div>
        <div className="topActions">
          <VolumeControl volume={volume} onVolumeChange={updateVolume} />
          {canQuitGame && (
            <button className="quitButton" type="button" onClick={quitGame} disabled={quitting}>
              {quitting ? <Loader2 className="spin" size={16} /> : <LogOut size={16} />}
              Quitter la partie
            </button>
          )}
          <div className={cls("statusPill", (tournament || game?.spotifyConnected) && "connected")}>{tournament ? "Tournoi " + tournament.code : game?.spotifyConnected ? "Spotify connecte" : "Spotify requis"}</div>
        </div>
      </div>

      {error && <div className="errorBanner">{error}</div>}
      {!tournament && game?.preparationStats?.warning && <div className="warningBanner">{game.preparationStats.warning}</div>}

      {tournament && <TournamentScreen tournament={tournament} token={tournamentToken} onTournament={openTournament} onLeave={leaveTournament} setError={setError} volume={volume} />}
      {!tournament && game?.stage === "playing" && <GameScreen game={game} onGame={setGame} setError={setError} volume={volume} />}
      {!tournament && game?.stage === "results" && <ResultsScreen game={game} onGame={setGame} setError={setError} />}
      {!tournament && (!game || game.stage === "setup" || game.stage === "ready") && <SetupScreen game={game} onGame={setGame} setError={setError} onTournament={openTournament} />}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
