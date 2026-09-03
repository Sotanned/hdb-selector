import { NextResponse } from "next/server";
import { buildReport } from "@/lib/report";
import { isInSingapore } from "@/lib/geo";

export const runtime = "nodejs";
// The report mixes monthly resale data with 10-minute NEA readings; a short
// shared cache keeps repeat views instant without going stale on air quality.
export const revalidate = 0;

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required." }, { status: 400 });
  }
  if (!isInSingapore({ lat, lng })) {
    return NextResponse.json(
      { error: "That location is outside Singapore." },
      { status: 400 },
    );
  }

  try {
    const report = await buildReport({
      lat,
      lng,
      address: p.get("address") ?? "Selected location",
      block: p.get("block"),
      street: p.get("street"),
      postal: p.get("postal"),
      flatType: p.get("flatType") ?? undefined,
    });
    return NextResponse.json(report, {
      headers: { "cache-control": "public, max-age=300, stale-while-revalidate=1800" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not build the report." },
      { status: 500 },
    );
  }
}
