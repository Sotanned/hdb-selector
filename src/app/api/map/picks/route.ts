import { NextResponse } from "next/server";
import { fetchTownPicks } from "@/lib/mapPicks";
import { MAP_FLAT_TYPES } from "@/lib/mapTypes";
import { UpstreamError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const town = url.searchParams.get("town")?.trim();
  const requested = url.searchParams.get("flatType")?.toUpperCase();
  const flatType = (MAP_FLAT_TYPES as readonly string[]).includes(requested ?? "")
    ? requested!
    : "4 ROOM";

  if (!town) return NextResponse.json({ picks: [] });

  try {
    const picks = await fetchTownPicks(town, flatType);
    return NextResponse.json(
      { picks },
      { headers: { "cache-control": "public, max-age=900, stale-while-revalidate=3600" } },
    );
  } catch (err) {
    const message =
      err instanceof UpstreamError
        ? `Recent sales are unavailable (${err.source}).`
        : "Could not load recent sales.";
    return NextResponse.json({ picks: [], error: message }, { status: 502 });
  }
}
