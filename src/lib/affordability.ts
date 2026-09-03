/**
 * Housing-finance rules for Singapore HDB purchases.
 *
 * IMPORTANT: every number in `POLICY` is a government policy parameter that
 * changes without notice (LTV limits, EHG ceilings and stamp-duty bands have
 * all moved in recent years). They are gathered here, dated, and surfaced in
 * the UI's Assumptions panel so a stale figure is visible rather than buried in
 * a formula. Confirm against hdb.gov.sg and iras.gov.sg before acting on any
 * output of this module.
 */
export const POLICY = {
  lastReviewed: "2025-02",
  reference: "https://www.hdb.gov.sg/residential/buying-a-flat",

  hdbLoan: {
    /** Concessionary rate, pegged 0.1% above the CPF Ordinary Account rate. */
    interestRate: 0.026,
    maxLtv: 0.75,
    maxTenureYears: 25,
    /** Minimum cash/CPF downpayment as a share of price. */
    downpaymentShare: 0.25,
    /** An HDB loan downpayment may be paid entirely from CPF OA. */
    minCashShare: 0,
  },
  bankLoan: {
    /** Illustrative; shop around. Used only for the monthly-payment estimate. */
    interestRate: 0.032,
    maxLtv: 0.75,
    maxTenureYears: 30,
    downpaymentShare: 0.25,
    /** At least 5% of the price must be cash under a bank loan. */
    minCashShare: 0.05,
  },

  /** Mortgage Servicing Ratio — HDB flats only. Share of gross monthly income. */
  msr: 0.3,
  /** Total Debt Servicing Ratio, across all debt obligations. */
  tdsr: 0.55,
  /**
   * MAS medium-term interest rate used to stress-test MSR/TDSR. Loans are sized
   * against this rate, not the rate actually offered.
   */
  stressRate: 0.04,

  /** Buyer's Stamp Duty bands for residential property (marginal rates). */
  bsdBands: [
    { upTo: 180_000, rate: 0.01 },
    { upTo: 360_000, rate: 0.02 },
    { upTo: 1_000_000, rate: 0.03 },
    { upTo: 1_500_000, rate: 0.04 },
    { upTo: 3_000_000, rate: 0.05 },
    { upTo: Infinity, rate: 0.06 },
  ],

  grants: {
    /** CPF Housing Grant (families), by flat size. */
    familyGrantSmall: 80_000, // 4-room or smaller
    familyGrantLarge: 50_000, // 5-room or larger
    /** Enhanced CPF Housing Grant ceiling; tapers with household income. */
    ehgMax: 120_000,
    /** EHG tapers to zero at this household income. */
    ehgIncomeCeiling: 9_000,
    /** Proximity Housing Grant. */
    phgLiveWith: 30_000,
    phgLiveNear: 20_000,
    /** Household income ceiling for the family CPF Housing Grant. */
    familyIncomeCeiling: 14_000,
  },
} as const;

export type LoanType = "hdb" | "bank";

