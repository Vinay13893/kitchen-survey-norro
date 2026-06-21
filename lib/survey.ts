export type AnswerValue = string | string[];
export type Answers = Record<string, AnswerValue>;
export type ICPKey = 'icp1' | 'icp2' | 'icp3' | 'icp4' | 'non-core';
export type ConfidenceBand = 'high' | 'medium' | 'low';

export type ICPDetail = {
  key: ICPKey;
  label: string;
  score: number;
  reasons: string[];
};

export type ClassificationResult = {
  top: ICPDetail;
  secondary: ICPDetail | null;
  breakdown: ICPDetail[];
  confidence: ConfidenceBand;
  lifeStage: string;
  definiteBuyer: boolean;
};

export type ResponseRecord = {
  id: string;
  timestamp: string;
  answers: Answers;
  score: number;
  segment: string;
  icpKey?: ICPKey;
  icpLabel?: string;
  icpReasons?: string[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const has = (a: Answers, key: string, value: string) =>
  Array.isArray(a[key]) && (a[key] as string[]).includes(value);

const hasAny = (a: Answers, key: string, values: string[]) =>
  values.some((v) => has(a, key, v));

const str = (a: Answers, key: string) => (typeof a[key] === 'string' ? String(a[key]) : '');

const num = (a: Answers, key: string) => {
  const raw = a[key];
  if (typeof raw !== 'string') return NaN;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? NaN : n;
};

// Effective budget works for both owner and non-owner flows.
const budgetValue = (a: Answers) => str(a, 'ownerBudget') || str(a, 'prospectBudget');

// Backwards-compat: reads both new conceptCompelling and old conceptInterest field.
const conceptScore = (a: Answers) => {
  const n = num(a, 'conceptCompelling');
  return Number.isFinite(n) ? n : num(a, 'conceptInterest');
};

// ── Life stage ───────────────────────────────────────────────────────────────

function inferLifeStage(a: Answers): string {
  const ls = str(a, 'lifeStage');
  if (ls === 'Single') return 'Single';
  if (ls === 'Married / Partnered (no children)' || ls === 'Married or partnered (no children)')
    return 'Couple (no children)';
  if (ls === 'Married / Partnered (with children)' || ls === 'Married or partnered (with children)')
    return 'Family (with children)';
  if (ls === 'Single parent') return 'Single parent';
  return ls || 'Unspecified';
}

// ── Confidence & buyer signals ────────────────────────────────────────────────

function confidenceBand(topScore: number, secondScore: number): ConfidenceBand {
  const gap = topScore - secondScore;
  if (gap >= 3) return 'high';
  if (gap >= 1) return 'medium';
  return 'low';
}

function isDefiniteBuyer(a: Answers, top: ICPDetail): boolean {
  const intent = str(a, 'purchaseIntent');
  const score = conceptScore(a);
  const highIntent = intent === 'Definitely buy' || intent === 'Probably buy';
  const strongScore = Number.isFinite(score) && score >= 8;
  return highIntent && strongScore && top.key !== 'non-core';
}

// ── ICP scoring ───────────────────────────────────────────────────────────────
//
// ICP 1 — Design-Conscious Modern Kitchen Buyers   (target 58 %)
// ICP 2 — Health-Conscious Urban Professionals      (target 24 %)
// ICP 3 — Premium Family Upgraders                 (target 14 %)
// ICP 4 — Aspiring Premium Pragmatists              (target  4 %)
//
// Backwards-compat: both new option strings (e.g. 'Design', '₹20–40L') and
// old option strings (e.g. 'I optimize for design', 'Rs20-40L') are scored.

function scoreICP1(a: Answers): ICPDetail {
  let score = 0;
  const reasons: string[] = [];

  if (a.modular === 'Yes') {
    score += 3;
    reasons.push('Already has a modular kitchen');
  } else if (a.modular === 'Planning one in the next 2 years') {
    score += 2;
    reasons.push('Planning a modular kitchen upgrade');
  }

  if (a.income === '₹20–40L' || a.income === 'Rs20-40L' || a.income === '₹20-40L') {
    score += 2;
    reasons.push('Household income indicates premium buying power');
  } else if (a.income === '₹40L+' || a.income === 'Rs40L+') {
    score += 3;
    reasons.push('High household income indicates premium buying power');
  }

  const aes = num(a, 'aesthetics');
  if (Number.isFinite(aes) && aes >= 8) {
    score += 4;
    reasons.push('Rates kitchen aesthetics very highly (8+/10)');
  }

  const ls = str(a, 'lifeStage');
  if (ls === 'Married / Partnered (no children)' || ls === 'Married or partnered (no children)') {
    score += 1;
    reasons.push('Couple life-stage increases design-led upgrade likelihood');
  }

  if (has(a, 'buyStyle', 'Design') || has(a, 'buyStyle', 'I optimize for design')) {
    score += 3;
    reasons.push('Explicitly optimises for design');
  }

  if (has(a, 'buyStyle', 'Quality') || has(a, 'buyStyle', 'I optimize for quality')) {
    score += 2;
    reasons.push('Explicitly optimises for quality');
  }

  if (hasAny(a, 'premiumFor', ['Kitchen', 'Home'])) {
    score += 2;
    reasons.push('Willing to pay premium in kitchen / home categories');
  }

  if (
    a.airFryerPlace === 'On the countertop permanently' ||
    a.airFryerPlace === 'Permanently on countertop'
  ) {
    score += 1;
    reasons.push('Keeps appliances visible on the countertop');
  }

  if (hasAny(a, 'admired', ['Apple', 'Dyson', 'Dreame', 'Laifen', 'Nuuk'])) {
    score += 1;
    reasons.push('Admires design-led premium brands');
  }

  return { key: 'icp1', label: 'ICP 1 — Design-Conscious Modern Kitchen Buyers', score, reasons };
}

function scoreICP2(a: Answers): ICPDetail {
  let score = 0;
  const reasons: string[] = [];

  if (has(a, 'buyStyle', 'Health') || has(a, 'buyStyle', 'I optimize for health')) {
    score += 5;
    reasons.push('Explicitly optimises for health');
  }

  if (has(a, 'buyStyle', 'Convenience') || has(a, 'buyStyle', 'I optimize for convenience')) {
    score += 2;
    reasons.push('Values convenience in purchase decisions');
  }

  const ls = str(a, 'lifeStage');
  if (ls === 'Single') {
    score += 2;
    reasons.push('Single life-stage matches urban professional segment');
  }

  if (
    a.income === '₹10–20L' ||
    a.income === '₹20–40L' ||
    a.income === 'Rs10-20L' ||
    a.income === 'Rs20-40L'
  ) {
    score += 1;
    reasons.push('Income band aligns with urban professional segment');
  }

  const cs = conceptScore(a);
  if (Number.isFinite(cs) && cs >= 8) {
    score += 1;
    reasons.push('Strong interest in the Norro concept');
  }

  return { key: 'icp2', label: 'ICP 2 — Health-Conscious Urban Professionals', score, reasons };
}

function scoreICP3(a: Answers): ICPDetail {
  let score = 0;
  const reasons: string[] = [];

  const ls = str(a, 'lifeStage');
  if (
    ls === 'Married / Partnered (with children)' ||
    ls === 'Married or partnered (with children)' ||
    ls === 'Single parent' ||
    ls === 'Married with children'
  ) {
    score += 5;
    reasons.push('Family household profile aligns with premium family-upgrader segment');
  }

  const age = num(a, 'age');
  if (Number.isFinite(age) && age >= 32 && age <= 45) {
    score += 2;
    reasons.push('Age range matches family-upgrader core window (32–45)');
  }

  if (has(a, 'premiumFor', 'Kitchen')) {
    score += 2;
    reasons.push('Willing to pay premium in kitchen category');
  }

  if (a.modular === 'Yes') {
    score += 1;
    reasons.push('Already investing in kitchen upgrades');
  }

  if (
    a.income === '₹20–40L' ||
    a.income === '₹40L+' ||
    a.income === 'Rs20-40L' ||
    a.income === 'Rs40L+'
  ) {
    score += 1;
    reasons.push('Income supports premium family upgrade spend');
  }

  return { key: 'icp3', label: 'ICP 3 — Premium Family Upgraders', score, reasons };
}

function scoreICP4(a: Answers): ICPDetail {
  let score = 0;
  const reasons: string[] = [];

  if (a.income === '₹10–20L' || a.income === 'Rs10-20L') {
    score += 3;
    reasons.push('Aspirational premium income band');
  }

  if (has(a, 'buyStyle', 'Lowest price')) {
    score += 2;
    reasons.push('Price-aware buyer profile');
  }

  if (
    hasAny(a, 'buyStyle', ['Design', 'Quality', 'I optimize for design', 'I optimize for quality'])
  ) {
    score += 2;
    reasons.push('Still values premium design and quality');
  }

  const budget = budgetValue(a);
  if (budget === 'Under ₹5,000' || budget === '₹5,000–₹8,000') {
    score += 3;
    reasons.push('Budget preference signals value-friction despite category interest');
  }

  const cs = conceptScore(a);
  if (Number.isFinite(cs) && cs >= 7) {
    score += 1;
    reasons.push('Interested in the concept but may need a stronger value proposition');
  }

  return { key: 'icp4', label: 'ICP 4 — Aspiring Premium Pragmatists', score, reasons };
}

// ── Classification ────────────────────────────────────────────────────────────

export function classifyResponse(a: Answers): ClassificationResult {
  const raw = [scoreICP1(a), scoreICP2(a), scoreICP3(a), scoreICP4(a)];
  const sorted = [...raw].sort((l, r) => r.score - l.score);
  const topRaw = sorted[0];
  const secondary = sorted[1] || null;

  const top: ICPDetail =
    topRaw.score >= 7
      ? topRaw
      : {
          key: 'non-core',
          label: 'Non-core segment',
          score: topRaw.score,
          reasons: ['Response does not strongly match any primary ICP'],
        };

  return {
    top,
    secondary,
    breakdown: sorted,
    confidence: confidenceBand(top.score, secondary?.score ?? 0),
    lifeStage: inferLifeStage(a),
    definiteBuyer: isDefiniteBuyer(a, top),
  };
}

export function calculateICPScore(a: Answers) {
  return classifyResponse(a).top.score;
}

export const sections = ['About you', 'Air fryer discovery', 'Norro concept'];
