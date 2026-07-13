"use client";
/* eslint-disable @next/next/no-img-element -- YouTube thumbnails are remote, dynamic URLs. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import YouTube, { type YouTubeProps } from "react-youtube";
import VinylLogo from "../../components/VinylLogo";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Song = {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: Record<string, { url: string } | undefined>;
  };
};

type PlayerApi = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
};

type Playlist = {
  id: string;
  name: string;
  songs: Song[];
  cover?: string;
};

type Room = {
  code: string;
  song: Song | null;
  isPlaying: boolean;
  loop: boolean;
  position: number;
  updatedAt: number;
  queue: Song[];
  members: Record<string, { name: string; seenAt: number }>;
};

function thumbnail(song: Song | null) {
  return song?.snippet.thumbnails.high?.url ?? song?.snippet.thumbnails.medium?.url ?? song?.snippet.thumbnails.default?.url ?? "";
}

function decodeText(text: string) {
  if (typeof document === "undefined") return text;
  const element = document.createElement("textarea");
  element.innerHTML = text;
  return element.value;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

export default function PartyRoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const backendReady = isSupabaseConfigured();
  const code = String(params.code ?? "").toUpperCase();
  const [room, setRoom] = useState<Room | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const playerRef = useRef<PlayerApi | null>(null);
  const memberIdRef = useRef("");
  const memberNameRef = useRef("Vinyl friend");
  const applyingRemote = useRef(false);
  const seekingRef = useRef(false);

  useEffect(() => {
    if (backendReady) {
      const supabase = createSupabaseClient();
      void (async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          router.replace("/");
          return;
        }

        memberIdRef.current = data.user.id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, display_name")
          .eq("id", data.user.id)
          .single();
        memberNameRef.current = `@${
          profile?.username || profile?.display_name || "vinyl-friend"
        }`;
        setLikedSongs(JSON.parse(localStorage.getItem("vinyl-liked") || "[]"));
        setPlaylists(JSON.parse(localStorage.getItem("vinyl-playlists") || "[]"));
      })();
      return;
    }

    const session = localStorage.getItem("vinyl-session") || sessionStorage.getItem("vinyl-session");
    if (!session) {
      router.replace("/");
      return;
    }
    memberIdRef.current = localStorage.getItem("vinyl-user-id") || crypto.randomUUID();
    memberNameRef.current = `@${localStorage.getItem("vinyl-username") || localStorage.getItem("vinyl-profile-name") || "vinyl-friend"}`;
    queueMicrotask(() => {
      setLikedSongs(JSON.parse(localStorage.getItem("vinyl-liked") || "[]"));
      setPlaylists(JSON.parse(localStorage.getItem("vinyl-playlists") || "[]"));
    });
  }, [backendReady, router]);

  const updateRoom = useCallback(async (patch: Partial<Room>) => {
    const response = await fetch("/api/party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        memberId: memberIdRef.current,
        memberName: memberNameRef.current,
        ...patch,
      }),
    });
    if (response.ok) setRoom(await response.json());
  }, [code]);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    const sync = async () => {
      const response = await fetch(`/api/party?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      if (!response.ok || cancelled) return;
      const next = (await response.json()) as Room;
      setRoom((previous) => {
        if (previous?.song?.id.videoId !== next.song?.id.videoId) return next;
        return { ...next, song: previous?.song ?? next.song };
      });

      const player = playerRef.current;
      if (player && next.song) {
        applyingRemote.current = true;
        const localTime = player.getCurrentTime() || 0;
        if (!seekingRef.current && Math.abs(localTime - next.position) > 2.2) {
          player.seekTo(next.position, true);
        }
        if (next.isPlaying) player.playVideo();
        else player.pauseVideo();
        window.setTimeout(() => { applyingRemote.current = false; }, 250);
      }

      // Preserve the server-projected playhead while refreshing membership.
      void updateRoom({ position: next.position });
    };

    void sync();
    const interval = window.setInterval(sync, 900);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [code, updateRoom]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || seekingRef.current) return;
      setPlaybackTime(player.getCurrentTime() || 0);
      setDuration(player.getDuration() || 0);
    }, 400);

    return () => window.clearInterval(interval);
  }, []);

  const onReady: YouTubeProps["onReady"] = (event) => {
    playerRef.current = event.target as PlayerApi;
    if (!room) return;
    setDuration(event.target.getDuration() || 0);
    setPlaybackTime(room.position);
    event.target.seekTo(room.position, true);
    if (room.isPlaying) event.target.playVideo();
  };

  const onStateChange: YouTubeProps["onStateChange"] = (event) => {
    if (applyingRemote.current) return;
    if (event.data === 1 || event.data === 2) {
      void updateRoom({ isPlaying: event.data === 1, position: event.target.getCurrentTime() || 0 });
    }
    if (event.data === 0) {
      if (room?.loop) {
        event.target.seekTo(0, true);
        event.target.playVideo();
        void updateRoom({ position: 0, isPlaying: true });
      } else {
        playNext();
      }
    }
  };

  function playSong(song: Song) {
    const nextQueue = (room?.queue ?? []).filter((item) => item.id.videoId !== song.id.videoId);
    void updateRoom({ song, queue: nextQueue, position: 0, isPlaying: true });
  }

  function playNext() {
    const next = room?.queue[0];
    if (next) playSong(next);
    else void updateRoom({ isPlaying: false, position: 0 });
  }

  async function searchSongs() {
    const query = search.trim();
    if (!query) return;
    setSearching(true);
    try {
      const response = await fetch(`/api/youtube?q=${encodeURIComponent(`${query} official audio music`)}`);
      const data = await response.json();
      setResults((data.items ?? []).slice(0, 8));
    } finally {
      setSearching(false);
    }
  }

  function addToQueue(song: Song) {
    const queue = [...(room?.queue ?? [])];
    if (!queue.some((item) => item.id.videoId === song.id.videoId)) queue.push(song);
    void updateRoom({ queue });
  }

  function moveQueuedSong(index: number, direction: -1 | 1) {
    if (!room) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= room.queue.length) return;

    const queue = [...room.queue];
    [queue[index], queue[nextIndex]] = [queue[nextIndex], queue[index]];
    void updateRoom({ queue });
  }

  function previewSeek(value: number) {
    seekingRef.current = true;
    setPlaybackTime(value);
    playerRef.current?.seekTo(value, true);
  }

  function commitSeek() {
    seekingRef.current = false;
    playerRef.current?.seekTo(playbackTime, true);
    void updateRoom({ position: playbackTime, isPlaying: room?.isPlaying ?? false });
  }

  function toggleLike() {
    if (!room?.song) return;
    const song = room.song;
    const liked = likedSongs.some((item) => item.id.videoId === song.id.videoId);
    const next = liked
      ? likedSongs.filter((item) => item.id.videoId !== song.id.videoId)
      : [song, ...likedSongs];
    setLikedSongs(next);
    localStorage.setItem("vinyl-liked", JSON.stringify(next));
  }

  function addCurrentSongToPlaylist(playlistId: string) {
    if (!room?.song) return;
    const song = room.song;
    const next = playlists.map((playlist) =>
      playlist.id !== playlistId || playlist.songs.some((item) => item.id.videoId === song.id.videoId)
        ? playlist
        : { ...playlist, songs: [...playlist.songs, song] }
    );
    setPlaylists(next);
    localStorage.setItem("vinyl-playlists", JSON.stringify(next));
    setPlaylistPickerOpen(false);
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  const members = Object.entries(room?.members ?? {});
  const currentSongLiked = Boolean(
    room?.song && likedSongs.some((song) => song.id.videoId === room.song?.id.videoId)
  );

  return (
    <main className="h-screen overflow-y-auto bg-[radial-gradient(circle_at_20%_10%,#6b3c48_0%,#292731_42%,#17171d_100%)] p-3 text-[#fff8f4] sm:p-4">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1450px] flex-col overflow-hidden rounded-[36px] border border-white/10 bg-black/20 shadow-2xl backdrop-blur-xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-7 py-5">
          <button type="button" onClick={() => router.push("/home")} className="w-24"><VinylLogo className="h-auto w-full text-white" /></button>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#d98b9a]">Private listening room</p>
            <h1 className="mt-1 text-2xl font-semibold">Party {code}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-400/15 px-4 py-2 text-xs text-emerald-200">● {members.length || 1} listening</span>
            <button type="button" onClick={copyInvite} className="rounded-full bg-[#b35a66] px-5 py-2 text-sm font-semibold text-white">{copied ? "Copied!" : "Invite friends"}</button>
          </div>
        </header>

        <div className="flex items-center gap-3 overflow-x-auto border-b border-white/10 px-7 py-3">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">In the room</span>
          {members.map(([id, member]) => (
            <div key={id} className="flex shrink-0 items-center gap-2 rounded-full bg-white/7 py-1.5 pl-1.5 pr-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#b35a66] text-xs font-bold">{member.name.replace("@", "").charAt(0).toUpperCase()}</span>
              <span className="text-xs font-medium">{member.name}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </div>
          ))}
          {members.length === 0 && <span className="text-xs text-white/35">Waiting for your friends to join…</span>}
        </div>

        <div className="grid flex-1 items-start gap-5 p-5 lg:grid-cols-[1.05fr_.95fr] lg:p-6">
          <section className="flex min-h-[500px] flex-col items-center justify-start rounded-[32px] border border-white/10 bg-white/5 p-5 pt-6">
            <div className="relative aspect-square w-full max-w-[445px] rounded-full shadow-[0_30px_70px_rgba(0,0,0,.45)]">
              <div className={`absolute inset-0 rounded-full bg-[repeating-radial-gradient(circle,#15161b_0_6px,#30323a_7px_9px)] ${room?.isPlaying ? "vinyl-spin" : ""}`}>
                <div className="pointer-events-none absolute inset-0 rounded-full bg-[conic-gradient(from_15deg,transparent_0_12%,rgba(255,255,255,.12)_18%,transparent_25%_58%,rgba(255,255,255,.08)_66%,transparent_75%)]" />
              </div>
              <div className="absolute inset-[24%] z-10 overflow-hidden rounded-full border-[8px] border-black bg-[#b35a66] shadow-xl">
                {room?.song ? (
                  <YouTube key={room.song.id.videoId} videoId={room.song.id.videoId} onReady={onReady} onStateChange={onStateChange} className="h-full w-full" iframeClassName="h-full w-full scale-[1.45]" opts={{ width: "270", height: "270", playerVars: { autoplay: 1, controls: 0, playsinline: 1, rel: 0 } }} />
                ) : <div className="flex h-full items-center justify-center text-center text-sm">Pick a song<br />to start the party</div>}
              </div>
            </div>
            <div className="mt-4 w-full max-w-[560px] text-center">
              <h2 className="truncate text-xl font-semibold">{room?.song ? decodeText(room.song.snippet.title) : "The room is quiet…"}</h2>
              <p className="mt-1 text-sm text-white/50">{room?.song ? decodeText(room.song.snippet.channelTitle) : "Add something everyone will love"}</p>
              <div className="mx-auto mt-4 w-full max-w-[500px]">
                <input
                  type="range"
                  min={0}
                  max={Math.max(duration, 1)}
                  step={0.1}
                  value={Math.min(playbackTime, Math.max(duration, 1))}
                  disabled={!room?.song || duration <= 0}
                  onPointerDown={() => { seekingRef.current = true; }}
                  onChange={(event) => previewSeek(Number(event.target.value))}
                  onPointerUp={commitSeek}
                  onPointerCancel={commitSeek}
                  onKeyUp={commitSeek}
                  onBlur={() => { if (seekingRef.current) commitSeek(); }}
                  aria-label="Song progress"
                  className="h-2 w-full cursor-pointer accent-[#b35a66] disabled:cursor-not-allowed disabled:opacity-35"
                />
                <div className="mt-1 flex justify-between font-mono text-[11px] text-white/45">
                  <span>{formatTime(playbackTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <button type="button" onClick={() => void updateRoom({ position: Math.max(0, (room?.position ?? 0) - 10) })} className="rounded-full bg-white/10 px-4 py-3">↶ 10</button>
                <button type="button" onClick={() => void updateRoom({ isPlaying: !room?.isPlaying, position: playerRef.current?.getCurrentTime() ?? room?.position ?? 0 })} disabled={!room?.song} className="flex h-14 w-14 items-center justify-center rounded-full bg-[#b35a66] text-xl shadow-lg disabled:opacity-40">{room?.isPlaying ? "❚❚" : "▶"}</button>
                <button type="button" onClick={playNext} className="rounded-full bg-white/10 px-4 py-3">Next ⏭</button>
                <button
                  type="button"
                  onClick={() => void updateRoom({ loop: !room?.loop })}
                  disabled={!room?.song}
                  title="Loop this song for everyone"
                  className={`rounded-full px-4 py-3 font-medium disabled:opacity-35 ${room?.loop ? "bg-[#b35a66] text-white" : "bg-white/10"}`}
                >
                  ↻ {room?.loop ? "Loop on" : "Loop"}
                </button>
                <button
                  type="button"
                  onClick={toggleLike}
                  disabled={!room?.song}
                  className={`rounded-full px-4 py-3 font-medium disabled:opacity-35 ${currentSongLiked ? "bg-[#b35a66] text-white" : "bg-white/10"}`}
                >
                  {currentSongLiked ? "♥ Liked" : "♡ Like"}
                </button>
                <button
                  type="button"
                  onClick={() => setPlaylistPickerOpen(true)}
                  disabled={!room?.song}
                  className="rounded-full bg-white/10 px-4 py-3 font-medium hover:bg-white/15 disabled:opacity-35"
                >
                  ＋ Playlist
                </button>
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-col gap-5">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <h2 className="text-lg font-semibold">Find the next song</h2>
              <div className="mt-3 flex gap-2">
                <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchSongs(); }} placeholder="Song or artist…" className="min-w-0 flex-1 rounded-full bg-black/25 px-5 py-3 outline-none placeholder:text-white/30" />
                <button type="button" onClick={() => void searchSongs()} className="rounded-full bg-[#b35a66] px-5 font-semibold">{searching ? "…" : "Search"}</button>
              </div>
              <div className="mt-4 max-h-[250px] space-y-2 overflow-y-auto pr-1">
                {results.map((song) => (
                  <div key={song.id.videoId} className="flex items-center gap-3 rounded-2xl bg-black/20 p-2">
                    <img src={thumbnail(song)} alt="" className="h-12 w-12 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{decodeText(song.snippet.title)}</p><p className="truncate text-xs text-white/40">{decodeText(song.snippet.channelTitle)}</p></div>
                    <button type="button" onClick={() => addToQueue(song)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#b35a66]">＋</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Shared queue</h2><span className="text-xs text-white/40">{room?.queue.length ?? 0} songs</span></div>
              <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto overscroll-contain pr-1">
                {room?.queue.length ? room.queue.map((song, index) => (
                  <div key={`${song.id.videoId}-${index}`} className="flex items-center gap-3 rounded-2xl bg-black/20 p-3">
                    <span className="w-5 text-xs text-white/30">{index + 1}</span><img src={thumbnail(song)} alt="" className="h-11 w-11 rounded-xl object-cover" />
                    <button type="button" onClick={() => playSong(song)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium">{decodeText(song.snippet.title)}</span><span className="block truncate text-xs text-white/40">{decodeText(song.snippet.channelTitle)}</span></button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveQueuedSong(index, -1)}
                        disabled={index === 0}
                        title="Move song up"
                        aria-label="Move song up"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-sm text-white/65 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQueuedSong(index, 1)}
                        disabled={index === room.queue.length - 1}
                        title="Move song down"
                        aria-label="Move song down"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-sm text-white/65 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateRoom({ queue: room.queue.filter((_, itemIndex) => itemIndex !== index) })}
                        title="Remove from queue"
                        aria-label="Remove from queue"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 hover:bg-red-400/10 hover:text-red-300"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )) : <p className="py-12 text-center text-sm text-white/35">Your shared queue is waiting 🎶</p>}
              </div>
            </div>
          </section>
        </div>
      </div>

      {playlistPickerOpen && room?.song && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[420px] rounded-[30px] border border-white/10 bg-[#25242b] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#d98b9a]">Save your song</p>
                <h2 className="mt-2 text-2xl font-semibold">Add to playlist</h2>
                <p className="mt-1 truncate text-sm text-white/45">{decodeText(room.song.snippet.title)}</p>
              </div>
              <button type="button" onClick={() => setPlaylistPickerOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-xl hover:bg-white/10">×</button>
            </div>

            <div className="mt-5 max-h-[300px] space-y-2 overflow-y-auto pr-1">
              {playlists.length ? playlists.map((playlist) => {
                const alreadyAdded = playlist.songs.some((song) => song.id.videoId === room.song?.id.videoId);
                return (
                  <button
                    type="button"
                    key={playlist.id}
                    disabled={alreadyAdded}
                    onClick={() => addCurrentSongToPlaylist(playlist.id)}
                    className="flex w-full items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-left hover:bg-white/10 disabled:opacity-45"
                  >
                    <span className="truncate font-medium">{playlist.name}</span>
                    <span className="ml-3 text-sm text-white/50">{alreadyAdded ? "Added ✓" : "Add ＋"}</span>
                  </button>
                );
              }) : (
                <div className="rounded-2xl bg-white/5 p-5 text-center text-sm text-white/45">
                  Create a playlist from the Home page first, then it’ll appear here.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
