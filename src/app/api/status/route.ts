import { NextResponse } from "next/server";
import { CATEGORY_LABELS, loadCategory, seededCategories } from "@/lib/amenities";
import { hasOneMapCredentials } from "@/lib/onemap";
import type { AmenityCategory } from "@/lib/types";

export const runtime = "nodejs";

/** What the app can and cannot currently answer — used by the setup banner. */
export async function GET() {
  const seeded = await seededCategories();
  const all = Object.keys(CATEGORY_LABELS) as AmenityCategory[];

  const datasets = await Promise.all(
    all.map(async (category) => {
      const file = seeded.includes(category) ? await loadCategory(category) : null;
      return {
        category,
        label: CATEGORY_LABELS[category],
        seeded: file != null,
        count: file?.points.length ?? 0,
        source: file?.source ?? null,
        fetchedAt: file?.fetchedAt ?? null,
      };
    }),
  );

  return NextResponse.json({
    datasets,
    seededCount: datasets.filter((d) => d.seeded).length,
    totalCount: datasets.length,
    oneMapCredentials: hasOneMapCredentials(),
    ltaAccountKey: Boolean(process.env.LTA_ACCOUNT_KEY),
  });
}
