import { NextResponse } from "next/server";
import { searchAddress } from "@/lib/onemap";
import { UpstreamError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const results = await searchAddress(q);
    return NextResponse.json(
      { results },
      { headers: { "cache-control": "public, max-age=300" } },
    );
  } catch (err) {
    const message =
      err instanceof UpstreamError
        ? `Address search is unavailable (${err.source}).`
        : "Address search failed.";
    return NextResponse.json({ results: [], error: message }, { status: 502 });
  }
}
