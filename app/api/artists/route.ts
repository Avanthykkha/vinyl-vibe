import { NextRequest, NextResponse } from "next/server";

type DeezerArtist = {
  id?: number;
  name?: string;
  picture_xl?: string;
  picture_big?: string;
  picture_medium?: string;
  nb_fan?: number;
};

function hasProfilePicture(artist: DeezerArtist) {
  const picture =
    artist.picture_xl || artist.picture_big || artist.picture_medium || "";
  return Boolean(picture) && !picture.includes("d41d8cd98f00b204e9800998ecf8427e");
}

export async function GET(request: NextRequest) {
  const names = request.nextUrl.searchParams
    .getAll("name")
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 20);

  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        const response = await fetch(
          `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`,
          { next: { revalidate: 604800 } }
        );

        if (!response.ok) return [name, null] as const;

        const data = await response.json();
        const artists = (data.data || []) as DeezerArtist[];
        const rankedArtists = artists
          .filter(hasProfilePicture)
          .sort((left, right) => (right.nb_fan || 0) - (left.nb_fan || 0));
        const exactArtist = rankedArtists.find(
          (artist) => artist.name?.toLowerCase() === name.toLowerCase()
        );
        const artist = exactArtist || rankedArtists[0];
        const image =
          artist?.picture_xl ||
          artist?.picture_big ||
          artist?.picture_medium ||
          null;

        return [
          name,
          image
            ? {
                image,
                artistId: artist?.id || null,
                channelTitle: artist?.name || name,
                source: "Deezer artist profile",
              }
            : null,
        ] as const;
      } catch {
        return [name, null] as const;
      }
    })
  );

  return NextResponse.json({ artists: Object.fromEntries(entries) });
}
