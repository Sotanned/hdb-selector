import { HomeClient } from "@/components/HomeClient";

export default function HomePage() {
  return (
    <div className="py-6">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Buy the flat, not the showflat.
        </h1>
        <p className="muted mx-auto mt-3 max-w-xl text-balance leading-relaxed">
          Score any HDB block on what your household actually cares about — price, the
          commute, schools, everyday amenities, sport and the air outside your window —
          from Singapore&rsquo;s open government data.
        </p>
      </div>

      <div className="mt-8">
        <HomeClient />
      </div>
    </div>
  );
}
