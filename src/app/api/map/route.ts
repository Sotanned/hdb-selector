import { NextResponse } from "next/server";
import { buildMapGrid } from "@/lib/mapGrid";
import { MAP_FLAT_TYPES } from "@/lib/mapTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("flatType")?.toUpperCase();
  const flatType = (MAP_FLAT_TYPES as readonly string[]).includes(requested ?? "")
    ? requested!
    : "4 ROOM";

  try {
    const grid = await buildMapGrid(flatType);
    return NextResponse.json(grid, {
      headers: { "cache-control": "public, max-age=900, stale-while-revalidate=3600" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not build the map." },
      { status: 500 },
    );
  }
}