/** Standard amortising monthly repayment. */
export function monthlyPayment(
  principal: number,
  annualRate: number,
  years: number,
): number {
  if (principal <= 0 || years <= 0) return 0;
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Largest principal whose stressed repayment stays within a monthly budget. */
export function principalFromPayment(
  payment: number,
  annualRate: number,
  years: number,
): number {
  if (payment <= 0 || years <= 0) return 0;
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return payment * n;
  return (payment * (1 - Math.pow(1 + r, -n))) / r;
}

export function buyerStampDuty(price: number): number {
  let remaining = price;
  let previousCap = 0;
  let duty = 0;
  for (const band of POLICY.bsdBands) {
    if (remaining <= 0) break;
    const width = band.upTo - previousCap;
    const taxable = Math.min(remaining, width);
    duty += taxable * band.rate;
    remaining -= taxable;
    previousCap = band.upTo;
  }
  return Math.round(duty);
}

export type AffordabilityInput = {
  /** Gross household monthly income, before CPF. */
  monthlyIncome: number;
  /** Existing monthly debt repayments (car, personal, other mortgages). */
  monthlyDebts: number;
  /** CPF Ordinary Account balance available for the purchase. */
  cpfOa: number;
  /** Cash savings available for the purchase. */
  cash: number;
  loanType: LoanType;
  tenureYears: number;
  /** Age of the youngest buyer — caps tenure at 65 for an HDB loan. */
  age?: number;
};

export type AffordabilityResult = {
  /** Loan ceiling set by MSR / TDSR at the stress rate. */
  maxLoanFromIncome: number;
  /** Loan ceiling set by the LTV limit, given the buyer's own funds. */
  maxLoanFromFunds: number;
  maxLoan: number;
  /** Highest purchase price that satisfies both ceilings and the cash rules. */
  maxPrice: number;
  tenureYears: number;
  /** Repayment at the rate actually charged (not the stress rate). */
  monthlyRepayment: number;
  bindingConstraint: "income" | "savings" | "tenure";
  notes: string[];
};

export function assessAffordability(input: AffordabilityInput): AffordabilityResult {
  const rules = input.loanType === "hdb" ? POLICY.hdbLoan : POLICY.bankLoan;
  const notes: string[] = [];

  let tenure = Math.min(input.tenureYears, rules.maxTenureYears);
  if (input.loanType === "hdb" && input.age != null) {
    const toRetirement = Math.max(5, 65 - input.age);
    if (toRetirement < tenure) {
      tenure = toRetirement;
      notes.push(`Tenure capped at ${tenure} years so the loan ends by age 65.`);
    }
  }

  // MSR caps the housing loan itself; TDSR caps housing plus all other debt.
  const msrBudget = input.monthlyIncome * POLICY.msr;
  const tdsrBudget = input.monthlyIncome * POLICY.tdsr - input.monthlyDebts;
  const monthlyBudget = Math.max(0, Math.min(msrBudget, tdsrBudget));
  if (tdsrBudget < msrBudget) {
    notes.push("Existing debts make TDSR (55%) the binding limit rather than MSR (30%).");
  }

  const maxLoanFromIncome = Math.floor(
    principalFromPayment(monthlyBudget, POLICY.stressRate, tenure),
  );

  // With an LTV of L, the buyer covers (1 - L) of the price from their own
  // funds, so funds F support a price of F / (1 - L) and a loan of L/(1-L) * F.
  const ownFunds = input.cpfOa + input.cash;
  const equityShare = 1 - rules.maxLtv;
  const priceFromFunds = equityShare > 0 ? ownFunds / equityShare : Infinity;
  const maxLoanFromFunds = Math.floor(priceFromFunds * rules.maxLtv);

  let maxPriceFromCash = Infinity;
  if (rules.minCashShare > 0) {
    maxPriceFromCash = input.cash / rules.minCashShare;
    if (maxPriceFromCash < priceFromFunds) {
      notes.push(
        `A bank loan needs at least ${(rules.minCashShare * 100).toFixed(0)}% of the price in cash, which limits you before your CPF does.`,
      );
    }
  }

  const priceFromIncome =
    maxLoanFromIncome > 0 ? maxLoanFromIncome / rules.maxLtv : 0;
  const maxPrice = Math.floor(
    Math.max(0, Math.min(priceFromIncome, priceFromFunds, maxPriceFromCash)),
  );
  const maxLoan = Math.floor(Math.min(maxLoanFromIncome, maxPrice * rules.maxLtv));

  const bindingConstraint: AffordabilityResult["bindingConstraint"] =
    priceFromIncome <= Math.min(priceFromFunds, maxPriceFromCash)
      ? "income"
      : tenure < input.tenureYears
        ? "tenure"
        : "savings";

  return {
    maxLoanFromIncome,
    maxLoanFromFunds: Number.isFinite(maxLoanFromFunds) ? maxLoanFromFunds : 0,
    maxLoan,
    maxPrice,
    tenureYears: tenure,
    monthlyRepayment: Math.round(monthlyPayment(maxLoan, rules.interestRate, tenure)),
    bindingConstraint,
    notes,
  };
}

export type PurchaseCosts = {
  price: number;
  loan: number;
  downpayment: number;
  minCash: number;
  stampDuty: number;
  /** Conveyancing, valuation, HDB admin — a planning allowance, not a quote. */
  legalAndFees: number;
  cashOutlayEstimate: number;
  monthlyRepayment: number;
};

export function purchaseCosts(
  price: number,
  loanType: LoanType,
  tenureYears: number,
  grantTotal = 0,
): PurchaseCosts {
  const rules = loanType === "hdb" ? POLICY.hdbLoan : POLICY.bankLoan;
  const loan = Math.max(0, Math.round(price * rules.maxLtv));
  const downpayment = price - loan;
  const minCash = Math.round(price * rules.minCashShare);
  const stampDuty = buyerStampDuty(price);
  const legalAndFees = 3_000;

  return {
    price,
    loan,
    downpayment,
    minCash,
    stampDuty,
    legalAndFees,
    // Grants land in CPF OA and offset the downpayment, not the cash portion.
    cashOutlayEstimate: Math.max(
      minCash,
      Math.round(downpayment + stampDuty + legalAndFees - grantTotal),
    ),
    monthlyRepayment: Math.round(monthlyPayment(loan, rules.interestRate, tenureYears)),
  };
}

export type GrantInput = {
  monthlyIncome: number;
  firstTimer: boolean;
  /** 4-room or smaller qualifies for the larger family grant. */
  flatType: string;
  livesWithParents: boolean;
  livesNearParents: boolean;
};

export type GrantEstimate = {
  familyGrant: number;
  ehg: number;
  proximityGrant: number;
  total: number;
  caveats: string[];
};

/**
 * Rough resale-grant estimate for a first-timer family. Real eligibility also
 * depends on citizenship, employment history, prior housing subsidies and
 * whether the flat has enough lease to cover the buyers to age 95 — none of
 * which this app knows.
 */
export function estimateGrants(input: GrantInput): GrantEstimate {
  const g = POLICY.grants;
  const caveats: string[] = [];

  if (!input.firstTimer) {
    return {
      familyGrant: 0,
      ehg: 0,
      proximityGrant: 0,
      total: 0,
      caveats: ["Second-timers are not eligible for the grants modelled here."],
    };
  }

  const smallFlat = /^(1|2|3|4)[ -]?ROOM/i.test(input.flatType.trim());
  const familyGrant =
    input.monthlyIncome <= g.familyIncomeCeiling
      ? smallFlat
        ? g.familyGrantSmall
        : g.familyGrantLarge
      : 0;
  if (familyGrant === 0 && input.monthlyIncome > g.familyIncomeCeiling) {
    caveats.push(
      `Household income above $${g.familyIncomeCeiling.toLocaleString()} rules out the CPF Housing Grant.`,
    );
  }

  // EHG tapers in $500 income steps; approximated linearly here.
  const ehg =
    input.monthlyIncome <= g.ehgIncomeCeiling
      ? Math.round(
          (g.ehgMax * (1 - input.monthlyIncome / g.ehgIncomeCeiling)) / 5_000,
        ) * 5_000
      : 0;
  if (ehg > 0) {
    caveats.push("EHG is paid in $5,000 steps against income bands — treat this as approximate.");
  }

  const proximityGrant = input.livesWithParents
    ? g.phgLiveWith
    : input.livesNearParents
      ? g.phgLiveNear
      : 0;

  return {
    familyGrant,
    ehg,
    proximityGrant,
    total: familyGrant + ehg + proximityGrant,
    caveats,
  };
}
