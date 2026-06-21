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

export type HouseholdShareWeights = {
  lifeStage: number;
  livingSetup: number;
  householdAttributes: number;
};

export const DEFAULT_HOUSEHOLD_SHARE_WEIGHTS: HouseholdShareWeights = {
  lifeStage: 50,
  livingSetup: 25,
  householdAttributes: 25,
};

export const HOUSEHOLD_SHARE_WEIGHTS_STORAGE_KEY = 'kitchen-study-household-share-weights-v1';

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

const has = (a: Answers, key: string, value: string) =>
  Array.isArray(a[key]) && (a[key] as string[]).includes(value);

const hasAny = (a: Answers, key: string, values: string[]) =>
  values.some((value) => has(a, key, value));

const hasLike = (a: Answers, key: string, terms: string[]) =>
  Array.isArray(a[key]) &&
  (a[key] as string[]).some((entry) => {
    const normalized = String(entry).toLowerCase();
    return terms.some((term) => normalized.includes(term.toLowerCase()));
  });

const asString = (a: Answers, key: string) => (typeof a[key] === 'string' ? String(a[key]) : '');

const lifeStageValue = (a: Answers) => asString(a, 'lifeStage') || asString(a, 'household');
const livingArrangementValue = (a: Answers) => asString(a, 'livingSetupSingle') || asString(a, 'livingSetupFamily') || asString(a, 'livingArrangement');

function normalizedWeights(input?: Partial<HouseholdShareWeights>): HouseholdShareWeights {
  const fallback = DEFAULT_HOUSEHOLD_SHARE_WEIGHTS;
  const raw = {
    lifeStage: Number.isFinite(input?.lifeStage) ? Math.max(0, Number(input?.lifeStage)) : fallback.lifeStage,
    livingSetup: Number.isFinite(input?.livingSetup) ? Math.max(0, Number(input?.livingSetup)) : fallback.livingSetup,
    householdAttributes: Number.isFinite(input?.householdAttributes)
      ? Math.max(0, Number(input?.householdAttributes))
      : fallback.householdAttributes,
  };

  const total = raw.lifeStage + raw.livingSetup + raw.householdAttributes;
  if (!total) return fallback;

  return {
    lifeStage: (raw.lifeStage / total) * 100,
    livingSetup: (raw.livingSetup / total) * 100,
    householdAttributes: (raw.householdAttributes / total) * 100,
  };
}

function householdWeightedBonus(a: Answers, icp: ICPKey, weights: HouseholdShareWeights) {
  let lifeSignal = 0;
  let livingSignal = 0;
  let attributeSignal = 0;

  const lifeStage = lifeStageValue(a);
  const living = livingArrangementValue(a);

  if (icp === 'icp1') {
    if (lifeStage === 'Married or partnered (no children)' || lifeStage === 'Couple, no children') lifeSignal = 1;
    if (living.includes('without parents') || living.includes('independently')) livingSignal = 1;
    if (has(a, 'householdAttributes', 'Have pets')) attributeSignal = 1;
  }

  if (icp === 'icp2') {
    if (lifeStage === 'Single' || lifeStage === 'In a relationship (not married)') lifeSignal = 1;
    if (living.includes('alone') || living.includes('roommates') || living.includes('flatmates')) livingSignal = 1;
    if (!hasAny(a, 'householdAttributes', ['Elderly parents at home', 'Domestic help/cook support'])) attributeSignal = 1;
  }

  if (icp === 'icp3') {
    if (lifeStage === 'Married or partnered (with children)' || lifeStage === 'Single parent' || lifeStage === 'Married with children') {
      lifeSignal = 1;
    }
    if (living.includes('parents') || living.includes('extended family')) livingSignal = 1;
    if (
      hasAny(a, 'childrenAgeBands', ['Children under 5', 'Children age 5-12', 'Teenagers at home']) ||
      has(a, 'householdAttributes', 'Elderly parents at home')
    ) {
      attributeSignal = 1;
    }
  }

  const weighted =
    (lifeSignal * weights.lifeStage + livingSignal * weights.livingSetup + attributeSignal * weights.householdAttributes) / 100;

  // Keep household share impactful but bounded so behavior, usage and value signals still dominate.
  return Math.round(weighted * 20) / 10;
}

