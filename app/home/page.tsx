"use client";

import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import YouTube, { type YouTubeProps } from "react-youtube";
import { useRouter } from "next/navigation";
import VinylLogo from "../components/VinylLogo";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Song = {
  id: {
    videoId: string;
  };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: {
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
    };
  };
};

type Playlist = {
  id: string;
  name: string;
  songs: Song[];
  cover?: string;
};

type PartyMessage = {
  senderId: string;
  song?: Song | null;
  isPlaying?: boolean;
  currentTime?: number;
  playlists?: Playlist[];
};

type PlayerApi = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
};

type Panel =
  | "home"
  | "search"
  | "history"
  | "playlists"
  | "artists"
  | "liked"
  | "forYou";

type AccentTheme = "rose" | "sunset";

const DEFAULT_QUERY = "Sai Abhyankkar official music";
const SEEK_START_ANGLE = -27;
const SEEK_SWEEP_ANGLE = 234;

function decodeText(text: string) {
  if (typeof document === "undefined") return text;

  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;

  return textarea.value;
}

function getTasteArtist(song: Song) {
  const title = decodeText(song.snippet.title);
  const dashArtist = title.split(/\s+-\s+/)[0]?.trim();
  const quotedArtist = title.match(/^(.+?)\s+['‘’“”]/)?.[1]?.trim();

  if (dashArtist && dashArtist !== title) return dashArtist;
  if (quotedArtist) return quotedArtist;

  return decodeText(song.snippet.channelTitle).replace(
    /\s+-\s+Topic$/i,
    ""
  );
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);

  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function getThumbnail(song: Song | null) {
  return (
    song?.snippet.thumbnails.high?.url ??
    song?.snippet.thumbnails.medium?.url ??
    song?.snippet.thumbnails.default?.url ??
    "/covers/vizhi.png"
  );
}

function uniqueSongs(items: Song[]) {
  return Array.from(
    new Map(items.map((song) => [song.id.videoId, song])).values()
  );
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createVinylId() {
  return `VINYL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function createPartyCode() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
}

function makeUniqueUsername(name: string, id: string) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "listener";
  return `${base}-${id.slice(-4).toLowerCase()}`;
}

export default function HomePage() {
  const router = useRouter();
  const backendReady = isSupabaseConfigured();
  const [authChecked, setAuthChecked] = useState(false);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [heading, setHeading] = useState("SAI ABHYANKKAR");

  const [songs, setSongs] = useState<Song[]>([]);
  const [recommendations, setRecommendations] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);

  const [history, setHistory] = useState<Song[]>([]);
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [followedArtists, setFollowedArtists] = useState<string[]>([]);
  const [preferredArtists, setPreferredArtists] = useState<string[]>([]);

  const [panel, setPanel] = useState<Panel>("home");

  const [selectedPlaylistId, setSelectedPlaylistId] =
    useState<string | null>(null);

  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [songToAdd, setSongToAdd] = useState<Song | null>(null);
  const [songForNewPlaylist, setSongForNewPlaylist] = useState<Song | null>(null);
  const [playlistToEdit, setPlaylistToEdit] = useState<Playlist | null>(null);
  const [editPlaylistName, setEditPlaylistName] = useState("");
  const [editPlaylistCover, setEditPlaylistCover] = useState("");

  const [nextPageToken, setNextPageToken] =
    useState<string | null>(null);

  const [currentQuery, setCurrentQuery] = useState(DEFAULT_QUERY);

  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [relatedSongs, setRelatedSongs] = useState<Song[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [loadingRecommendations, setLoadingRecommendations] =
    useState(false);

  const [error, setError] = useState("");

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [profileView, setProfileView] = useState<"menu" | "settings">("menu");

  const [storageLoaded, setStorageLoaded] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [accentTheme, setAccentTheme] = useState<AccentTheme>("rose");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [hiddenHomeSongIds, setHiddenHomeSongIds] = useState<string[]>([]);
  const [notInterestedArtists, setNotInterestedArtists] = useState<string[]>([]);
  const [homeMenuSongId, setHomeMenuSongId] = useState<string | null>(null);
  const [profileName, setProfileName] =
    useState("Vinyl Listener");
  const [profileEmail, setProfileEmail] =
    useState("listener@vinyl.app");
  const [vinylId, setVinylId] = useState("");
  const [uniqueUsername, setUniqueUsername] = useState("");
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyCode, setPartyCode] = useState("");
  const [joinPartyCode, setJoinPartyCode] = useState("");
  const [partyStatus, setPartyStatus] = useState("");
  const [profileSaveStatus, setProfileSaveStatus] = useState("");

  const playerRef = useRef<PlayerApi | null>(null);
  const vinylRingRef = useRef<HTMLDivElement | null>(null);
  const draggingProgress = useRef(false);
  const partyChannelRef = useRef<BroadcastChannel | null>(null);
  const applyingPartyUpdate = useRef(false);

  useEffect(() => {
    if (backendReady) {
      let cancelled = false;
      const supabase = createSupabaseClient();

      void (async () => {
        const { data, error: userError } = await supabase.auth.getUser();
        if (cancelled) return;

        if (userError || !data.user) {
          router.replace("/");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("username, display_name, avatar_url, accent_theme, dark_mode")
          .eq("id", data.user.id)
          .single();
        if (cancelled) return;

        const nextVinylId = `VINYL-${data.user.id.slice(0, 8).toUpperCase()}`;
        setVinylId(nextVinylId);
        setProfileEmail(data.user.email ?? "");
        localStorage.setItem("vinyl-user-id", data.user.id);
        localStorage.setItem("vinyl-profile-email", data.user.email ?? "");

        if (profile) {
          setProfileName(profile.display_name);
          setUniqueUsername(profile.username);
          setProfileAvatar(profile.avatar_url ?? "");
          setAccentTheme(profile.accent_theme === "sunset" ? "sunset" : "rose");
          setDarkMode(profile.dark_mode);
          localStorage.setItem("vinyl-profile-name", profile.display_name);
          localStorage.setItem("vinyl-username", profile.username);
          if (profile.avatar_url) {
            localStorage.setItem("vinyl-profile-avatar", profile.avatar_url);
          }
        }

        setAuthChecked(true);
      })();

      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      const session =
        localStorage.getItem("vinyl-session") ||
        sessionStorage.getItem("vinyl-session");

      if (!session) {
        router.replace("/");
        return;
      }

      setAuthChecked(true);
    });
  }, [backendReady, router]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      try {
      const storedHistory =
        localStorage.getItem("vinyl-history");

      const storedLikes =
        localStorage.getItem("vinyl-liked");

      const storedPlaylists =
        localStorage.getItem("vinyl-playlists");
      const storedArtists =
        localStorage.getItem("vinyl-artists");
      const storedPreferredArtists =
        localStorage.getItem("vinyl-preferred-artists");

      const storedProfileName =
        localStorage.getItem("vinyl-profile-name");

      const storedProfileEmail =
        localStorage.getItem("vinyl-profile-email");
      const storedProfileAvatar =
        localStorage.getItem("vinyl-profile-avatar");
      const storedDarkMode =
        localStorage.getItem("vinyl-dark-mode");
      const storedHiddenHomeSongs =
        localStorage.getItem("vinyl-hidden-home-songs");
      const storedNotInterestedArtists =
        localStorage.getItem("vinyl-not-interested-signals");
      const storedQueue = localStorage.getItem("vinyl-queue");
      const storedAutoplay = localStorage.getItem("vinyl-autoplay");
      const storedAccentTheme = localStorage.getItem("vinyl-accent-theme");
      const storedVinylId = localStorage.getItem("vinyl-user-id");
      const storedUniqueUsername = localStorage.getItem("vinyl-username");

      if (storedHistory) {
        const savedHistory = JSON.parse(storedHistory) as Song[];
        setHistory(savedHistory);
        setCurrentSong((previous) =>
          previous ?? savedHistory[0] ?? null
        );
      }

      if (storedLikes) {
        setLikedSongs(JSON.parse(storedLikes));
      }

      if (storedPlaylists) {
        setPlaylists(JSON.parse(storedPlaylists));
      }

      if (storedArtists) {
        setFollowedArtists(JSON.parse(storedArtists));
      }

      if (storedPreferredArtists) {
        setPreferredArtists(JSON.parse(storedPreferredArtists));
      }

      if (storedProfileName) {
        setProfileName(storedProfileName);
      }

      if (storedProfileEmail) {
        setProfileEmail(storedProfileEmail);
      }

      if (storedProfileAvatar) {
        setProfileAvatar(storedProfileAvatar);
      }

      if (storedDarkMode) {
        setDarkMode(storedDarkMode === "true");
      }

      if (storedHiddenHomeSongs) {
        setHiddenHomeSongIds(JSON.parse(storedHiddenHomeSongs));
      }

      if (storedNotInterestedArtists) {
        setNotInterestedArtists(
          JSON.parse(storedNotInterestedArtists)
        );
      }

      if (storedQueue) {
        setQueue(JSON.parse(storedQueue));
      }

      if (storedAutoplay) {
        setAutoplayEnabled(storedAutoplay === "true");
      }

      if (
        storedAccentTheme === "rose" ||
        storedAccentTheme === "sunset"
      ) {
        setAccentTheme(storedAccentTheme);
      }

      const nextVinylId = storedVinylId || createVinylId();
      localStorage.setItem("vinyl-user-id", nextVinylId);
      setVinylId(nextVinylId);
      const nextUsername = storedUniqueUsername || makeUniqueUsername(storedProfileName || "listener", nextVinylId);
      localStorage.setItem("vinyl-username", nextUsername);
      setUniqueUsername(nextUsername);
      } catch {
        console.error("Could not load saved music data.");
      } finally {
        setStorageLoaded(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;

    localStorage.setItem(
      "vinyl-history",
      JSON.stringify(history)
    );
  }, [history, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;

    localStorage.setItem(
      "vinyl-liked",
      JSON.stringify(likedSongs)
    );
  }, [likedSongs, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;

    localStorage.setItem(
      "vinyl-playlists",
      JSON.stringify(playlists)
    );
  }, [playlists, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;

    localStorage.setItem(
      "vinyl-artists",
      JSON.stringify(followedArtists)
    );
  }, [followedArtists, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;

    localStorage.setItem(
      "vinyl-preferred-artists",
      JSON.stringify(preferredArtists)
    );
  }, [preferredArtists, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;

    localStorage.setItem(
      "vinyl-dark-mode",
      String(darkMode)
    );
  }, [darkMode, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;

    localStorage.setItem(
      "vinyl-hidden-home-songs",
      JSON.stringify(hiddenHomeSongIds)
    );
  }, [hiddenHomeSongIds, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;

    localStorage.setItem(
      "vinyl-not-interested-signals",
      JSON.stringify(notInterestedArtists)
    );
  }, [notInterestedArtists, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;

    localStorage.setItem("vinyl-queue", JSON.stringify(queue));
    localStorage.setItem("vinyl-autoplay", String(autoplayEnabled));
  }, [queue, autoplayEnabled, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;

    localStorage.setItem("vinyl-accent-theme", accentTheme);
  }, [accentTheme, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;

    if (profileAvatar) {
      localStorage.setItem("vinyl-profile-avatar", profileAvatar);
    } else {
      localStorage.removeItem("vinyl-profile-avatar");
    }
  }, [profileAvatar, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;
    localStorage.setItem("vinyl-profile-name", profileName);
    localStorage.setItem("vinyl-profile-email", profileEmail);
  }, [profileName, profileEmail, storageLoaded]);

  useEffect(() => {
    if (!partyCode || !vinylId) return;

    const channel = new BroadcastChannel(`vinyl-party-${partyCode}`);
    partyChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<PartyMessage>) => {
      const message = event.data;
      if (!message || message.senderId === vinylId) return;

      applyingPartyUpdate.current = true;
      if (message.song !== undefined) {
        setCurrentSong(message.song);
      }
      if (message.playlists) setPlaylists(message.playlists);
      if (typeof message.currentTime === "number") {
        setCurrentTime(message.currentTime);
        playerRef.current?.seekTo(message.currentTime, true);
      }
      if (typeof message.isPlaying === "boolean") {
        setIsPlaying(message.isPlaying);
        if (message.isPlaying) playerRef.current?.playVideo();
        else playerRef.current?.pauseVideo();
      }
      window.setTimeout(() => {
        applyingPartyUpdate.current = false;
      }, 200);
    };

    return () => {
      channel.close();
      if (partyChannelRef.current === channel) partyChannelRef.current = null;
    };
  }, [partyCode, vinylId]);

  useEffect(() => {
    if (!partyChannelRef.current || applyingPartyUpdate.current) return;
    partyChannelRef.current.postMessage({
      senderId: vinylId,
      song: currentSong,
      isPlaying,
      currentTime,
    } satisfies PartyMessage);
  }, [currentSong, isPlaying, currentTime, vinylId]);

  useEffect(() => {
    if (!partyChannelRef.current || applyingPartyUpdate.current) return;
    partyChannelRef.current.postMessage({
      senderId: vinylId,
      playlists,
    } satisfies PartyMessage);
  }, [playlists, vinylId]);

  function startParty(code = createPartyCode()) {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return;
    setPartyCode(cleanCode);
    setJoinPartyCode("");
    setPartyStatus(`Opening private room ${cleanCode}…`);
    router.push(`/party/${encodeURIComponent(cleanCode)}`);
  }

  function leaveParty() {
    setPartyCode("");
    setPartyStatus("");
  }

  async function fetchSongs(query: string, pageToken = "") {
    const params = new URLSearchParams({ q: query });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(
      `/api/youtube?${params.toString()}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Search failed.");
    }

    return data as {
      items: Song[];
      nextPageToken: string | null;
    };
  }

  async function loadSongs(
    query: string,
    pageToken = "",
    append = false
  ) {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError("");

      const data = await fetchSongs(query, pageToken);
      const results = data.items ?? [];

      setSongs((previous) =>
        append
          ? uniqueSongs([...previous, ...results])
          : results
      );

      setNextPageToken(data.nextPageToken ?? null);

      if (!append && results.length > 0 && !currentSong) {
        setCurrentSong(results[0]);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function loadRelatedSongs(song: Song) {
    const fallbackSongs = uniqueSongs([
      ...recommendations,
      ...songs,
      ...history,
    ])
      .filter(
        (item) =>
          item.id.videoId !== song.id.videoId &&
          !notInterestedArtists.includes(getTasteArtist(item))
      )
      .slice(0, 10);

    try {
      setLoadingRelated(true);

      const artist = getTasteArtist(song);
      const title = decodeText(song.snippet.title);
      const data = await fetchSongs(
        `${artist} songs similar to ${title}`
      );

      const fetchedSongs = uniqueSongs(data.items || [])
        .filter(
          (item) =>
            item.id.videoId !== song.id.videoId &&
            !notInterestedArtists.includes(getTasteArtist(item))
        )
        .slice(0, 10);

      setRelatedSongs(
        fetchedSongs.length > 0 ? fetchedSongs : fallbackSongs
      );
    } catch {
      setRelatedSongs(fallbackSongs);
    } finally {
      setLoadingRelated(false);
    }
  }

  async function loadPersonalizedRecommendations(
    openForYou = false
  ) {
    if (openForYou) {
      setPanel("forYou");
    }

    setError("");

    const tasteSongs = uniqueSongs([
      ...likedSongs,
      ...history,
    ]);

    if (tasteSongs.length === 0 && preferredArtists.length === 0) {
      setRecommendations([]);
      return;
    }

    try {
      setLoadingRecommendations(true);
      const artistScores = new Map<string, number>();

      preferredArtists.forEach((artist) => {
        artistScores.set(artist, 2);
      });

      history.forEach((song) => {
        const artist = getTasteArtist(song);
        if (notInterestedArtists.includes(artist)) return;
        artistScores.set(artist, (artistScores.get(artist) || 0) + 1);
      });

      likedSongs.forEach((song) => {
        const artist = getTasteArtist(song);
        if (notInterestedArtists.includes(artist)) return;
        artistScores.set(artist, (artistScores.get(artist) || 0) + 3);
      });

      const recommendationQueries = Array.from(
        artistScores.entries()
      )
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(
          ([artist]) => `${artist} songs official music`
        );

      const responses = await Promise.all(
        recommendationQueries.map((query) =>
          fetchSongs(query)
        )
      );

      const recommendedSongs = uniqueSongs(
        responses.flatMap(
          (response) => response.items ?? []
        )
      ).filter(
        (recommendedSong) =>
          !notInterestedArtists.includes(
            getTasteArtist(recommendedSong)
          ) &&
          !tasteSongs.some(
            (knownSong) =>
              knownSong.id.videoId ===
              recommendedSong.id.videoId
          )
      );

      setRecommendations(recommendedSongs.slice(0, 50));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load recommendations."
      );
    } finally {
      setLoadingRecommendations(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSongs(DEFAULT_QUERY);
    }, 0);

    return () => window.clearTimeout(timeoutId);
    // The initial query is intentionally loaded only once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;

    const timeoutId = window.setTimeout(() => {
      void loadPersonalizedRecommendations();
    }, 0);

    return () => window.clearTimeout(timeoutId);
    // Refresh once after the complete saved taste profile is available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageLoaded]);

  useEffect(() => {
    if (!currentSong) return;

    const timeoutId = window.setTimeout(() => {
      void loadRelatedSongs(currentSong);
    }, 250);

    return () => window.clearTimeout(timeoutId);
    // Related tracks refresh only when the active video changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.id.videoId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!playerRef.current || isSeeking) return;

      setCurrentTime(playerRef.current.getCurrentTime() || 0);
      setDuration(playerRef.current.getDuration() || 0);
    }, 500);

    return () => window.clearInterval(interval);
  }, [isSeeking]);

  function handleSearch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const query = search.trim();

    if (!query) return;

    setCurrentQuery(query);
    setHeading(query);
    setPanel("search");
    setSelectedPlaylistId(null);

    loadSongs(query);
  }

  function selectSong(song: Song) {
    if (
      currentSong?.id.videoId === song.id.videoId
    ) {
      togglePlayback();
      return;
    }

    setCurrentSong(song);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(true);

    setHistory((previous) =>
      uniqueSongs([song, ...previous]).slice(0, 30)
    );
  }

  function togglePlayback() {
    if (!playerRef.current) return;

    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  }

  function seekBy(seconds: number) {
    if (!playerRef.current) return;

    const newTime = Math.max(
      0,
      Math.min(currentTime + seconds, duration)
    );

    playerRef.current.seekTo(newTime, true);
    setCurrentTime(newTime);
  }

  function getSeekTime(clientX: number, clientY: number) {
    const ring = vinylRingRef.current;

    if (!ring || duration <= 0) return 0;

    const rectangle = ring.getBoundingClientRect();
    const centerX = rectangle.left + rectangle.width / 2;
    const centerY = rectangle.top + rectangle.height / 2;
    const x = clientX - centerX;
    const y = clientY - centerY;

    let degrees = (Math.atan2(y, x) * 180) / Math.PI + 90;

    if (degrees < 0) degrees += 360;

    const startAngle = (SEEK_START_ANGLE + 360) % 360;
    const angleFromStart =
      (degrees - startAngle + 360) % 360;
    const arcProgress = Math.min(
      angleFromStart,
      SEEK_SWEEP_ANGLE
    );

    return (arcProgress / SEEK_SWEEP_ANGLE) * duration;
  }

  function isOnSeekRing(clientX: number, clientY: number) {
    const ring = vinylRingRef.current;

    if (!ring) return false;

    const rectangle = ring.getBoundingClientRect();
    const centerX = rectangle.left + rectangle.width / 2;
    const centerY = rectangle.top + rectangle.height / 2;
    const distanceFromCenter = Math.hypot(
      clientX - centerX,
      clientY - centerY
    );
    const outerRadius = Math.min(
      rectangle.width,
      rectangle.height
    ) / 2;

    const x = clientX - centerX;
    const y = clientY - centerY;
    let degrees = (Math.atan2(y, x) * 180) / Math.PI + 90;

    if (degrees < 0) degrees += 360;

    const startAngle = (SEEK_START_ANGLE + 360) % 360;
    const angleFromStart =
      (degrees - startAngle + 360) % 360;
    const isOnVisibleArc = angleFromStart <= SEEK_SWEEP_ANGLE;

    return (
      distanceFromCenter >= outerRadius - 48 &&
      isOnVisibleArc
    );
  }

  function addToQueue(song: Song) {
    if (song.id.videoId === currentSong?.id.videoId) return;

    setQueue((previous) =>
      previous.some(
        (item) => item.id.videoId === song.id.videoId
      )
        ? previous
        : [...previous, song]
    );
  }

  function playFromQueue(song: Song) {
    setQueue((previous) =>
      previous.filter(
        (item) => item.id.videoId !== song.id.videoId
      )
    );
    selectSong(song);
  }

  function moveQueueSong(index: number, direction: -1 | 1) {
    setQueue((previous) => {
      const targetIndex = index + direction;

      if (targetIndex < 0 || targetIndex >= previous.length) {
        return previous;
      }

      const reordered = [...previous];
      [reordered[index], reordered[targetIndex]] = [
        reordered[targetIndex],
        reordered[index],
      ];

      return reordered;
    });
  }

  function previewSeek(clientX: number, clientY: number) {
    const selectedTime = getSeekTime(clientX, clientY);
    setCurrentTime(selectedTime);
  }

  function finishSeek(clientX: number, clientY: number) {
    const selectedTime = getSeekTime(clientX, clientY);

    playerRef.current?.seekTo(selectedTime, true);
    setCurrentTime(selectedTime);
    setIsSeeking(false);
    draggingProgress.current = false;
  }

  function toggleLike(song: Song) {
    setLikedSongs((previous) => {
      const alreadyLiked = previous.some(
        (item) =>
          item.id.videoId === song.id.videoId
      );

      if (alreadyLiked) {
        return previous.filter(
          (item) =>
            item.id.videoId !== song.id.videoId
        );
      }

      return uniqueSongs([song, ...previous]);
    });
  }

  function toggleArtist(artist: string) {
    setFollowedArtists((previous) =>
      previous.includes(artist)
        ? previous.filter(
            (item) => item !== artist
          )
        : [...previous, artist]
    );
  }

  function createPlaylist() {
    const name = newPlaylistName.trim();

    if (!name) return;

    const playlist: Playlist = {
      id: createId(),
      name,
      songs: songForNewPlaylist ? [songForNewPlaylist] : [],
    };

    setPlaylists((previous) => [
      ...previous,
      playlist,
    ]);

    setSelectedPlaylistId(playlist.id);
    setNewPlaylistName("");
    setSongForNewPlaylist(null);
    setShowCreatePlaylist(false);
  }

  function deletePlaylist(playlistId: string) {
    setPlaylists((previous) =>
      previous.filter(
        (playlist) =>
          playlist.id !== playlistId
      )
    );

    if (selectedPlaylistId === playlistId) {
      setSelectedPlaylistId(null);
    }
  }

  function addSongToPlaylist(
    playlistId: string,
    song: Song
  ) {
    setPlaylists((previous) =>
      previous.map((playlist) => {
        if (playlist.id !== playlistId) {
          return playlist;
        }

        return {
          ...playlist,
          songs: uniqueSongs([
            ...playlist.songs,
            song,
          ]),
        };
      })
    );

    setSongToAdd(null);
  }

  function removeSongFromPlaylist(
    playlistId: string,
    videoId: string
  ) {
    setPlaylists((previous) =>
      previous.map((playlist) => {
        if (playlist.id !== playlistId) {
          return playlist;
        }

        return {
          ...playlist,
          songs: playlist.songs.filter(
            (song) =>
              song.id.videoId !== videoId
          ),
        };
      })
    );
  }

  function searchArtist(artist: string) {
    setSearch(artist);
    setCurrentQuery(
      `${artist} official music`
    );

    setHeading(artist);
    setPanel("search");
    setSelectedPlaylistId(null);

    loadSongs(`${artist} official music`);
  }

  const selectedPlaylist =
    playlists.find(
      (playlist) =>
        playlist.id === selectedPlaylistId
    ) ?? null;

  const searchSuggestions = search.trim().length >= 2
    ? uniqueSongs([
        ...history,
        ...likedSongs,
        ...recommendations,
        ...songs,
        ...playlists.flatMap((playlist) => playlist.songs),
      ])
        .filter((song) => {
          const needle = search.trim().toLowerCase();
          return (
            decodeText(song.snippet.title).toLowerCase().includes(needle) ||
            decodeText(song.snippet.channelTitle).toLowerCase().includes(needle)
          );
        })
        .slice(0, 6)
    : [];

  const visibleSongs =
    panel === "history"
      ? history
      : panel === "liked"
        ? likedSongs
        : panel === "forYou"
          ? recommendations
          : panel === "playlists"
            ? selectedPlaylist?.songs ?? []
            : songs;

  function playPreviousSong() {
    if (visibleSongs.length === 0) return;

    const currentIndex =
      visibleSongs.findIndex(
        (song) =>
          song.id.videoId ===
          currentSong?.id.videoId
      );

    if (currentIndex <= 0) {
      selectSong(
        visibleSongs[visibleSongs.length - 1]
      );

      return;
    }

    selectSong(visibleSongs[currentIndex - 1]);
  }

  function playNextSong() {
    if (queue.length > 0) {
      const [nextSong, ...remainingQueue] = queue;
      setQueue(remainingQueue);

      if (nextSong.id.videoId === currentSong?.id.videoId) {
        playerRef.current?.seekTo(0, true);
        playerRef.current?.playVideo();
      } else {
        selectSong(nextSong);
      }
      return;
    }

    const nextRelatedSong = relatedSongs.find(
      (song) => song.id.videoId !== currentSong?.id.videoId
    );

    if (nextRelatedSong) {
      setRelatedSongs((previous) =>
        previous.filter(
          (song) => song.id.videoId !== nextRelatedSong.id.videoId
        )
      );
      selectSong(nextRelatedSong);
      return;
    }

    if (visibleSongs.length === 0) return;

    const currentIndex =
      visibleSongs.findIndex(
        (song) =>
          song.id.videoId ===
          currentSong?.id.videoId
      );

    if (
      currentIndex === -1 ||
      currentIndex >= visibleSongs.length - 1
    ) {
      selectSong(visibleSongs[0]);
      return;
    }

    selectSong(visibleSongs[currentIndex + 1]);
  }

  const onReady: YouTubeProps["onReady"] = (
    event
  ) => {
    playerRef.current =
      event.target as PlayerApi;

    setDuration(
      event.target.getDuration() || 0
    );

    if (isPlaying) {
      event.target.playVideo();
    }
  };

  const onStateChange: YouTubeProps["onStateChange"] =
    (event) => {
      setIsPlaying(event.data === 1);

      if (event.data === 0) {
        if (loopEnabled) {
          event.target.seekTo(0, true);
          event.target.playVideo();
        } else if (autoplayEnabled) {
          setCurrentTime(0);
          playNextSong();
        } else {
          setCurrentTime(duration);
          setIsPlaying(false);
        }
      }
    };

  const onPlayerError: YouTubeProps["onError"] =
    () => {
      setIsPlaying(false);

      setError(
        "This upload cannot play here. Pick another result."
      );
    };

  const progress =
    duration > 0
      ? Math.min(currentTime / duration, 1)
      : 0;

  const angle =
    SEEK_START_ANGLE + progress * SEEK_SWEEP_ANGLE;

  function panelLabel() {
    if (panel === "home") {
      return `Welcome back, ${profileName.trim() || "Vinyl listener"}`;
    }

    if (panel === "history") {
      return "Recently played";
    }

    if (panel === "liked") {
      return "Your favourites";
    }

    if (panel === "playlists") {
      return "Your collection";
    }

    if (panel === "artists") {
      return "Following";
    }

    if (panel === "forYou") {
      return "Made from your likes";
    }

    return "Now exploring";
  }

  function panelHeading() {
    if (panel === "home") {
      return "Put Your Records On!";
    }

    if (panel === "history") {
      return "LISTENING HISTORY";
    }

    if (panel === "liked") {
      return "LIKED SONGS";
    }

    if (panel === "playlists") {
      return (
        selectedPlaylist?.name ??
        "MY PLAYLISTS"
      );
    }

    if (panel === "artists") {
      return "FOLLOWED ARTISTS";
    }

    if (panel === "forYou") {
      return "FOR YOU";
    }

    return heading;
  }

  function renderSongRow(
    song: Song,
    index: number
  ) {
    const selected =
      currentSong?.id.videoId ===
      song.id.videoId;

    const liked = likedSongs.some(
      (likedSong) =>
        likedSong.id.videoId ===
        song.id.videoId
    );

    return (
      <div
        key={`${song.id.videoId}-${index}`}
        className={`grid min-h-[68px] w-full grid-cols-[35px_56px_1fr_auto] items-center gap-3 rounded-2xl px-3 transition ${
          selected
            ? darkMode
              ? "bg-white/10 text-[#f7f2e8] shadow-md ring-1 ring-white/10"
              : "bg-pink-100 shadow-md"
            : "hover:bg-white hover:shadow-md"
        }`}
      >
        <span className="text-sm">
          {String(index + 1).padStart(2, "0")}
        </span>

        <button
          type="button"
          onClick={() => selectSong(song)}
        >
          {/* YouTube thumbnail hosts are dynamic, so a native image avoids a
              fixed Next.js remote-host configuration. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getThumbnail(song)}
            alt=""
            className="h-14 w-14 rounded-lg object-cover"
          />
        </button>

        <button
          type="button"
          onClick={() => selectSong(song)}
          className="min-w-0 text-left"
        >
          <span className="block truncate text-lg font-medium">
            {decodeText(song.snippet.title)}
          </span>

          <span className="block truncate text-sm text-gray-500">
            {decodeText(
              song.snippet.channelTitle
            )}
          </span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleLike(song)}
            title={
              liked
                ? "Unlike song"
                : "Like song"
            }
            className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-pink-200"
          >
            {liked ? "❤️" : "♡"}
          </button>

          <button
            type="button"
            onClick={() => addToQueue(song)}
            title="Add to queue"
            className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-pink-200"
          >
            ≡＋
          </button>

          <button
            type="button"
            onClick={() => setSongToAdd(song)}
            title="Add to playlist"
            className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-pink-200"
          >
            ＋
          </button>

          {panel === "playlists" &&
            selectedPlaylist && (
              <button
                type="button"
                title="Remove from playlist"
                onClick={() =>
                  removeSongFromPlaylist(
                    selectedPlaylist.id,
                    song.id.videoId
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-full text-red-400 transition hover:bg-red-50"
              >
                ×
              </button>
            )}

          <button
            type="button"
            onClick={() => selectSong(song)}
            className="flex h-9 w-9 items-center justify-center rounded-full"
          >
            {selected && isPlaying
              ? "❚❚"
              : "▶"}
          </button>
        </div>
      </div>
    );
  }

  function renderHomeDashboard() {
    const isVisibleOnHome = (song: Song) =>
      !hiddenHomeSongIds.includes(song.id.videoId);
    const isRecommendedOnHome = (song: Song) =>
      isVisibleOnHome(song) &&
      !notInterestedArtists.includes(getTasteArtist(song));
    const recentlyPlayed = (
      history.length > 0 ? history : songs
    ).filter(isVisibleOnHome).slice(0, 20);
    const madeForYou = uniqueSongs([
      ...recommendations,
      ...likedSongs,
      ...history,
      ...songs,
    ]).filter(isRecommendedOnHome).slice(0, 14);
    const visibleQuickPicks = uniqueSongs([
      ...recommendations.slice(8),
      ...songs,
      ...history,
    ]).filter(isRecommendedOnHome).slice(0, 14);

    const renderHomeMenu = (song: Song) => {
      if (homeMenuSongId !== song.id.videoId) return null;

      const liked = likedSongs.some(
        (item) => item.id.videoId === song.id.videoId
      );

      return (
        <div className="absolute right-2 top-11 z-50 w-48 overflow-hidden rounded-2xl bg-[#252525] p-2 text-sm text-white shadow-2xl">
          <button
            type="button"
            onClick={() => {
              toggleLike(song);
              setHomeMenuSongId(null);
            }}
            className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/10"
          >
            {liked ? "Remove interest" : "♡ I’m interested"}
          </button>
          <button
            type="button"
            onClick={() => {
              addToQueue(song);
              setHomeMenuSongId(null);
            }}
            className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/10"
          >
            ≡＋ Add to queue
          </button>
          <button
            type="button"
            onClick={() => {
              setSongToAdd(song);
              setHomeMenuSongId(null);
            }}
            className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/10"
          >
            ＋ Add to playlist
          </button>
          <button
            type="button"
            onClick={() => {
              const artist = getTasteArtist(song);
              setNotInterestedArtists((previous) =>
                previous.includes(artist)
                  ? previous
                  : [...previous, artist]
              );
              setHiddenHomeSongIds((previous) =>
                previous.includes(song.id.videoId)
                  ? previous
                  : [...previous, song.id.videoId]
              );
              setRecommendations((previous) =>
                previous.filter(
                  (item) =>
                    getTasteArtist(item) !== artist
                )
              );
              setHomeMenuSongId(null);
            }}
            className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/10"
          >
            ⊘ Not interested
          </button>
          <button
            type="button"
            onClick={() => {
              setHiddenHomeSongIds((previous) =>
                previous.includes(song.id.videoId)
                  ? previous
                  : [...previous, song.id.videoId]
              );
              setHomeMenuSongId(null);
            }}
            className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/10"
          >
            Hide from Home
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaylists((previous) =>
                previous.map((playlist) => ({
                  ...playlist,
                  songs: playlist.songs.filter(
                    (item) => item.id.videoId !== song.id.videoId
                  ),
                }))
              );
              setHomeMenuSongId(null);
            }}
            className="w-full rounded-xl px-3 py-2 text-left text-red-300 hover:bg-white/10"
          >
            Remove from playlists
          </button>
        </div>
      );
    };

    const renderDiscoveryCard = (song: Song) => (
      <div
        key={song.id.videoId}
        className={`group relative w-[175px] shrink-0 text-left ${
          homeMenuSongId === song.id.videoId ? "z-[100]" : "z-0"
        }`}
      >
        <button
          type="button"
          data-video-id={song.id.videoId}
          onClick={selectSongFromDashboard}
          className="relative block h-[175px] w-full overflow-hidden rounded-[28px] bg-pink-100 bg-cover bg-center bg-no-repeat shadow-md transition group-hover:-translate-y-1 group-hover:shadow-xl"
          style={{
            backgroundImage: `url("${getThumbnail(song)}")`,
          }}
        >
          <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-white/10" />
          <span className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-pink-300 text-white shadow-lg">
            {currentSong?.id.videoId === song.id.videoId && isPlaying
              ? "❚❚"
              : "▶"}
          </span>
        </button>
        <button
          type="button"
          aria-label="Song options"
          onClick={() =>
            setHomeMenuSongId((previous) =>
              previous === song.id.videoId ? null : song.id.videoId
            )
          }
          className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-xl text-white backdrop-blur"
        >
          ⋯
        </button>
        {renderHomeMenu(song)}
        <span className="mt-3 block truncate font-semibold">
          {decodeText(song.snippet.title)}
        </span>
        <span className="mt-1 block truncate text-xs text-gray-500">
          {decodeText(song.snippet.channelTitle)}
        </span>
      </div>
    );

    return (
      <div className="mt-6 flex-1 overflow-y-auto pr-3 pb-8">
        {loading && madeForYou.length === 0 && (
          <p className="mb-6 text-sm text-gray-400">
            Curating your home…
          </p>
        )}

        <div className="mb-9">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="eyebrow-pink text-xs font-bold uppercase tracking-[0.28em]">
                CURATED TO MATCH YOUR MOOD
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                Made for you
              </h2>
            </div>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-3">
            {madeForYou.map(renderDiscoveryCard)}
          </div>
        </div>

        <div className="mb-9">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="section-pink text-xs font-bold uppercase tracking-[0.28em]">
                Jump back in
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                Recently listened
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setPanel("history")}
              className="rounded-full border border-pink-200 px-4 py-2 text-xs font-semibold"
            >
              View history →
            </button>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-3">
            {recentlyPlayed.map(renderDiscoveryCard)}
          </div>
        </div>

        <div>
          <p className="eyebrow-pink text-xs font-bold uppercase tracking-[0.28em]">
            One-tap listening
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            Quick picks
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {visibleQuickPicks.map((song) => (
              <div
                key={song.id.videoId}
                className={`relative flex min-w-0 items-center rounded-2xl shadow-sm backdrop-blur-md hover:shadow-md ${
                  homeMenuSongId === song.id.videoId ? "z-[100]" : "z-0"
                } ${
                  darkMode
                    ? "bg-white/10 hover:bg-white/15"
                    : "bg-white/70 hover:bg-pink-50"
                }`}
              >
                <button
                  type="button"
                  data-video-id={song.id.videoId}
                  onClick={selectSongFromDashboard}
                  className="flex min-w-0 flex-1 items-center gap-3 p-2 pr-12 text-left"
                >
                  <span
                    className="h-14 w-14 shrink-0 rounded-xl bg-cover bg-center"
                    style={{
                      backgroundImage: `url("${getThumbnail(song)}")`,
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {decodeText(song.snippet.title)}
                    </span>
                    <span className="block truncate text-xs text-gray-500">
                      {decodeText(song.snippet.channelTitle)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Song options"
                  onClick={() =>
                    setHomeMenuSongId((previous) =>
                      previous === song.id.videoId
                        ? null
                        : song.id.videoId
                    )
                  }
                  className="absolute right-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-xl hover:bg-black/10"
                >
                  ⋯
                </button>
                {renderHomeMenu(song)}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function selectSongFromDashboard(
    event: MouseEvent<HTMLButtonElement>
  ) {
    const videoId = event.currentTarget.dataset.videoId;
    const song = uniqueSongs([
      ...songs,
      ...history,
      ...recommendations,
    ]).find((item) => item.id.videoId === videoId);

    if (song) {
      selectSong(song);
    }
  }

  function openPlaylistEditor(playlist: Playlist) {
    setPlaylistToEdit(playlist);
    setEditPlaylistName(playlist.name);
    setEditPlaylistCover(playlist.cover || "");
  }

  function handlePlaylistCover(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setEditPlaylistCover(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleProfileAvatar(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (
      !file ||
      !file.type.startsWith("image/") ||
      file.size > 2 * 1024 * 1024
    ) {
      return;
    }

    if (backendReady) {
      try {
        setProfileSaveStatus("Uploading picture…");
        const supabase = createSupabaseClient();
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError || !data.user) throw new Error("Please sign in again.");

        const extension =
          file.type === "image/png"
            ? "png"
            : file.type === "image/webp"
              ? "webp"
              : "jpg";
        const path = `${data.user.id}/avatar.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, file, {
            cacheControl: "3600",
            contentType: file.type,
            upsert: true,
          });
        if (uploadError) throw uploadError;

        const { data: publicAvatar } = supabase.storage
          .from("avatars")
          .getPublicUrl(path);
        const avatarUrl = `${publicAvatar.publicUrl}?v=${Date.now()}`;
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ avatar_url: avatarUrl })
          .eq("id", data.user.id);
        if (profileError) throw profileError;

        setProfileAvatar(avatarUrl);
        setProfileSaveStatus("Picture saved");
        return;
      } catch (caughtError) {
        setProfileSaveStatus(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not upload that picture."
        );
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfileAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function saveProfileSettings() {
    localStorage.setItem("vinyl-profile-name", profileName.trim());
    localStorage.setItem("vinyl-accent-theme", accentTheme);
    localStorage.setItem("vinyl-dark-mode", String(darkMode));

    if (!backendReady) {
      setProfileSaveStatus("Saved on this device");
      return;
    }

    try {
      setProfileSaveStatus("Saving…");
      const supabase = createSupabaseClient();
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) throw new Error("Please sign in again.");

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          display_name: profileName.trim(),
          accent_theme: accentTheme,
          dark_mode: darkMode,
        })
        .eq("id", data.user.id);
      if (profileError) throw profileError;

      setProfileSaveStatus("Profile saved");
    } catch (caughtError) {
      setProfileSaveStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save your profile."
      );
    }
  }

  async function removeProfileAvatar() {
    setProfileAvatar("");
    localStorage.removeItem("vinyl-profile-avatar");

    if (!backendReady) return;

    const supabase = createSupabaseClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;

    await Promise.all([
      supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", data.user.id),
      supabase.storage
        .from("avatars")
        .remove([
          `${data.user.id}/avatar.jpg`,
          `${data.user.id}/avatar.png`,
          `${data.user.id}/avatar.webp`,
        ]),
    ]);
    setProfileSaveStatus("Picture removed");
  }

  async function signOut() {
    playerRef.current?.pauseVideo();

    if (backendReady) {
      await createSupabaseClient().auth.signOut();
    }

    localStorage.removeItem("vinyl-session");
    sessionStorage.removeItem("vinyl-session");
    setProfileOpen(false);
    router.replace("/");
    router.refresh();
  }

  function savePlaylistChanges() {
    if (!playlistToEdit) return;

    const name = editPlaylistName.trim();
    if (!name) return;

    setPlaylists((previous) =>
      previous.map((playlist) =>
        playlist.id === playlistToEdit.id
          ? { ...playlist, name, cover: editPlaylistCover }
          : playlist
      )
    );
    setPlaylistToEdit(null);
  }

  function loadHome() {
    setPanel("home");
    setSelectedPlaylistId(null);
    void loadPersonalizedRecommendations();
  }

  if (!authChecked) {
    return (
      <main className="flex h-screen items-center justify-center bg-[#17151b] text-[#fff9f1]">
        <div className="text-center">
          <VinylLogo className="mx-auto h-20 w-40 text-[#e7a2bb]" />
          <p className="mt-2 text-xs uppercase tracking-[0.3em] text-white/40">
            Checking your session…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`h-screen overflow-hidden bg-[#e9edf3] p-2 ${
        darkMode ? "dark-mode" : ""
      } theme-${accentTheme}`}
    >
      <section className="relative mx-auto h-full max-w-[1500px] overflow-hidden bg-[#fffaf6] shadow-2xl">
        <VinylLogo className="absolute right-6 top-[76px] z-50 h-14 w-28 text-[#fff9f1] drop-shadow-lg" />
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div
            key={currentSong?.id.videoId ?? "default-background"}
            className="song-background absolute -inset-[12%] bg-cover bg-center"
            style={{
              backgroundImage: `url("${getThumbnail(currentSong)}")`,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                darkMode
                  ? "linear-gradient(105deg, rgba(28,29,37,0.82) 0%, rgba(38,39,49,0.58) 42%, rgba(24,25,32,0.72) 100%)"
                  : "linear-gradient(105deg, rgba(255,250,246,0.82) 0%, rgba(255,250,246,0.52) 42%, rgba(255,255,255,0.68) 100%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                darkMode
                  ? "radial-gradient(circle at 72% 42%, rgba(255,255,255,0.1), rgba(20,21,28,0.42) 72%)"
                  : "radial-gradient(circle at 72% 42%, rgba(255,255,255,0.08), rgba(255,250,246,0.48) 72%)",
            }}
          />
        </div>

        <nav className="absolute left-[36%] right-8 top-5 z-40 flex items-center justify-between">
          <form
            onSubmit={handleSearch}
            className="relative flex w-[410px] items-center rounded-full bg-white px-5 shadow-[8px_9px_0_rgba(0,0,0,0.08)]"
          >
            <span className="mr-3 text-2xl text-gray-400">
              ⌕
            </span>

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              placeholder="Search any song or artist..."
              className="min-w-0 flex-1 bg-transparent py-4 outline-none"
            />

            <button
              type="submit"
              className="rounded-full bg-pink-300 px-5 py-2 font-semibold text-white"
            >
              Search
            </button>

            {searchFocused && searchSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-[150] overflow-hidden rounded-3xl border border-black/5 bg-white p-2 text-black shadow-2xl">
                <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                  Instant from your Vinyl library
                </p>
                {searchSuggestions.map((song) => (
                  <button
                    type="button"
                    key={song.id.videoId}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      const query = decodeText(song.snippet.title);
                      setSearch(query);
                      setCurrentQuery(query);
                      setHeading(query);
                      setPanel("search");
                      setSearchFocused(false);
                      void loadSongs(query);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-pink-100"
                  >
                    <img src={getThumbnail(song)} alt="" className="h-10 w-10 rounded-xl object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{decodeText(song.snippet.title)}</span>
                      <span className="block truncate text-xs text-gray-400">{decodeText(song.snippet.channelTitle)}</span>
                    </span>
                    <span className="text-gray-300">↗</span>
                  </button>
                ))}
              </div>
            )}
          </form>

          <div className="flex items-center gap-4 text-sm">
            <button
              type="button"
              onClick={loadHome}
              className={
                panel === "home"
                  ? "font-bold"
                  : ""
              }
            >
              Home
            </button>

            <button
              type="button"
              onClick={() => {
                setPanel("playlists");
                setSelectedPlaylistId(null);
              }}
              className={
                panel === "playlists"
                  ? "font-bold"
                  : ""
              }
            >
              Playlists
            </button>
            <button
              type="button"
              onClick={() => setPartyOpen(true)}
              className={`rounded-full px-3 py-2 transition ${
                partyCode ? "bg-pink-400 font-bold text-white" : "hover:bg-white/15"
              }`}
              title="Start or join a listening party"
            >
              {partyCode ? "● Party" : "♫ Party"}
            </button>
            <button
              type="button"
              onClick={() => {
                setProfileView("menu");
                setProfileOpen((previous) => !previous);
              }}
              title="Profile"
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-gray-400 bg-cover bg-center"
              style={
                profileAvatar
                  ? { backgroundImage: `url("${profileAvatar}")` }
                  : undefined
              }
            >
              {!profileAvatar && "👤"}
            </button>
          </div>
        </nav>

        <div
          ref={vinylRingRef}
          onPointerDown={(event) => {
            if (!isOnSeekRing(event.clientX, event.clientY)) {
              return;
            }

            setIsSeeking(true);
            draggingProgress.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            previewSeek(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (!draggingProgress.current) return;
            previewSeek(event.clientX, event.clientY);
          }}
          onPointerUp={(event) => {
            finishSeek(event.clientX, event.clientY);
          }}
          onPointerCancel={() => {
            setIsSeeking(false);
            draggingProgress.current = false;
          }}
          title="Drag along the outer arc to seek"
          className={`absolute left-[-190px] top-[-1px] z-10 h-[730px] w-[740px] touch-none rounded-full border-[4px] p-7 ${
            darkMode
              ? "border-[#e8e3da] bg-transparent"
              : "border-gray-400 bg-transparent"
          }`}
        >
          <div
            className="pointer-events-none absolute inset-0 z-40"
            style={{
              transform: `rotate(${angle}deg)`,
            }}
          >
            <div className="absolute left-1/2 top-[-13px] h-7 w-7 -translate-x-1/2 rounded-full border-4 border-pink-100 bg-pink-300 shadow-lg" />
          </div>

          <div
            className={`absolute inset-7 rounded-full bg-black shadow-2xl ${
              isPlaying ? "vinyl-spin" : ""
            }`}
          >
            <div className="vinyl-classic absolute inset-0 rounded-full" />
            <div className="vinyl-classic-shine absolute inset-0 rounded-full" />
          </div>

          {currentSong && (
            <div className="absolute left-1/2 top-1/2 z-30 h-[285px] w-[285px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-[9px] border-black bg-black shadow-xl">
              <YouTube
                key={currentSong.id.videoId}
                videoId={currentSong.id.videoId}
                onReady={onReady}
                onStateChange={onStateChange}
                onError={onPlayerError}
                className="h-full w-full"
                iframeClassName="absolute left-1/2 top-1/2 h-full w-[178%] max-w-none -translate-x-1/2 -translate-y-1/2"
                opts={{
                  width: "507",
                  height: "285",
                  playerVars: {
                    autoplay: 0,
                    playsinline: 1,
                    rel: 0,
                    controls: 0,
                  },
                }}
              />
            </div>
          )}

        </div>

        {/* Transparent player controls positioned below the vinyl */}
        <div className="absolute bottom-[25px] left-[55px] z-50 flex items-center gap-3 bg-transparent text-black">
          <button
            type="button"
            onClick={playPreviousSong}
            title="Previous song"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/10"
          >
            ⏮
          </button>

          <button
            type="button"
            onClick={() => seekBy(-10)}
            title="Back 10 seconds"
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs hover:bg-black/10"
          >
            ↶10
          </button>

          <button
            type="button"
            onClick={togglePlayback}
            title={isPlaying ? "Pause" : "Play"}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-lg text-white shadow-lg hover:scale-105"
          >
            {isPlaying ? "❚❚" : "▶"}
          </button>

          <button
            type="button"
            onClick={() => seekBy(10)}
            title="Forward 10 seconds"
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs hover:bg-black/10"
          >
            10↷
          </button>

          <button
            type="button"
            onClick={playNextSong}
            title="Next song"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/10"
          >
            ⏭
          </button>

          <button
            type="button"
            onClick={() => setLoopEnabled((previous) => !previous)}
            title="Loop song"
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              loopEnabled
                ? "bg-pink-300 text-white"
                : "hover:bg-black/10"
            }`}
          >
            ↻
          </button>

          <button
            type="button"
            onClick={() =>
              setAutoplayEnabled((previous) => !previous)
            }
            title={
              autoplayEnabled
                ? "Turn autoplay off"
                : "Turn autoplay on"
            }
            aria-pressed={autoplayEnabled}
            className={`flex h-9 items-center justify-center rounded-full px-3 text-xs font-semibold ${
              autoplayEnabled
                ? "bg-pink-300 text-white"
                : "border border-current/20 hover:bg-black/10"
            }`}
          >
            Auto {autoplayEnabled ? "ON" : "OFF"}
          </button>

          <button
            type="button"
            onClick={() => setQueueOpen((previous) => !previous)}
            title="Open queue"
            className={`flex h-9 items-center justify-center gap-1 rounded-full px-3 text-xs font-semibold ${
              queueOpen || queue.length > 0
                ? "bg-pink-300 text-white"
                : "hover:bg-black/10"
            }`}
          >
            ≡ Queue {queue.length > 0 ? queue.length : ""}
          </button>

        </div>

        <div className="absolute bottom-[72px] left-[430px] z-50 rounded-full bg-black/10 px-3 py-1.5 text-xs font-semibold text-black backdrop-blur-md dark:text-white">
          {formatTime(currentTime)}
          <span className="text-gray-400">
            {" "}
            / {formatTime(duration)}
          </span>
        </div>

        {queueOpen && (
          <div className="absolute bottom-20 left-[38px] z-[90] flex w-[390px] flex-col overflow-hidden rounded-3xl bg-[#252525] text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <div>
                <h2 className="text-xl font-semibold">Up next</h2>
                <p className="text-xs text-gray-400">
                  {queue.length} queued {queue.length === 1 ? "song" : "songs"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQueueOpen(false)}
                className="text-xl text-gray-400"
              >
                ×
              </button>
            </div>

            <div className="order-2 flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="font-medium">Autoplay</p>
                <p className="text-xs text-gray-400">
                  Continue automatically when a song ends
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoplayEnabled}
                onClick={() =>
                  setAutoplayEnabled((previous) => !previous)
                }
                className={`relative h-7 w-12 rounded-full ${
                  autoplayEnabled ? "bg-pink-400" : "bg-gray-600"
                }`}
              >
                <span
                  className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    autoplayEnabled
                      ? "translate-x-5"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="order-3 max-h-[190px] space-y-1 overflow-y-auto p-3">
              {queue.length === 0 ? (
                <p className="px-3 py-7 text-center text-sm text-gray-400">
                  Your queue is empty. Add songs using ≡＋.
                </p>
              ) : (
                queue.map((song, index) => (
                  <div
                    key={song.id.videoId}
                    className="flex items-center gap-3 rounded-2xl p-2 hover:bg-white/10"
                  >
                    <span className="w-5 text-xs text-gray-500">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => playFromQueue(song)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-medium">
                        {decodeText(song.snippet.title)}
                      </span>
                      <span className="block truncate text-xs text-gray-400">
                        {decodeText(song.snippet.channelTitle)}
                      </span>
                    </button>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        disabled={index === 0}
                        title="Move song up"
                        onClick={() => moveQueueSong(index, -1)}
                        className="flex h-6 w-7 items-center justify-center rounded-md text-xs text-gray-300 hover:bg-white/10 disabled:cursor-default disabled:opacity-20"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === queue.length - 1}
                        title="Move song down"
                        onClick={() => moveQueueSong(index, 1)}
                        className="flex h-6 w-7 items-center justify-center rounded-md text-xs text-gray-300 hover:bg-white/10 disabled:cursor-default disabled:opacity-20"
                      >
                        ↓
                      </button>
                    </div>
                    <button
                      type="button"
                      title="Remove from queue"
                      onClick={() =>
                        setQueue((previous) =>
                          previous.filter(
                            (item) =>
                              item.id.videoId !== song.id.videoId
                          )
                        )
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-white/10"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="order-1 border-t border-white/10 p-3">
              <div className="flex items-center justify-between px-2 pb-2">
                <div>
                  <p className="font-semibold">Related songs</p>
                  <p className="text-xs text-gray-400">
                    Add whatever matches the vibe
                  </p>
                </div>
                {loadingRelated && (
                  <span className="text-xs text-pink-300">Loading…</span>
                )}
              </div>

              <div className="max-h-[210px] space-y-1 overflow-y-auto">
                {!loadingRelated && relatedSongs.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-gray-400">
                    Play a song to discover related tracks.
                  </p>
                ) : (
                  relatedSongs.map((song) => {
                    const alreadyQueued = queue.some(
                      (item) => item.id.videoId === song.id.videoId
                    );

                    return (
                      <div
                        key={song.id.videoId}
                        className="flex items-center gap-3 rounded-2xl p-2 hover:bg-white/10"
                      >
                        <span
                          className="h-10 w-10 shrink-0 rounded-lg bg-cover bg-center"
                          style={{
                            backgroundImage: `url("${getThumbnail(song)}")`,
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {decodeText(song.snippet.title)}
                          </p>
                          <p className="truncate text-xs text-gray-400">
                            {decodeText(song.snippet.channelTitle)}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={alreadyQueued}
                          title="Add related song to queue"
                          onClick={() => addToQueue(song)}
                          className="flex h-8 min-w-8 items-center justify-center rounded-full bg-pink-400 px-2 text-sm text-white disabled:bg-white/10 disabled:text-gray-400"
                        >
                          {alreadyQueued ? "✓" : "＋"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {queue.length > 0 && (
              <button
                type="button"
                onClick={() => setQueue([])}
                className="order-4 w-full border-t border-white/10 py-3 text-sm text-red-300 hover:bg-white/5"
              >
                Clear queue
              </button>
            )}
          </div>
        )}

        <section className="absolute bottom-6 left-[40%] right-8 top-[125px] z-20 flex flex-col overflow-hidden">
          <p className="eyebrow-pink text-sm font-bold uppercase tracking-[0.35em]">
            {panelLabel()}
          </p>

          <h1 className="mt-2 line-clamp-2 text-4xl font-light uppercase tracking-[0.08em]">
            {panelHeading()}
          </h1>

          {panel === "home" ? (
            renderHomeDashboard()
          ) : panel === "artists" ? (
            <div className="mt-8 flex-1 overflow-y-auto pr-3">
              {followedArtists.length === 0 ? (
                <p className="text-gray-500">
                  Follow artists from the currently
                  playing song 🎤
                </p>
              ) : (
                followedArtists.map((artist) => (
                  <div
                    key={artist}
                    className="mb-3 flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        searchArtist(artist)
                      }
                      className="text-left"
                    >
                      <span className="block text-xl font-medium">
                        {artist}
                      </span>

                      <span className="text-sm text-gray-400">
                        View songs →
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        toggleArtist(artist)
                      }
                      className="rounded-full border border-red-200 px-4 py-2 text-sm text-red-400 hover:bg-red-50"
                    >
                      Unfollow
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : panel === "playlists" &&
            !selectedPlaylist ? (
            <div className="mt-6 flex-1 overflow-y-auto pr-3">
              <button
                type="button"
                onClick={() =>
                  setShowCreatePlaylist(true)
                }
                className="mb-5 rounded-full bg-pink-300 px-5 py-3 font-semibold text-white"
              >
                + Create playlist
              </button>

              {playlists.length === 0 ? (
                <p className="text-gray-500">
                  Create your first playlist, tiny DJ 🎧
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {playlists.map((playlist) => (
                    <div
                      key={playlist.id}
                      className="rounded-3xl bg-white p-5 shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPlaylistId(
                            playlist.id
                          )
                        }
                        className="w-full text-left"
                      >
                        <div
                          className="mb-4 flex h-28 items-center justify-center rounded-2xl bg-pink-100 bg-cover bg-center text-5xl"
                          style={
                            playlist.cover
                              ? { backgroundImage: `url("${playlist.cover}")` }
                              : undefined
                          }
                        >
                          {!playlist.cover && "💿"}
                        </div>

                        <h3 className="text-xl font-semibold">
                          {playlist.name}
                        </h3>

                        <p className="text-sm text-gray-400">
                          {playlist.songs.length} songs
                        </p>
                      </button>

                      <div className="mt-3 flex items-center gap-4 text-sm">
                        <button
                          type="button"
                          onClick={() => openPlaylistEditor(playlist)}
                          className="text-pink-400"
                        >
                          Edit details
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePlaylist(playlist.id)}
                          className="text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mt-4 flex items-center justify-between gap-3">
                <h2 className="section-pink text-xl font-bold">
                  {panel === "history"
                    ? "RECENT"
                    : panel === "liked"
                      ? "YOUR LIKES"
                      : panel === "forYou"
                        ? "RECOMMENDED"
                        : panel === "playlists"
                          ? "PLAYLIST SONGS"
                          : "POPULAR"}
                </h2>

                <div className="flex items-center gap-2">
                  {panel === "playlists" &&
                    selectedPlaylist && (
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPlaylistId(null)
                        }
                        className="rounded-full border px-4 py-2 text-sm"
                      >
                        ← All playlists
                      </button>
                    )}

                </div>
              </div>

              {error && (
                <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-500">
                  {error}
                </p>
              )}

              {panel === "forYou" &&
                likedSongs.length === 0 &&
                history.length === 0 && (
                  <p className="mt-8 text-gray-500">
                    Listen to or like a few songs first so I can
                    learn your taste 😌
                  </p>
                )}

              {loadingRecommendations && (
                <p className="mt-8 text-gray-400">
                  Cooking your recommendations…
                </p>
              )}

                {panel === "search" && loading && (
                <p className="mt-8 text-gray-400">
                  Loading songs…
                </p>
              )}

              <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-3">
                {visibleSongs.map(renderSongRow)}

                {panel === "search" &&
                  nextPageToken && (
                    <button
                      type="button"
                      disabled={loadingMore}
                      onClick={() =>
                        loadSongs(
                          currentQuery,
                          nextPageToken,
                          true
                        )
                      }
                      className="my-4 w-full rounded-full border border-pink-300 py-3 font-bold text-pink-400 hover:bg-pink-50 disabled:opacity-50"
                    >
                      {loadingMore
                        ? "LOADING MORE..."
                        : "VIEW MORE SONGS"}
                    </button>
                  )}
              </div>
            </>
          )}
        </section>

        {showCreatePlaylist && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="w-[360px] rounded-3xl bg-white p-7 shadow-2xl">
              <h2 className="text-2xl font-semibold">
                New playlist 💿
              </h2>

              <input
                autoFocus
                value={newPlaylistName}
                onChange={(event) =>
                  setNewPlaylistName(
                    event.target.value
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    createPlaylist();
                  }
                }}
                placeholder="Playlist name..."
                className="mt-5 w-full rounded-full bg-gray-100 px-5 py-3 outline-none"
              />

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreatePlaylist(false);
                    setNewPlaylistName("");
                    setSongForNewPlaylist(null);
                  }}
                  className="rounded-full border px-5 py-2"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={createPlaylist}
                  className="rounded-full bg-pink-300 px-5 py-2 font-semibold text-white"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {playlistToEdit && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="w-[390px] rounded-3xl bg-white p-7 shadow-2xl">
              <h2 className="text-2xl font-semibold">
                Customize playlist
              </h2>

              <div
                className="mt-5 flex h-40 items-center justify-center rounded-3xl bg-pink-100 bg-cover bg-center text-6xl"
                style={
                  editPlaylistCover
                    ? { backgroundImage: `url("${editPlaylistCover}")` }
                    : undefined
                }
              >
                {!editPlaylistCover && "💿"}
              </div>

              <label className="mt-4 block text-sm text-gray-500">
                Playlist name
              </label>
              <input
                value={editPlaylistName}
                onChange={(event) =>
                  setEditPlaylistName(event.target.value)
                }
                className="mt-2 w-full rounded-full bg-gray-100 px-5 py-3 outline-none"
              />

              <label className="mt-4 block cursor-pointer rounded-full border border-pink-200 px-5 py-3 text-center text-sm font-semibold text-pink-400">
                Choose cover picture
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePlaylistCover}
                  className="hidden"
                />
              </label>

              {editPlaylistCover && (
                <button
                  type="button"
                  onClick={() => setEditPlaylistCover("")}
                  className="mt-3 w-full text-sm text-gray-400"
                >
                  Remove cover
                </button>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPlaylistToEdit(null)}
                  className="rounded-full border px-5 py-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={savePlaylistChanges}
                  className="rounded-full bg-pink-300 px-5 py-2 font-semibold text-white"
                >
                  Save changes
                </button>
              </div>
            </div>
          </div>
        )}

        {songToAdd && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="w-[390px] rounded-3xl bg-white p-7 shadow-2xl">
              <h2 className="text-2xl font-semibold">
                Add to playlist
              </h2>

              <p className="mt-2 truncate text-sm text-gray-400">
                {decodeText(
                  songToAdd.snippet.title
                )}
              </p>

              <div className="mt-5 max-h-[260px] space-y-2 overflow-y-auto">
                {playlists.length === 0 ? (
                  <p className="text-gray-500">
                    You don’t have any playlists yet.
                  </p>
                ) : (
                  playlists.map((playlist) => {
                    const alreadyAdded =
                      playlist.songs.some(
                        (song) =>
                          song.id.videoId ===
                          songToAdd.id.videoId
                      );

                    return (
                      <button
                        type="button"
                        key={playlist.id}
                        disabled={alreadyAdded}
                        onClick={() =>
                          addSongToPlaylist(
                            playlist.id,
                            songToAdd
                          )
                        }
                        className="flex w-full items-center justify-between rounded-2xl bg-gray-50 p-4 text-left hover:bg-pink-50 disabled:opacity-50"
                      >
                        <span>{playlist.name}</span>

                        <span>
                          {alreadyAdded
                            ? "Added ✓"
                            : "Add ＋"}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="mt-5 flex justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setSongForNewPlaylist(songToAdd);
                    setSongToAdd(null);
                    setShowCreatePlaylist(true);
                  }}
                  className="text-sm font-semibold text-pink-400"
                >
                  + New playlist
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setSongToAdd(null)
                  }
                  className="rounded-full border px-5 py-2"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {partyOpen && (
          <div className="absolute inset-0 z-[140] flex items-center justify-center bg-black/45 p-5 backdrop-blur-md">
            <div className="w-full max-w-[520px] overflow-hidden rounded-[32px] border border-white/10 bg-[#252525] text-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-white/10 p-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-pink-300">Listen together</p>
                  <h2 className="mt-2 text-3xl font-semibold">Vinyl Party</h2>
                  <p className="mt-1 text-sm text-gray-400">Sync the song and build playlists together.</p>
                </div>
                <button type="button" onClick={() => setPartyOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-xl hover:bg-white/10">×</button>
              </div>

              <div className="space-y-5 p-6">
                <div className="rounded-3xl bg-gradient-to-br from-pink-400/25 to-white/5 p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-gray-400">Your Vinyl ID</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="font-mono text-lg font-bold">{vinylId}</span>
                    <button type="button" onClick={() => void navigator.clipboard.writeText(vinylId)} className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/15">Copy ID</button>
                  </div>
                </div>

                {partyCode ? (
                  <div className="rounded-3xl border border-pink-400/35 bg-white/5 p-5">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pink-300 opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-pink-400" />
                      </span>
                      <div>
                        <p className="font-semibold">Party is live</p>
                        <p className="text-xs text-gray-400">Room {partyCode}</p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-gray-300">Playback and playlist changes are now shared with everyone in this room.</p>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => void navigator.clipboard.writeText(partyCode)} className="rounded-full bg-pink-400 py-3 font-semibold text-white">Copy invite code</button>
                      <button type="button" onClick={leaveParty} className="rounded-full border border-white/15 py-3 font-semibold hover:bg-white/5">Leave party</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={() => startParty()} className="w-full rounded-full bg-pink-400 py-4 text-base font-bold text-white shadow-lg">＋ Start a listening party</button>
                    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-gray-500"><span className="h-px flex-1 bg-white/10" />or join friends<span className="h-px flex-1 bg-white/10" /></div>
                    <div className="flex gap-3">
                      <input value={joinPartyCode} onChange={(event) => setJoinPartyCode(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") startParty(joinPartyCode); }} maxLength={6} placeholder="PARTY CODE" className="min-w-0 flex-1 rounded-full bg-white/10 px-5 py-3 font-mono uppercase tracking-[0.18em] outline-none placeholder:text-gray-500" />
                      <button type="button" onClick={() => startParty(joinPartyCode)} disabled={!joinPartyCode.trim()} className="rounded-full bg-white px-6 font-bold text-[#252525] disabled:opacity-40">Join</button>
                    </div>
                  </>
                )}
                {partyStatus && <p className="text-center text-xs text-gray-400">{partyStatus}</p>}
                <p className="text-center text-[11px] leading-5 text-gray-500">Live sync works between Vinyl tabs using the same party code. A hosted realtime service is required before cross-device invites can work in production.</p>
              </div>
            </div>
          </div>
        )}

        {profileOpen && (
          <div className="absolute right-6 top-[76px] z-[120] w-[330px] overflow-hidden rounded-3xl bg-[#252525] text-white shadow-2xl">
            <div className="flex items-center gap-4 border-b border-white/10 p-5">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-400 bg-cover bg-center text-xl font-bold"
                style={
                  profileAvatar
                    ? { backgroundImage: `url("${profileAvatar}")` }
                    : undefined
                }
              >
                {!profileAvatar && profileName.charAt(0).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{profileName}</p>
                <p className="truncate text-sm text-gray-400">{profileEmail}</p>
              </div>

              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="text-xl text-gray-400"
              >
                ×
              </button>
            </div>

            {profileView === "menu" ? (
              <div className="space-y-1 p-3">
                <button type="button" onClick={() => { setPanel("history"); setProfileOpen(false); }} className="flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left hover:bg-white/10">
                  <span>🕘</span><span>History</span>
                </button>
  
                <button type="button" onClick={() => { setPanel("playlists"); setSelectedPlaylistId(null); setProfileOpen(false); }} className="flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left hover:bg-white/10">
                  <span>💿</span><span>Your playlists</span>
                </button>
                <button type="button" onClick={() => { setPartyOpen(true); setProfileOpen(false); }} className="flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left hover:bg-white/10">
                  <span>🎧</span><span>Listening party</span>
                </button>
                <div className="my-2 border-t border-white/10" />
                <button type="button" onClick={() => setProfileView("settings")} className="flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left hover:bg-white/10">
                  <span>⚙️</span><span>Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left hover:bg-white/10"
                >
                  <span>↪</span><span>Sign out</span>
                </button>
              </div>
            ) : (
              <div className="p-5">
                <button type="button" onClick={() => setProfileView("menu")} className="mb-4 text-sm text-gray-300">← Back</button>

                <div className="mb-5 flex items-center gap-4">
                  <div
                    className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-pink-400 bg-cover bg-center text-2xl font-bold shadow-xl"
                    style={
                      profileAvatar
                        ? { backgroundImage: `url("${profileAvatar}")` }
                        : undefined
                    }
                  >
                    {!profileAvatar && profileName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <label className="block cursor-pointer rounded-full bg-white/10 px-4 py-2 text-center text-xs font-semibold hover:bg-white/15">
                      Choose PFP
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProfileAvatar}
                        className="hidden"
                      />
                    </label>
                    {profileAvatar && (
                      <button
                        type="button"
                        onClick={() => void removeProfileAvatar()}
                        className="mt-2 w-full text-xs text-gray-400"
                      >
                        Remove picture
                      </button>
                    )}
                    <p className="mt-2 text-center text-[10px] text-gray-500">
                      JPG, PNG or WebP · max 2 MB
                    </p>
                  </div>
                </div>

                <label className="block text-sm text-gray-400">Account name</label>
                <input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="mt-2 w-full rounded-xl bg-white/10 px-4 py-3 text-white outline-none" />

                <label className="mt-4 block text-sm text-gray-400">Email</label>
                <input
                  value={profileEmail}
                  readOnly={backendReady}
                  onChange={(event) => setProfileEmail(event.target.value)}
                  className="mt-2 w-full rounded-xl bg-white/10 px-4 py-3 text-white outline-none read-only:cursor-not-allowed read-only:opacity-60"
                />
                {backendReady && (
                  <p className="mt-1 text-[10px] text-gray-500">
                    Account email changes require email verification.
                  </p>
                )}

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-gray-400">Your Vinyl ID</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="font-mono text-sm font-bold text-pink-300">{vinylId}</p>
                    <button type="button" onClick={() => void navigator.clipboard.writeText(vinylId)} className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/15">Copy</button>
                  </div>
                  <p className="mt-3 border-t border-white/10 pt-3 text-sm text-gray-300">@{uniqueUsername}</p>
                </div>

                <div className="mt-5 rounded-2xl bg-white/5 p-4">
                  <p className="font-medium">Accent theme</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Pick the color that fits your vibe
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: "rose", label: "Rose", color: "#B35A66" },
                        { id: "sunset", label: "Sunset", color: "#e8945f" },
                      ] as const
                    ).map((theme) => (
                      <button
                        type="button"
                        key={theme.id}
                        onClick={() => setAccentTheme(theme.id)}
                        className={`rounded-xl border px-2 py-3 text-xs font-semibold ${
                          accentTheme === theme.id
                            ? "border-white/45 bg-white/15"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <span
                          className="mx-auto mb-2 block h-5 w-5 rounded-full shadow-lg"
                          style={{ backgroundColor: theme.color }}
                        />
                        {theme.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/5 p-4">
                  <div>
                    <p className="font-medium">Dark mode</p>
                    <p className="text-xs text-gray-400">
                      Dim the interface at night
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={darkMode}
                    onClick={() =>
                      setDarkMode((previous) => !previous)
                    }
                    className={`relative h-7 w-12 rounded-full transition-colors ${
                      darkMode ? "bg-pink-400" : "bg-gray-600"
                    }`}
                  >
                    <span
                      className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        darkMode
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {profileSaveStatus && (
                  <p className="mt-3 text-center text-xs text-gray-400">
                    {profileSaveStatus}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void saveProfileSettings()}
                  className="mt-4 w-full rounded-full bg-pink-400 py-3 text-sm font-semibold text-white hover:brightness-105"
                >
                  Save profile
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
