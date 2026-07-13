import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SHORT_FORM_PATTERN =
  /#shorts?\b|\bshorts?\b|\bfancam\b|\bsoundcheck\b|\bweverse live\b|\bfan edit\b/i;

function durationInSeconds(duration = "") {
  const match = duration.match(
    /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
  );

  if (!match) return 0;

  return (
    Number(match[1] || 0) * 3600 +
    Number(match[2] || 0) * 60 +
    Number(match[3] || 0)
  );
}

const STARTER_CATALOG = [
  ["gdZLi9oWNZg", "BTS (방탄소년단) 'Dynamite' Official MV", "BANGTANTV", ["bts"]],
  ["WMweEpGlu_U", "BTS (방탄소년단) 'Butter' Official MV", "HYBE LABELS", ["bts"]],
  ["XsX3ATc3FbA", "BTS (방탄소년단) 'Boy With Luv' Official MV", "HYBE LABELS", ["bts"]],
  ["7C2z4GqqS5E", "BTS (방탄소년단) 'FAKE LOVE' Official MV", "HYBE LABELS", ["bts"]],
  ["tvTRZJ-4EyI", "Kendrick Lamar - HUMBLE.", "Kendrick Lamar", ["kendrick lamar"]],
  ["H58vbez_m4E", "Kendrick Lamar - Not Like Us", "Kendrick Lamar", ["kendrick lamar"]],
  ["NLZRYQMLDW4", "Kendrick Lamar - DNA.", "Kendrick Lamar", ["kendrick lamar"]],
  ["Z-48u_uWMHY", "Kendrick Lamar - Alright", "Kendrick Lamar", ["kendrick lamar"]],
  ["HmAsUQEFYGI", "Tyler, The Creator - EARFQUAKE", "Tyler, The Creator", ["tyler, the creator", "tyler the creator"]],
  ["TGgcC5xg9YI", "Tyler, The Creator - SEE YOU AGAIN", "Tyler, The Creator", ["tyler, the creator", "tyler the creator"]],
  ["NJea386275c", "Tyler, The Creator - WUSYANAME", "Tyler, The Creator", ["tyler, the creator", "tyler the creator"]],
  ["MSRcC626prw", "SZA - Kill Bill", "SZA", ["sza"]],
  ["LDY_XyxBu8A", "SZA - Snooze", "SZA", ["sza"]],
  ["2p3zZoraK9g", "SZA - Good Days", "SZA", ["sza"]],
  ["b1kbLwvqugk", "Taylor Swift - Anti-Hero", "Taylor Swift", ["taylor swift"]],
  ["e-ORhEE9VVg", "Taylor Swift - Blank Space", "Taylor Swift", ["taylor swift"]],
  ["nfWlot6h_JM", "Taylor Swift - Shake It Off", "Taylor Swift", ["taylor swift"]],
  ["4NRXx6U8ABQ", "The Weeknd - Blinding Lights", "The Weeknd", ["the weeknd"]],
  ["kPa7bsKwL-c", "Lady Gaga, Bruno Mars - Die With A Smile", "Bruno Mars", ["bruno mars"]],
  ["KNtJGQkC-WI", "Ariana Grande - we can't be friends", "Ariana Grande", ["ariana grande"]],
  ["TdrL3QxjyVw", "Lana Del Rey - Summertime Sadness", "Lana Del Rey", ["lana del rey"]],
] as const;

function starterSongs(query: string) {
  const normalizedQuery = query.toLowerCase();
  const matching = STARTER_CATALOG.filter((entry) =>
    entry[3].some((artist) => normalizedQuery.includes(artist))
  );
  const ordered = [
    ...matching,
    ...STARTER_CATALOG.filter((entry) => !matching.includes(entry)),
  ].slice(0, 12);

  return ordered.map(([videoId, title, channelTitle]) => ({
    id: { videoId },
    snippet: {
      title,
      channelTitle,
      thumbnails: {
        high: {
          url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        },
        medium: {
          url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        },
      },
    },
  }));
}

type CachedSearch = {
  expiresAt: number;
  payload: {
    items: unknown[];
    nextPageToken: string | null;
  };
};

