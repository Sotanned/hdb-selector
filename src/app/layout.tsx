import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "HDB Selector — decide where to buy, on the evidence",
  description:
    "Score any Singapore HDB block against what you actually care about: price, commute, schools, amenities, sport and environment — using open government data.",
};

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
    >
      {children}
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-SG">
      <body>
        <div className="min-h-screen">
          <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
              <Link href="/" className="mr-auto flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="grid h-8 w-8 place-items-center rounded-lg bg-accent-600 text-sm font-bold text-white"
                >
                  ⌂
                </span>
                <span className="text-[15px] font-semibold tracking-tight">
                  HDB Selector
                </span>
              </Link>
              <NavLink href="/">Search</NavLink>
              <NavLink href="/compare">Shortlist</NavLink>
              <NavLink href="/method">Method</NavLink>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

          <footer className="mx-auto max-w-6xl px-4 pb-12 pt-4 text-xs leading-relaxed text-[var(--text-muted)]">
            <p>
              Built on open data from data.gov.sg, HDB, MOE, NEA, LTA and OneMap. Figures
              are indicative and can lag the source. This is not financial, legal or
              property advice — verify anything you would act on with HDB, IRAS and your
              bank.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
