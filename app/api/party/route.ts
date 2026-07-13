type Song = {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: Record<string, { url: string } | undefined>;
  };
};

type PartyRoom = {
  code: string;
  song: Song | null;
  isPlaying: boolean;
  loop: boolean;
  position: number;
  updatedAt: number;
  queue: Song[];
  members: Record<string, { name: string; seenAt: number }>;
};

declare global {
  var vinylPartyRooms: Map<string, PartyRoom> | undefined;
}

const rooms = globalThis.vinylPartyRooms ?? new Map<string, PartyRoom>();
globalThis.vinylPartyRooms = rooms;

function cleanCode(value: string | null) {
  return (value ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();
}

function getRoom(code: string) {
  const existing = rooms.get(code);
  if (existing) return existing;

  const room: PartyRoom = {
    code,
    song: null,
    isPlaying: false,
    loop: false,
    position: 0,
    updatedAt: Date.now(),
    queue: [],
    members: {},
  };
  rooms.set(code, room);
  return room;
}

export async function GET(request: Request) {
  const code = cleanCode(new URL(request.url).searchParams.get("code"));
  if (!code) return Response.json({ error: "Room code required." }, { status: 400 });

  const room = getRoom(code);
  const now = Date.now();
  room.members = Object.fromEntries(
    Object.entries(room.members).filter(([, member]) => now - member.seenAt < 15_000)
  );

  const livePosition = room.isPlaying
    ? room.position + (now - room.updatedAt) / 1000
    : room.position;

  return Response.json({ ...room, position: livePosition });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<PartyRoom> & {
    memberId?: string;
    memberName?: string;
  };
  const code = cleanCode(body.code ?? "");
  if (!code) return Response.json({ error: "Room code required." }, { status: 400 });

  const room = getRoom(code);
  if (body.song !== undefined) room.song = body.song;
  if (typeof body.isPlaying === "boolean") room.isPlaying = body.isPlaying;
  if (typeof body.loop === "boolean") room.loop = body.loop;
  if (typeof body.position === "number" && Number.isFinite(body.position)) {
    room.position = Math.max(0, body.position);
  }
  if (Array.isArray(body.queue)) room.queue = body.queue;
  if (body.memberId) {
    room.members[body.memberId] = {
      name: body.memberName?.trim() || "Vinyl friend",
      seenAt: Date.now(),
    };
  }
  room.updatedAt = Date.now();

  return Response.json(room);
}
