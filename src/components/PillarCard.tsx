import type { PillarScore } from "@/lib/types";
import { PILLARS } from "@/lib/types";
import { PillarFactors, ScoreDial } from "./Score";

const META = new Map(PILLARS.map((p) => [p.id, p]));

export function PillarCard({ pillar }: { pillar: PillarScore }) {
  const meta = META.get(pillar.pillar);
  return (
    <section className="card">
      <div className="flex items-start gap-4">
        <ScoreDial score={pillar.score} size={72} label={meta?.label} />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{meta?.label ?? pillar.pillar}</h2>
          <p className="muted mt-1 text-sm leading-relaxed">{pillar.summary}</p>
        </div>
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <PillarFactors pillar={pillar} />
      </div>
    </section>
  );
}