declare global {
  var vinylYouTubeSearchCache: Map<string, CachedSearch> | undefined;
}

const searchCache =
  globalThis.vinylYouTubeSearchCache ?? new Map<string, CachedSearch>();
globalThis.vinylYouTubeSearchCache = searchCache;

function fallbackSongs(query: string) {
  return starterSongs(query);
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const searchParams = request.nextUrl.searchParams;
    const query =
      searchParams.get("q")?.trim() ||
      "Sai Abhyankkar official music";
    const pageToken =
      searchParams.get("pageToken")?.trim() || "";
    const cacheKey = `${query.toLowerCase().replace(/\s+/g, " ")}|${pageToken}`;
    const cached = searchCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ ...cached.payload, cached: true });
    }

    if (!apiKey) {
      return NextResponse.json({
        items: fallbackSongs(query),
        nextPageToken: null,
        fallback: true,
        error: "YouTube search is not configured on the server.",
      });
    }
    const musicQuery = /\b(music|song|official|audio|lyrics?|mv)\b/i.test(
      query
    )
      ? query
      : `${query} official music`;

    const youtubeParams = new URLSearchParams({
      part: "snippet",
      q: musicQuery,
      key: apiKey,
      type: "video",
      maxResults: "25",
      videoEmbeddable: "true",
      videoSyndicated: "true",
      videoCategoryId: "10",
      safeSearch: "moderate",
      regionCode: "IN",
      relevanceLanguage: "en",
    });

    if (pageToken) {
      youtubeParams.set("pageToken", pageToken);
    }

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${youtubeParams.toString()}`,
      {
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "YouTube API error:",
        JSON.stringify(data, null, 2)
      );

      return NextResponse.json({
        items: fallbackSongs(query),
        nextPageToken: null,
        fallback: true,
        error: "YouTube search quota is temporarily unavailable.",
      });
    }

    const searchItems = (data.items || []).filter(
      (item: {
        id?: {
          videoId?: string;
        };
        snippet?: {
          title?: string;
        };
      }) =>
        Boolean(item.id?.videoId) &&
        !SHORT_FORM_PATTERN.test(item.snippet?.title || "")
    );

    const videoIds = searchItems
      .map(
        (item: { id?: { videoId?: string } }) =>
          item.id?.videoId
      )
      .filter(Boolean)
      .join(",");

    let allowedVideoIds: Set<string> | null = null;

    if (videoIds) {
      const detailsParams = new URLSearchParams({
        part: "contentDetails,status",
        id: videoIds,
        key: apiKey,
      });
      const detailsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?${detailsParams.toString()}`,
        { cache: "no-store" }
      );

      if (detailsResponse.ok) {
        const detailsData = await detailsResponse.json();

        allowedVideoIds = new Set(
          (detailsData.items || [])
            .filter(
              (item: {
                id?: string;
                contentDetails?: { duration?: string };
                status?: { embeddable?: boolean };
              }) =>
                Boolean(item.id) &&
                item.status?.embeddable !== false &&
                durationInSeconds(
                  item.contentDetails?.duration
                ) >= 90
            )
            .map((item: { id: string }) => item.id)
        );
      }
    }

    const items = searchItems
      .filter(
        (item: { id?: { videoId?: string } }) =>
          !allowedVideoIds ||
          allowedVideoIds.has(item.id?.videoId || "")
      )
      .slice(0, 12);

    const payload = {
      items,
      nextPageToken:
        data.nextPageToken || null,
    };

    searchCache.set(cacheKey, {
      expiresAt: Date.now() + 30 * 60 * 1000,
      payload,
    });
    if (searchCache.size > 500) {
      const oldestKey = searchCache.keys().next().value;
      if (oldestKey) searchCache.delete(oldestKey);
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error(
      "Vinyl Vibe YouTube route error:",
      error
    );

    return NextResponse.json({
      items: fallbackSongs(
        request.nextUrl.searchParams.get("q") || ""
      ),
      nextPageToken: null,
      fallback: true,
    });
  }
}