const asNumber = (a: Answers, key: string) => {
  const raw = a[key];
  if (typeof raw !== 'string') {
    return NaN;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
};

function inferLifeStage(a: Answers) {
  const lifeStage = lifeStageValue(a);
  const livingArrangement = livingArrangementValue(a);
  if (lifeStage === 'Single') return 'Single';
  if (lifeStage === 'In a relationship (not married)') return 'Couple (not married)';
  if (lifeStage === 'Married or partnered (no children)' || lifeStage === 'Couple, no children') return 'Couple (no children)';
  if (lifeStage === 'Married or partnered (with children)' || lifeStage === 'Married with children') return 'Family (children)';
  if (lifeStage === 'Single parent') return 'Single parent';
  if (livingArrangement.includes('extended family') || livingArrangement.includes('parents')) {
    return 'Family with parents/extended';
  }
  return lifeStage || 'Unspecified';
}

function confidenceBand(topScore: number, secondScore: number): ConfidenceBand {
  const gap = topScore - secondScore;
  if (gap >= 3) return 'high';
  if (gap >= 1) return 'medium';
  return 'low';
}

function isDefiniteBuyer(a: Answers, top: ICPDetail) {
  const conceptInterest = asNumber(a, 'conceptInterest');
  return Number.isFinite(conceptInterest) && conceptInterest >= 9 && top.score >= 9 && top.key !== 'non-core';
}

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

  if (a.income === 'Rs20-40L' || a.income === '₹20-40L') {
    score += 2;
    reasons.push('Household income indicates premium buying power');
  } else if (a.income === 'Rs40L+' || a.income === '₹40L+') {
    score += 3;
    reasons.push('High household income indicates premium buying power');
  }

  const aesthetics = asNumber(a, 'aesthetics');
  if (Number.isFinite(aesthetics) && aesthetics >= 8) {
    score += 4;
    reasons.push('Rates kitchen aesthetics very highly (8/10+)');
  }

  const lifeStage = lifeStageValue(a);
  if (lifeStage === 'Married or partnered (no children)' || lifeStage === 'Couple, no children') {
    score += 1;
    reasons.push('Couple life-stage increases design-led upgrade likelihood');
  }

  if (has(a, 'routine', 'Hosting friends and family')) {
    score += 2;
    reasons.push('Hosts friends/family regularly');
  }

  if (has(a, 'buyStyle', 'I optimize for design') || hasLike(a, 'buyStyle', ['design'])) {
    score += 3;
    reasons.push('Explicitly optimizes for design');
  }

  if (has(a, 'buyStyle', 'I optimize for quality') || hasLike(a, 'buyStyle', ['quality'])) {
    score += 2;
    reasons.push('Explicitly optimizes for quality');
  }

  if (hasAny(a, 'premiumFor', ['Kitchen', 'Home'])) {
    score += 2;
    reasons.push('Willing to pay premium in kitchen/home categories');
  }

  if (a.airFryerPlace === 'Permanently on countertop') {
    score += 1;
    reasons.push('Keeps appliances visible on countertop');
  }

  if (hasAny(a, 'admired', ['Apple', 'Dyson', 'Dreame', 'Laifen', 'Nuuk'])) {
    score += 1;
    reasons.push('Admires design-led premium brands');
  }

  return {
    key: 'icp1',
    label: 'ICP 1 - Design-Conscious Modern Kitchen Buyers',
    score,
    reasons,
  };
}

function scoreICP2(a: Answers): ICPDetail {
  let score = 0;
  const reasons: string[] = [];

  if (has(a, 'purchases', 'Protein supplements')) {
    score += 3;
    reasons.push('Regularly buys protein supplements');
  }

  if (hasAny(a, 'purchases', ['Healthy snacks', 'Organic foods', 'Zero-sugar products', 'Vitamins'])) {
    score += 2;
    reasons.push('Regularly buys health-oriented products');
  }

  if (a.labels === 'Always' || a.labels === 'Often') {
    score += 3;
    reasons.push('Frequently reads food labels');
  }

  if (hasAny(a, 'routine', ['Gym or fitness classes', 'Running or sports'])) {
    score += 2;
    reasons.push('Maintains an active fitness routine');
  }

  if (hasAny(a, 'routine', ['Meal prep', 'Cooking at home'])) {
    score += 2;
    reasons.push('Shows consistent healthy food-prep behavior');
  }

  if (has(a, 'buyStyle', 'I optimize for health')) {
    score += 3;
    reasons.push('Explicitly optimizes for health');
  }

  if (has(a, 'buyStyle', 'I optimize for convenience')) {
    score += 1;
    reasons.push('Values convenience in purchase decisions');
  }

  const conceptInterest = asNumber(a, 'conceptInterest');
  if (Number.isFinite(conceptInterest) && conceptInterest >= 8) {
    score += 1;
    reasons.push('Strong intent toward the concept product');
  }

  return {
    key: 'icp2',
    label: 'ICP 2 - Health-Conscious Urban Professionals',
    score,
    reasons,
  };
}

