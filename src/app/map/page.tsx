import { MapClient } from "@/components/MapClient";

export const metadata = {
  title: "Where should you look? — HDB Selector",
  description:
    "A map of Singapore shaded by how well each neighbourhood matches your priorities.",
};

export default function MapPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Where should you look?</h1>
        <p className="muted mt-1 max-w-2xl text-sm leading-relaxed">
          Every inhabited 400 m square in Singapore, scored on the same six pillars as a
          single block and shaded by how well it matches your weighting. Drag a slider and
          the island repaints.
        </p>
      </header>
      <MapClient />
    </div>
  );
}
