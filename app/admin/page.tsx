'use client';

import { useEffect, useMemo, useState } from 'react';
import { classifyResponse, ClassificationResult, ResponseRecord } from '@/lib/survey';
import { baseQuestions, QUESTION_CONFIG_STORAGE_KEY } from '@/lib/questionnaire';

// ── Types ─────────────────────────────────────────────────────────────────────

type Bucket = { label: string; count: number; percentage: number };
type TopField = { label: string; count: number };
type QuestionOverride = { title?: string; options?: string[]; includeOthers?: boolean };
type EnrichedRecord = ResponseRecord & { classification: ClassificationResult };

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'kitchen-study-responses';

const PURCHASE_INTENT_ORDER = [
  'Definitely buy',
  'Probably buy',
  'Might consider',
  'Probably not',
  'Definitely not',
];

const BUDGET_ORDER = [
  'Under ₹5,000',
  '₹5,000–₹8,000',
  '₹8,000–₹10,000',
  '₹10,000–₹15,000',
  '₹15,000+',
];

const PRICE_ACCEPTING = ['₹8,000–₹10,000', '₹10,000–₹15,000', '₹15,000+'];

const ICP_BLUEPRINT = [
  {
    key: 'ICP 1 — Design-Conscious Modern Kitchen Buyers',
    target: 58,
    definition: 'Age 27–35, recently married or design-led couple, premium aesthetic buyer who keeps appliances visible.',
    example: 'Ananya, 31, DINK in Bengaluru — optimises for design, modular kitchen, admires Dyson.',
  },
  {
    key: 'ICP 2 — Health-Conscious Urban Professionals',
    target: 24,
    definition: 'Age 24–35, single or young couple, health and convenience optimizer with clean-eating habits.',
    example: 'Rohan, 29, single in Mumbai — optimises for health, meal-preps, reads ingredient labels.',
  },
  {
    key: 'ICP 3 — Premium Family Upgraders',
    target: 14,
    definition: 'Age 32–45, married with children or extended family, safety and hygiene driven upgrader.',
    example: 'Neha, 38, married with children in Gurgaon — upgrades for safer materials, family first.',
  },
  {
    key: 'ICP 4 — Aspiring Premium Pragmatists',
    target: 4,
    definition: 'Age 28–38, aspirational but value-sensitive, needs stronger proof before converting at premium price.',
    example: 'Karan, 33, newly married in Pune — wants premium quality but price-hesitant.',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function asStr(v: unknown): string { return typeof v === 'string' ? v : ''; }
function asArr(v: unknown): string[] { return Array.isArray(v) ? v.map(String) : []; }

function asNum(v: unknown): number {
  if (typeof v !== 'string') return NaN;
  const n = parseInt(v, 10);
  return isNaN(n) ? NaN : n;
}

function isOtherLabel(s: string) { return /^other/i.test(s.trim()); }

function effectiveBudget(r: EnrichedRecord): string {
  return asStr(r.answers.ownerBudget) || asStr(r.answers.prospectBudget);
}

function effectiveConceptScore(r: EnrichedRecord): number {
  const n = asNum(r.answers.conceptCompelling);
  return Number.isFinite(n) ? n : asNum(r.answers.conceptInterest);
}

function toBuckets(values: string[]): Bucket[] {
  const total = values.length;
  if (!total) return [];
  const counts = new Map<string, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, percentage: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

function toOrderedBuckets(values: string[], order: string[]): Bucket[] {
  const total = values.length;
  if (!total) return [];
  const counts = new Map<string, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const result = order
    .map((label) => ({ label, count: counts.get(label) || 0, percentage: Math.round(((counts.get(label) || 0) / total) * 100) }))
    .filter((b) => b.count > 0);
  counts.forEach((count, label) => {
    if (!order.includes(label)) result.push({ label, count, percentage: Math.round((count / total) * 100) });
  });
  return result;
}

function topMulti(rows: EnrichedRecord[], key: string, max = 8): TopField[] {
  const counts = new Map<string, number>();
  rows.forEach((r) => asArr(r.answers[key]).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

function ageBucket(age: number): string {
  if (age < 25) return '18–24';
  if (age < 35) return '25–34';
  if (age < 45) return '35–44';
  return '45+';
}

// ── Admin page ────────────────────────────────────────────────────────────────

export default function Admin() {
  const [rows, setRows] = useState<ResponseRecord[]>([]);
  const [overrides, setOverrides] = useState<Record<string, QuestionOverride>>({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    try { setRows(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); } catch { setRows([]); }
    try { setOverrides(JSON.parse(localStorage.getItem(QUESTION_CONFIG_STORAGE_KEY) || '{}')); } catch { setOverrides({}); }
  }, []);

  const enriched = useMemo<EnrichedRecord[]>(
    () => rows.map((r) => ({ ...r, classification: classifyResponse(r.answers) })),
    [rows],
  );

  const total = enriched.length;

  // ── ICP & confidence ─────────────────────────────────────────────────────

  const icpDistribution = useMemo(() => toBuckets(enriched.map((r) => r.classification.top.label)), [enriched]);
  const confidenceSplit = useMemo(() => toBuckets(enriched.map((r) => r.classification.confidence)), [enriched]);

  const definiteBuyerShare = useMemo(() => {
    if (!enriched.length) return 0;
    return Math.round((enriched.filter((r) => r.classification.definiteBuyer).length / enriched.length) * 100);
  }, [enriched]);

  const icpTargetVsActual = useMemo(() => {
    const actualMap = new Map(icpDistribution.map((b) => [b.label, b.percentage]));
    return ICP_BLUEPRINT.map((icp) => ({ ...icp, actual: actualMap.get(icp.key) || 0 }));
  }, [icpDistribution]);

  // ── Concept validation ───────────────────────────────────────────────────

  const avgConceptScore = useMemo(() => {
    const scores = enriched.map(effectiveConceptScore).filter((n) => Number.isFinite(n) && n >= 1 && n <= 10);
    if (!scores.length) return null;
    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  }, [enriched]);

  const purchaseIntentBuckets = useMemo(() => {
    const values = enriched.map((r) => asStr(r.answers.purchaseIntent)).filter(Boolean);
    return toOrderedBuckets(values, PURCHASE_INTENT_ORDER);
  }, [enriched]);

  const definiteProbableShare = useMemo(() => {
    const values = enriched.map((r) => asStr(r.answers.purchaseIntent)).filter(Boolean);
    if (!values.length) return 0;
    const dp = values.filter((v) => v === 'Definitely buy' || v === 'Probably buy').length;
    return Math.round((dp / values.length) * 100);
  }, [enriched]);

  // ── Pricing ──────────────────────────────────────────────────────────────

  const budgetBuckets = useMemo(() => {
    const values = enriched.map(effectiveBudget).filter(Boolean);
    return toOrderedBuckets(values, BUDGET_ORDER);
  }, [enriched]);

  const pricingAcceptance = useMemo(() => {
    const budgets = enriched.map(effectiveBudget).filter(Boolean);
    if (!budgets.length) return 0;
    return Math.round((budgets.filter((b) => PRICE_ACCEPTING.includes(b)).length / budgets.length) * 100);
  }, [enriched]);

  // ── Air fryer ownership & usage ──────────────────────────────────────────

  const ownershipSplit = useMemo(() => toBuckets(enriched.map((r) => asStr(r.answers.airFryerOwnership)).filter(Boolean)), [enriched]);

  const usageFrequency = useMemo(() => {
    const values = enriched
      .filter((r) => asStr(r.answers.airFryerOwnership) === 'Yes')
      .map((r) => asStr(r.answers.airFryerFrequency))
      .filter(Boolean);
    return toBuckets(values);
  }, [enriched]);

  // ── Demographics ─────────────────────────────────────────────────────────

  const ageDistribution = useMemo(() => {
    const labels: string[] = [];
    enriched.forEach((r) => {
      const age = asNum(r.answers.age);
      if (Number.isFinite(age) && age >= 18 && age <= 80) labels.push(ageBucket(age));
    });
    return toOrderedBuckets(labels, ['18–24', '25–34', '35–44', '45+']);
  }, [enriched]);

  const incomeSplit = useMemo(() => {
    const values = enriched.map((r) => asStr(r.answers.income)).filter(Boolean);
    return toOrderedBuckets(values, ['Under ₹10L', '₹10–20L', '₹20–40L', '₹40L+', 'Prefer not to say']);
  }, [enriched]);

  const lifeStageSplit = useMemo(() => toBuckets(enriched.map((r) => asStr(r.answers.lifeStage)).filter(Boolean)), [enriched]);

  const topCities = useMemo(() => {
    const values = enriched.map((r) => asStr(r.answers.city)).filter(Boolean);
    return toBuckets(values).slice(0, 8);
  }, [enriched]);

  // ── Key coverage (for sync verification) ────────────────────────────────

  const keysCoverage = useMemo(() => {
    if (!enriched.length) return [] as { key: string; coverage: number }[];
    return baseQuestions.map((q) => {
      const present = enriched.filter((r) => r.answers[q.id] !== undefined && String(r.answers[q.id]).length > 0).length;
      return { key: q.id, coverage: Math.round((present / enriched.length) * 100) };
    });
  }, [enriched]);

  // ── Question editor ──────────────────────────────────────────────────────

  const updateOverride = (id: string, patch: Partial<QuestionOverride>) => {
    setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  };

  const saveOverrides = () => {
    localStorage.setItem(QUESTION_CONFIG_STORAGE_KEY, JSON.stringify(overrides));
    setMessage('Question config saved. Refresh survey tab to apply changes.');
  };

  const resetOverrides = () => {
    localStorage.removeItem(QUESTION_CONFIG_STORAGE_KEY);
    setOverrides({});
    setMessage('Question config reset to defaults. Refresh survey tab to apply.');
  };

  // ── CSV download ─────────────────────────────────────────────────────────

  const download = () => {
    const keys = Array.from(new Set(enriched.flatMap((r) => Object.keys(r.answers)))).sort();
    const esc = (v: unknown) =>
      `"${String(Array.isArray(v) ? v.join(' | ') : v ?? '').replaceAll('"', '""').replaceAll('\n', ' ')}"`;

    const header = ['id', 'timestamp', 'icp', 'secondaryIcp', 'confidence', 'definiteBuyer', 'conceptScore', 'purchaseIntent', 'budget', ...keys].map(esc).join(',');

    const lines = enriched.map((r) => {
      const fields = [
        r.id,
        r.timestamp,
        r.classification.top.label,
        r.classification.secondary?.label || '',
        r.classification.confidence,
        r.classification.definiteBuyer ? 'Yes' : 'No',
        effectiveConceptScore(r) || '',
        asStr(r.answers.purchaseIntent),
        effectiveBudget(r),
        ...keys.map((k) => r.answers[k]),
      ];
      return fields.map(esc).join(',');
    });

    const csv = [header, ...lines].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'norro-customer-discovery.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#f8f4ef] p-5 text-[#302a25] sm:p-10">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#9a7455]">Norro · Private research view</p>
            <h1 className="mt-2 text-3xl font-semibold">Customer discovery dashboard</h1>
            <p className="mt-1 text-sm text-[#75685e]">{total} response{total !== 1 ? 's' : ''} on this device</p>
          </div>
          <button
            disabled={!total}
            onClick={download}
            className="rounded-xl bg-[#49382c] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Download CSV
          </button>
        </div>

        {/* Top-line stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total responses" value={String(total)} />
          <StatCard label="Definite + probable buyers" value={`${definiteProbableShare}%`} />
          <StatCard label="Definite buyer (strict)" value={`${definiteBuyerShare}%`} />
          <StatCard label="Top ICP segment" value={icpDistribution[0]?.label?.replace('ICP', '').trim() || 'N/A'} small />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Avg concept score" value={avgConceptScore ? `${avgConceptScore} / 10` : 'N/A'} />
          <StatCard label="Price acceptance (₹8k+)" value={`${pricingAcceptance}%`} />
          <StatCard label="High-confidence classifications" value={`${confidenceSplit.find((x) => x.label === 'high')?.percentage || 0}%`} />
          <StatCard label="Air fryer owners" value={`${ownershipSplit.find((x) => x.label === 'Yes')?.percentage || 0}%`} />
        </div>

        {/* ICP strategy */}
        <Panel title="ICP strategy: target vs actual">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-[#eadbc9]">
                <tr>
                  <th className="p-3">ICP</th>
                  <th className="p-3">Who they are</th>
                  <th className="p-3">Example</th>
                  <th className="p-3 text-right">Target</th>
                  <th className="p-3 text-right">Actual</th>
                  <th className="p-3 text-right">Gap</th>
                </tr>
              </thead>
              <tbody>
                {icpTargetVsActual.map((icp) => {
                  const gap = icp.actual - icp.target;
                  return (
                    <tr key={icp.key} className="border-t border-[#eee7e0] align-top">
                      <td className="p-3 font-semibold">{icp.key}</td>
                      <td className="p-3 text-[#5f544b]">{icp.definition}</td>
                      <td className="p-3 text-[#5f544b] italic">{icp.example}</td>
                      <td className="p-3 text-right font-semibold">{icp.target}%</td>
                      <td className="p-3 text-right font-semibold">{icp.actual}%</td>
                      <td className={`p-3 text-right font-semibold ${gap > 0 ? 'text-[#2d6a2d]' : gap < 0 ? 'text-[#8a3020]' : 'text-[#75685e]'}`}>
                        {gap > 0 ? `+${gap}` : gap}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#6f6259]">Actual share is computed from responses on this device only.</p>
        </Panel>

        {/* ICP distribution + confidence */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="ICP distribution">
            <BarList buckets={icpDistribution} />
          </Panel>
          <Panel title="Classification confidence">
            <BarList buckets={confidenceSplit} />
          </Panel>
        </div>

        {/* Concept validation */}
        <Panel title="Norro concept validation (Section C)">
          <p className="mb-4 text-sm text-[#6f6259]">
            Respondents rated the Norro concept (glass-basket air fryer, ₹8,990) after completing the discovery section.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-sm font-semibold">Purchase intent at ₹8,990</p>
              <BarList buckets={purchaseIntentBuckets} />
            </div>
            <div>
              <p className="mb-3 text-sm font-semibold">Concept compelling score distribution</p>
              {(() => {
                const scores = enriched.map(effectiveConceptScore).filter((n) => Number.isFinite(n));
                const buckets = toOrderedBuckets(
                  scores.map(String),
                  ['1','2','3','4','5','6','7','8','9','10'],
                );
                return <BarList buckets={buckets} />;
              })()}
            </div>
          </div>
        </Panel>

        {/* Pricing & budget */}
        <Panel title="Budget willingness to pay">
          <p className="mb-4 text-sm text-[#6f6259]">
            Combined across owner and non-owner flows. Responses at ₹8,000+ are considered price-accepting for Norro's ₹8,990 launch price.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <BarList buckets={budgetBuckets} />
            <div className="flex items-center justify-center rounded-xl border border-[#e6ddd3] bg-[#faf7f3] p-6 text-center">
              <div>
                <p className="text-xs uppercase tracking-[.14em] text-[#907159]">Price-accepting respondents</p>
                <p className="mt-2 text-5xl font-semibold text-[#3f3026]">{pricingAcceptance}%</p>
                <p className="mt-2 text-sm text-[#75685e]">selected ₹8,000 or above</p>
              </div>
            </div>
          </div>
        </Panel>

        {/* Air fryer ownership & usage */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Air fryer ownership split">
            <BarList buckets={ownershipSplit} />
          </Panel>
          <Panel title="Usage frequency (owners only)">
            <BarList buckets={usageFrequency} />
          </Panel>
        </div>

        {/* Open-text discovery insights */}
        <Panel title="Discovery insights (open-text responses)">
          <p className="mb-4 text-sm text-[#6f6259]">
            Key open-text answers per respondent. These are the primary qualitative signals for product, positioning, and investor narrative.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-[#eadbc9]">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Frustration / barrier (verbatim)</th>
                  <th className="p-3">Would change</th>
                  <th className="p-3">Concept score</th>
                  <th className="p-3">Why that score</th>
                  <th className="p-3">Budget</th>
                  <th className="p-3">Intent</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((r) => {
                  const isOwner = asStr(r.answers.airFryerOwnership) === 'Yes';
                  const frustration = isOwner
                    ? asStr(r.answers.airFryerFrustrations) || asStr(r.answers.airFryerPain as unknown as string)
                    : asStr(r.answers.whyNotBought);
                  const cs = effectiveConceptScore(r);
                  return (
                    <tr key={r.id} className="border-t border-[#eee7e0] align-top">
                      <td className="p-3 font-medium">{asStr(r.answers.name) || 'Anon'}</td>
                      <td className="p-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isOwner ? 'bg-[#daecd4] text-[#2d5e27]' : 'bg-[#dce6f5] text-[#20427a]'}`}>
                          {isOwner ? 'Owner' : 'Prospect'}
                        </span>
                      </td>
                      <td className="p-3 max-w-[240px] text-[#3d3530]">{frustration || <span className="text-[#aaa]">—</span>}</td>
                      <td className="p-3 max-w-[200px] text-[#3d3530]">{asStr(r.answers.airFryerChange) || <span className="text-[#aaa]">—</span>}</td>
                      <td className="p-3 font-semibold">{Number.isFinite(cs) ? cs : '—'}</td>
                      <td className="p-3 max-w-[220px] text-[#3d3530]">{asStr(r.answers.conceptWhyScore) || asStr(r.answers.conceptFeedback) || <span className="text-[#aaa]">—</span>}</td>
                      <td className="p-3">{effectiveBudget(r) || '—'}</td>
                      <td className="p-3">{asStr(r.answers.purchaseIntent) || '—'}</td>
                    </tr>
                  );
                })}
                {!enriched.length && (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-[#82756b]">No responses yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Demographics */}
        <Panel title="Demographics">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-[#876954]">Age bands</p>
              <MiniList buckets={ageDistribution} />
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-[#876954]">Income</p>
              <MiniList buckets={incomeSplit} />
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-[#876954]">Life stage</p>
              <MiniList buckets={lifeStageSplit} />
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-[#876954]">Top cities</p>
              <MiniList buckets={topCities} />
            </div>
          </div>
        </Panel>

        {/* Full classification table */}
        <Panel title="Response classification details">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1300px] text-left text-sm">
              <thead className="bg-[#eadbc9]">
                <tr>
                  <th className="p-3">Submitted</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">City</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Primary ICP</th>
                  <th className="p-3">Confidence</th>
                  <th className="p-3">Life stage</th>
                  <th className="p-3">Concept</th>
                  <th className="p-3">Intent</th>
                  <th className="p-3">Definite buy</th>
                  <th className="p-3">Why assigned</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((r) => (
                  <tr key={r.id} className="border-t border-[#eee7e0] align-top">
                    <td className="p-3 whitespace-nowrap">{new Date(r.timestamp).toLocaleString()}</td>
                    <td className="p-3">{asStr(r.answers.name) || 'Anonymous'}</td>
                    <td className="p-3">{asStr(r.answers.city) || '—'}</td>
                    <td className="p-3">
                      {asStr(r.answers.airFryerOwnership) === 'Yes' ? 'Owner' : asStr(r.answers.airFryerOwnership) === 'No' ? 'Prospect' : '—'}
                    </td>
                    <td className="p-3">{r.classification.top.label}</td>
                    <td className="p-3">{r.classification.confidence}</td>
                    <td className="p-3">{r.classification.lifeStage}</td>
                    <td className="p-3 font-semibold">
                      {Number.isFinite(effectiveConceptScore(r)) ? `${effectiveConceptScore(r)}/10` : '—'}
                    </td>
                    <td className="p-3">{asStr(r.answers.purchaseIntent) || '—'}</td>
                    <td className="p-3">{r.classification.definiteBuyer ? 'Yes' : 'No'}</td>
                    <td className="p-3">
                      <ul className="list-disc pl-4 text-xs text-[#5e534a] space-y-0.5">
                        {r.classification.top.reasons.map((reason, i) => (
                          <li key={`${r.id}-${i}`}>{reason}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
                {!enriched.length && (
                  <tr>
                    <td colSpan={11} className="p-10 text-center text-[#82756b]">No responses on this device yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Sync verification */}
        <Panel title="Data coverage check">
          <p className="mb-3 text-sm text-[#6f6259]">% of responses that contain each question key. Conditional questions will show lower coverage — that is expected.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {keysCoverage.map((e) => (
              <div key={e.key} className="flex items-center justify-between rounded border border-[#e6ddd3] bg-[#fbf8f4] px-3 py-2 text-sm">
                <span className="text-[#5f544b]">{e.key}</span>
                <span className={`font-semibold ${e.coverage >= 80 ? 'text-[#2d6a2d]' : e.coverage >= 40 ? 'text-[#7a5e10]' : 'text-[#8a3020]'}`}>
                  {e.coverage}%
                </span>
              </div>
            ))}
            {!keysCoverage.length && <p className="text-sm text-[#8a7e74]">No responses yet.</p>}
          </div>
        </Panel>

        {/* Question editor */}
        <Panel title="Survey question editor">
          <p className="mb-4 text-sm text-[#6f6259]">
            Edit question wording and options. Changes are stored in local browser storage and applied on the survey tab after a refresh.
          </p>
          <div className="space-y-4">
            {baseQuestions.map((q) => {
              const patch = overrides[q.id] || {};
              const effectiveOptions = patch.options || q.options || [];
              const includeOthers =
                typeof patch.includeOthers === 'boolean'
                  ? patch.includeOthers
                  : effectiveOptions.some((o) => isOtherLabel(o));

              return (
                <div key={q.id} className="rounded-xl border border-[#e6ddd3] bg-[#fcfaf7] p-4">
                  <p className="text-xs uppercase tracking-[.12em] text-[#8f7460]">
                    {q.id}
                    {q.condition ? <span className="ml-2 text-[#9a7455]">(conditional)</span> : null}
                  </p>
                  <label className="mt-2 block text-sm font-medium">Question title</label>
                  <input
                    value={patch.title ?? q.title}
                    onChange={(e) => updateOverride(q.id, { title: e.target.value })}
                    className="mt-1 w-full rounded border border-[#d9ccc0] bg-white px-3 py-2 text-sm"
                  />
                  {(q.kind === 'single' || q.kind === 'multi') && (
                    <>
                      <label className="mt-3 block text-sm font-medium">Options (comma-separated)</label>
                      <textarea
                        value={effectiveOptions.join(', ')}
                        onChange={(e) => {
                          const values = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                          updateOverride(q.id, { options: values });
                        }}
                        rows={2}
                        className="mt-1 w-full rounded border border-[#d9ccc0] bg-white px-3 py-2 text-sm"
                      />
                      <label className="mt-2 inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={includeOthers}
                          onChange={(e) => updateOverride(q.id, { includeOthers: e.target.checked })}
                        />
                        Add option: Others (please specify)
                      </label>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={saveOverrides} className="rounded-lg bg-[#4a3a2f] px-4 py-2 text-sm font-semibold text-white">
              Save question config
            </button>
            <button onClick={resetOverrides} className="rounded-lg border border-[#cab8a9] px-4 py-2 text-sm font-semibold text-[#4a3a2f]">
              Reset to defaults
            </button>
          </div>
          {message && <p className="mt-3 text-sm text-[#36543d]">{message}</p>}
        </Panel>

      </div>
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#ded4ca] bg-white p-4">
      <p className="text-xs uppercase tracking-[.14em] text-[#907159]">{label}</p>
      <p className={`mt-2 font-semibold text-[#3f3026] ${small ? 'text-sm leading-snug' : 'text-xl'}`}>{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#ded4ca] bg-white p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BarList({ buckets }: { buckets: Bucket[] }) {
  if (!buckets.length) return <p className="text-sm text-[#8b7c71]">No data yet</p>;
  const max = Math.max(...buckets.map((b) => b.count));
  return (
    <div className="space-y-3">
      {buckets.map((b) => (
        <div key={b.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="mr-3">{b.label}</span>
            <span className="shrink-0 font-semibold">{b.count} ({b.percentage}%)</span>
          </div>
          <div className="h-2 rounded bg-[#eadbc9]">
            <div className="h-full rounded bg-[#6b4f38]" style={{ width: `${Math.round((b.count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniList({ buckets }: { buckets: Bucket[] }) {
  return (
    <div className="space-y-1 text-sm">
      {buckets.slice(0, 6).map((b) => (
        <div key={b.label} className="flex items-center justify-between">
          <span className="mr-2 truncate text-[#4a3d35]">{b.label}</span>
          <span className="shrink-0 font-semibold">{b.count}</span>
        </div>
      ))}
      {!buckets.length && <p className="text-xs text-[#8b7c71]">No data</p>}
    </div>
  );
}