function scoreICP3(a: Answers): ICPDetail {
  let score = 0;
  const reasons: string[] = [];

  const lifeStage = lifeStageValue(a);
  const livingArrangement = livingArrangementValue(a);
  const hasChildrenSignals =
    lifeStage === 'Married or partnered (with children)' ||
    lifeStage === 'Married with children' ||
    lifeStage === 'Single parent' ||
    hasAny(a, 'childrenAgeBands', ['Children under 5', 'Children age 5-12', 'Teenagers at home']) ||
    hasAny(a, 'householdAttributes', ['Children under 5', 'Children age 5-12', 'Teenagers at home']);

  if (
    hasChildrenSignals ||
    livingArrangement.includes('extended family') ||
    livingArrangement.includes('parents') ||
    has(a, 'householdAttributes', 'Elderly parents at home')
  ) {
    score += 4;
    reasons.push('Household profile aligns with family-upgrader segment');
  }

  const age = asNumber(a, 'age');
  if (Number.isFinite(age) && age >= 32 && age <= 45) {
    score += 2;
    reasons.push('Age range matches family-upgrader core window');
  }

  const familyUpgrades = ['Water purifier', 'Cookware', 'Storage containers'];
  const matchedUpgrades = familyUpgrades.filter((item) => has(a, 'upgrades', item));
  if (matchedUpgrades.length > 0) {
    score += Math.min(4, matchedUpgrades.length * 2);
    reasons.push(`Recent upgrades include family-safety essentials: ${matchedUpgrades.join(', ')}`);
  }

  if (a.materialUpgrade === 'Yes') {
    score += 3;
    reasons.push('Has upgraded products for better/safer materials');
  }

  if (hasAny(a, 'airFryerPain', ['Food safety concerns', 'Difficult to clean'])) {
    score += 2;
    reasons.push('Prioritizes safety and hygiene in current appliance experience');
  }

  if (a.modular === 'Yes') {
    score += 1;
    reasons.push('Already investing in kitchen upgrades');
  }

  return {
    key: 'icp3',
    label: 'ICP 3 - Premium Family Upgraders',
    score,
    reasons,
  };
}

function scoreICP4(a: Answers): ICPDetail {
  let score = 0;
  const reasons: string[] = [];

  if (a.income === 'Rs10-20L' || a.income === '₹10-20L') {
    score += 2;
    reasons.push('Aspirational premium income band');
  }

  if (has(a, 'buyStyle', 'Lowest price')) {
    score += 2;
    reasons.push('Price-aware buyer profile');
  }

  if (hasAny(a, 'buyStyle', ['I optimize for design', 'I optimize for quality'])) {
    score += 2;
    reasons.push('Still values premium feel and quality');
  }

  if (hasAny(a, 'airFryerBarrier', ['Too expensive', 'Do not see enough value'])) {
    score += 3;
    reasons.push('Shows value-friction despite category interest');
  }

  const conceptInterest = asNumber(a, 'conceptInterest');
  if (Number.isFinite(conceptInterest) && conceptInterest >= 7) {
    score += 1;
    reasons.push('Interested in concept but may need stronger value proposition');
  }

  return {
    key: 'icp4',
    label: 'ICP 4 - Aspiring Premium Pragmatists',
    score,
    reasons,
  };
}

export function classifyResponse(a: Answers, options?: { householdWeights?: Partial<HouseholdShareWeights> }): ClassificationResult {
  const weights = normalizedWeights(options?.householdWeights);
  const raw = [scoreICP1(a), scoreICP2(a), scoreICP3(a), scoreICP4(a)];

  const core = raw
    .map((item) => {
      const bonus = householdWeightedBonus(a, item.key, weights);
      if (!bonus) return item;
      return {
        ...item,
        score: item.score + bonus,
        reasons: [...item.reasons, `Household share adjustment applied (+${bonus.toFixed(1)})`],
      };
    })
    .sort((left, right) => right.score - left.score);
  const topCore = core[0];
  const secondary = core[1] || null;

  const top =
    topCore.score >= 7
      ? topCore
      : {
          key: 'non-core' as const,
          label: 'Non-core segment',
          score: topCore.score,
          reasons: ['Current response does not strongly match any primary ICP yet'],
        };

  return {
    top,
    secondary,
    breakdown: core,
    confidence: confidenceBand(top.score, secondary?.score || 0),
    lifeStage: inferLifeStage(a),
    definiteBuyer: isDefiniteBuyer(a, top),
  };
}

export function calculateICPScore(a: Answers) {
  return classifyResponse(a).top.score;
}

export function classify(score: number) {
  if (score >= 12) return 'ICP 1 - Design-Conscious Modern Kitchen Buyers';
  if (score >= 9) return 'ICP 2 - Health-Conscious Urban Professionals';
  if (score >= 7) return 'ICP 3 - Premium Family Upgraders';
  return 'Non-core segment';
}

export const sections = ['About you', 'Lifestyle', 'Home and kitchen', 'Purchase habits', 'Air fryer category', 'Future kitchen', 'Concept feedback'];
