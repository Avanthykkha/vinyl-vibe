import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Song = {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: Record<string, { url: string } | undefined>;
  };
};

type PartyPatch = {
  code?: string;
  song?: Song | null;
  isPlaying?: boolean;
  loop?: boolean;
  position?: number;
  queue?: Song[];
};

const MAX_QUEUE_SIZE = 100;
const MAX_BODY_BYTES = 250_000;

function cleanCode(value: string | null | undefined) {
  return (value ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();
}

function isSong(value: unknown): value is Song {
  if (!value || typeof value !== "object") return false;
  const song = value as Partial<Song>;
  return Boolean(
    song.id &&
      typeof song.id.videoId === "string" &&
      song.id.videoId.length > 0 &&
      song.id.videoId.length <= 32 &&
      song.snippet &&
      typeof song.snippet.title === "string" &&
      song.snippet.title.length <= 500 &&
      typeof song.snippet.channelTitle === "string" &&
      song.snippet.channelTitle.length <= 200 &&
      song.snippet.thumbnails &&
      typeof song.snippet.thumbnails === "object"
  );
}

function roomResponse(
  room: {
    code: string;
    song: Song | null;
    is_playing: boolean;
    loop_enabled: boolean;
    position: number;
    queue: Song[];
    updated_at: string;
  },
  members: Array<{ user_id: string; display_name: string; last_seen: string }>
) {
  const updatedAt = new Date(room.updated_at).getTime();
  const now = Date.now();
  const position = room.is_playing
    ? room.position + Math.max(0, now - updatedAt) / 1000
    : room.position;

  return {
    code: room.code,
    song: room.song,
    isPlaying: room.is_playing,
    loop: room.loop_enabled,
    position,
    updatedAt,
    queue: Array.isArray(room.queue) ? room.queue : [],
    members: Object.fromEntries(
      members.map((member) => [
        member.user_id,
        {
          name: member.display_name,
          seenAt: new Date(member.last_seen).getTime(),
        },
      ])
    ),
  };
}

async function authenticatedRequest() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : data.user };
}

async function findOrCreateRoom(
  supabase: Awaited<ReturnType<typeof createClient>>,
  code: string,
  userId: string
) {
  const selected = await supabase
    .from("party_rooms")
    .select("code, song, is_playing, loop_enabled, position, queue, updated_at")
    .eq("code", code)
    .maybeSingle();

  if (selected.error) return selected;
  if (selected.data) return selected;

  const inserted = await supabase
    .from("party_rooms")
    .insert({ code, created_by: userId })
    .select("code, song, is_playing, loop_enabled, position, queue, updated_at")
    .single();

  if (!inserted.error) return inserted;

  // Another listener may have created the same room between select and insert.
  return supabase
    .from("party_rooms")
    .select("code, song, is_playing, loop_enabled, position, queue, updated_at")
    .eq("code", code)
    .single();
}

async function activeMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  code: string
) {
  const cutoff = new Date(Date.now() - 15_000).toISOString();
  const { data } = await supabase
    .from("party_members")
    .select("user_id, display_name, last_seen")
    .eq("room_code", code)
    .gt("last_seen", cutoff)
    .order("last_seen", { ascending: false });

  return data ?? [];
}

export async function GET(request: Request) {
  const code = cleanCode(new URL(request.url).searchParams.get("code"));
  if (code.length !== 6) {
    return Response.json({ error: "A valid six-character room code is required." }, { status: 400 });
  }

  try {
    const { supabase, user } = await authenticatedRequest();
    if (!user) return Response.json({ error: "Sign in to join a party." }, { status: 401 });

    const { data: room, error } = await findOrCreateRoom(supabase, code, user.id);
    if (error || !room) {
      return Response.json(
        { error: "Party storage is not ready. Run migration 002 in Supabase." },
        { status: 503 }
      );
    }

    return Response.json(roomResponse(room, await activeMembers(supabase, code)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Could not open this listening party." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Party update is too large." }, { status: 413 });
  }

  try {
    const body = (await request.json()) as PartyPatch;
    const code = cleanCode(body.code);
    if (code.length !== 6) {
      return Response.json({ error: "A valid six-character room code is required." }, { status: 400 });
    }

    const { supabase, user } = await authenticatedRequest();
    if (!user) return Response.json({ error: "Sign in to update a party." }, { status: 401 });

    const existing = await findOrCreateRoom(supabase, code, user.id);
    if (existing.error || !existing.data) {
      return Response.json(
        { error: "Party storage is not ready. Run migration 002 in Supabase." },
        { status: 503 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", user.id)
      .single();

    await supabase.from("party_members").upsert({
      room_code: code,
      user_id: user.id,
      display_name: `@${profile?.username || profile?.display_name || "vinyl-friend"}`.slice(0, 80),
      last_seen: new Date().toISOString(),
    });

    const patch: Record<string, unknown> = {};
    if (body.song === null || isSong(body.song)) patch.song = body.song;
    if (typeof body.isPlaying === "boolean") patch.is_playing = body.isPlaying;
    if (typeof body.loop === "boolean") patch.loop_enabled = body.loop;
    if (typeof body.position === "number" && Number.isFinite(body.position)) {
      patch.position = Math.max(0, Math.min(body.position, 24 * 60 * 60));
    }
    if (Array.isArray(body.queue)) {
      patch.queue = body.queue.filter(isSong).slice(0, MAX_QUEUE_SIZE);
    }

    let room = existing.data;
    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      const updated = await supabase
        .from("party_rooms")
        .update(patch)
        .eq("code", code)
        .select("code, song, is_playing, loop_enabled, position, queue, updated_at")
        .single();
      if (updated.error || !updated.data) {
        return Response.json({ error: "Could not save the party update." }, { status: 500 });
      }
      room = updated.data;
    }

    return Response.json(roomResponse(room, await activeMembers(supabase, code)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Invalid party update." }, { status: 400 });
  }
}
