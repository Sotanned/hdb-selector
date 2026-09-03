"use client";

import { useMemo, useState } from "react";
import {
  assessAffordability,
  estimateGrants,
  POLICY,
  purchaseCosts,
  type LoanType,
} from "@/lib/affordability";
import { money } from "@/lib/format";

const STORAGE_KEY = "hdb-selector:finance:v1";

type Inputs = {
  monthlyIncome: number;
  monthlyDebts: number;
  cpfOa: number;
  cash: number;
  age: number;
  tenureYears: number;
  loanType: LoanType;
  firstTimer: boolean;
  livesNearParents: boolean;
};

const DEFAULTS: Inputs = {
  monthlyIncome: 8_000,
  monthlyDebts: 0,
  cpfOa: 60_000,
  cash: 40_000,
  age: 32,
  tenureYears: 25,
  loanType: "hdb",
  firstTimer: true,
  livesNearParents: false,
};

function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min = 0,
  step = 1000,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number;
  hint?: string;
}) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-1.5">
        {prefix && <span className="muted text-sm">{prefix}</span>}
        <input
          id={id}
          type="number"
          className="field tabular-nums"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && <span className="muted text-sm">{suffix}</span>}
      </div>
      {hint && <p className="muted mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}

/**
 * Turns a household's numbers into the two limits that actually decide what
 * they can buy: what the servicing ratios allow, and what their own funds
 * allow. Everything stays in the browser.
 */
export function AffordabilityCalculator({
  askingPrice,
  flatType,
}: {
  askingPrice: number | null;
  flatType: string | null;
}) {
  const [inputs, setInputs] = useState<Inputs>(() => {
    if (typeof window === "undefined") return DEFAULTS;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });
  const [showAssumptions, setShowAssumptions] = useState(false);

  const set = <K extends keyof Inputs>(key: K, value: Inputs[K]) => {
    const next = { ...inputs, [key]: value };
    setInputs(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not persisting is harmless; the numbers are still live on screen.
    }
  };

  const result = useMemo(() => assessAffordability(inputs), [inputs]);

  const grants = useMemo(
    () =>
      estimateGrants({
        monthlyIncome: inputs.monthlyIncome,
        firstTimer: inputs.firstTimer,
        flatType: flatType ?? "4 ROOM",
        livesWithParents: false,
        livesNearParents: inputs.livesNearParents,
      }),
    [inputs.monthlyIncome, inputs.firstTimer, inputs.livesNearParents, flatType],
  );

  const costs = useMemo(
    () =>
      askingPrice
        ? purchaseCosts(askingPrice, inputs.loanType, result.tenureYears, grants.total)
        : null,
    [askingPrice, inputs.loanType, result.tenureYears, grants.total],
  );

  const affordsThisFlat = askingPrice != null && result.maxPrice >= askingPrice;

  return (
    <section className="card">
      <h2 className="text-sm font-semibold">Can you afford it?</h2>
      <p className="muted mt-1 text-sm">
        Nothing here is sent anywhere — it is computed in your browser and saved only on
        this device.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Household income / month"
          prefix="$"
          value={inputs.monthlyIncome}
          onChange={(v) => set("monthlyIncome", v)}
          step={500}
        />
        <Field
          label="Other monthly debt repayments"
          prefix="$"
          value={inputs.monthlyDebts}
          onChange={(v) => set("monthlyDebts", v)}
          step={100}
          hint="Car, personal and study loans."
        />
        <Field
          label="CPF Ordinary Account"
          prefix="$"
          value={inputs.cpfOa}
          onChange={(v) => set("cpfOa", v)}
          step={5000}
        />
        <Field
          label="Cash savings for this purchase"
          prefix="$"
          value={inputs.cash}
          onChange={(v) => set("cash", v)}
          step={5000}
        />
        <Field
          label="Age of the younger buyer"
          value={inputs.age}
          onChange={(v) => set("age", v)}
          step={1}
          min={21}
        />
        <Field
          label="Loan tenure"
          value={inputs.tenureYears}
          onChange={(v) => set("tenureYears", v)}
          step={1}
          min={5}
          suffix="years"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Loan type</legend>
          {(["hdb", "bank"] as const).map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="loanType"
                checked={inputs.loanType === t}
                onChange={() => set("loanType", t)}
              />
              <span>{t === "hdb" ? "HDB loan" : "Bank loan"}</span>
            </label>
          ))}
        </fieldset>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={inputs.firstTimer}
            onChange={(e) => set("firstTimer", e.target.checked)}
          />
          <span>First-timer household</span>
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={inputs.livesNearParents}
            onChange={(e) => set("livesNearParents", e.target.checked)}
          />
          <span>Within 4 km of parents</span>
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Highest price you can support"
          value={money(result.maxPrice)}
          emphasis
          note={
            result.bindingConstraint === "income"
              ? "Limited by the servicing ratios."
              : result.bindingConstraint === "tenure"
                ? "Limited by the shortened tenure."
                : "Limited by your CPF and cash."
          }
        />
        <Stat
          label="Maximum loan"
          value={money(result.maxLoan)}
          note={`${result.tenureYears} years at ${(
            (inputs.loanType === "hdb" ? POLICY.hdbLoan : POLICY.bankLoan).interestRate * 100
          ).toFixed(1)}%`}
        />
        <Stat
          label="Monthly repayment at that loan"
          value={money(result.monthlyRepayment)}
          note={`${((result.monthlyRepayment / Math.max(inputs.monthlyIncome, 1)) * 100).toFixed(0)}% of gross income`}
        />
      </div>

      {grants.total > 0 && (
        <p className="mt-3 text-sm">
          Estimated grants: <strong className="tabular-nums">{money(grants.total)}</strong>{" "}
          <span className="muted">
            (CPF Housing {money(grants.familyGrant)} · EHG {money(grants.ehg)}
            {grants.proximityGrant ? ` · Proximity ${money(grants.proximityGrant)}` : ""})
          </span>
        </p>
      )}

      {costs && (
        <div className="mt-5 rounded-xl border border-[var(--border)] p-4">
          <h3 className="text-sm font-medium">
            If you paid the recent median of {money(costs.price)}
            {affordsThisFlat ? (
              <span className="ml-2 text-xs font-normal" style={{ color: "var(--good)" }}>
                within your limit
              </span>
            ) : (
              <span className="ml-2 text-xs font-normal" style={{ color: "var(--poor)" }}>
                {money(costs.price - result.maxPrice)} above your limit
              </span>
            )}
          </h3>
          <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <Row label="Loan" value={money(costs.loan)} />
            <Row label="Downpayment (CPF or cash)" value={money(costs.downpayment)} />
            <Row label="Buyer's stamp duty" value={money(costs.stampDuty)} />
            <Row label="Legal, valuation and admin (allowance)" value={money(costs.legalAndFees)} />
            <Row label="Monthly repayment" value={money(costs.monthlyRepayment)} />
            <Row
              label="Upfront after grants"
              value={money(costs.cashOutlayEstimate)}
              strong
            />
          </dl>
        </div>
      )}

      {(result.notes.length > 0 || grants.caveats.length > 0) && (
        <ul className="muted mt-3 space-y-1 text-xs">
          {[...result.notes, ...grants.caveats].map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setShowAssumptions((v) => !v)}
        className="muted mt-3 text-xs underline underline-offset-2 hover:text-[var(--text)]"
      >
        {showAssumptions ? "Hide assumptions" : "Show the assumptions behind these numbers"}
      </button>

      {showAssumptions && (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-xs leading-relaxed">
          <p className="font-medium">
            Policy parameters last reviewed {POLICY.lastReviewed}. Verify before you commit
            to anything.
          </p>
          <ul className="mt-2 space-y-1">
            <li>
              Loan-to-value ceiling {(POLICY.hdbLoan.maxLtv * 100).toFixed(0)}% (HDB loan) and{" "}
              {(POLICY.bankLoan.maxLtv * 100).toFixed(0)}% (bank loan).
            </li>
            <li>
              MSR {(POLICY.msr * 100).toFixed(0)}% and TDSR {(POLICY.tdsr * 100).toFixed(0)}% of
              gross income, both stress-tested at {(POLICY.stressRate * 100).toFixed(1)}%.
            </li>
            <li>
              HDB concessionary rate {(POLICY.hdbLoan.interestRate * 100).toFixed(1)}%; the bank
              rate shown is illustrative only.
            </li>
            <li>
              Grants assume a first-timer family that meets the citizenship, employment and
              lease-coverage conditions. Actual eligibility is decided by HDB.
            </li>
            <li>
              Excluded: renovation, agent commission, HDB resale levy, the Enhanced Contra
              Facility, and any cash-over-valuation.
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  note,
  emphasis,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-3">
      <div className="muted text-xs">{label}</div>
      <div
        className={`mt-0.5 font-semibold tabular-nums ${emphasis ? "text-2xl" : "text-lg"}`}
      >
        {value}
      </div>
      {note && <div className="muted mt-0.5 text-xs">{note}</div>}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-[var(--border)] pb-1">
      <dt className={strong ? "font-medium" : "muted"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}
