"use client";

import { SearchBox } from "./SearchBox";
import { SetupBanner } from "./SetupBanner";
import { ShortlistPanel } from "./ShortlistPanel";
import { WeightsPanel } from "./WeightsPanel";
import { useWeights } from "@/lib/store";

export function HomeClient() {
  const { weights, setWeights, reset, ready } = useWeights();

  return (
    <>
      <div className="mx-auto max-w-2xl">
        <SearchBox autoFocus />
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <SetupBanner />
          <ShortlistPanel />
          <HowItWorks />
        </div>
        <div className="space-y-5">
          {ready && (
            <WeightsPanel weights={weights} onChange={setWeights} onReset={reset} />
          )}
        </div>
      </div>
    </>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: "Search a block",
      body: "Any HDB address, street or postal code. Addresses come from OneMap, so a block number is enough.",
    },
    {
      title: "Read the six pillars",
      body: "Price against the town, the walk to the MRT, primary schools inside the 1 km band, hawker centres, sports halls, air quality — each scored from its own dataset.",
    },
    {
      title: "Weight it your way",
      body: "Drag the sliders. A single buyer near the CBD and a family chasing a P1 place get different answers from the same block.",
    },
    {
      title: "Shortlist and compare",
      body: "Add candidates as you go, then put them side by side to see what you would actually be trading away.",
    },
  ];

  return (
    <section className="card">
      <h2 className="mb-4 text-sm font-semibold">How this works</h2>
      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span
              aria-hidden
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-xs font-semibold"
            >
              {i + 1}
            </span>
            <div>
              <h3 className="text-sm font-medium">{s.title}</h3>
              <p className="muted mt-0.5 text-sm leading-relaxed">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
