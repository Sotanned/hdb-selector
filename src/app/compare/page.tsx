import { CompareClient } from "@/components/CompareClient";

export const metadata = { title: "Compare your shortlist — HDB Selector" };

export default function ComparePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Your shortlist</h1>
        <p className="muted mt-1 text-sm">
          The same six pillars, side by side, weighted by what you said matters.
        </p>
      </header>
      <CompareClient />
    </div>
  );
}
