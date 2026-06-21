'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  classifyResponse,
  DEFAULT_HOUSEHOLD_SHARE_WEIGHTS,
  HOUSEHOLD_SHARE_WEIGHTS_STORAGE_KEY,
  HouseholdShareWeights,
  ResponseRecord,
} from '@/lib/survey';
import { baseQuestions, QUESTION_CONFIG_STORAGE_KEY } from '@/lib/questionnaire';

type Bucket = {
  label: string;
  count: number;
  percentage: number;
};

type TopField = {
  label: string;
  count: number;
};

type QuestionOverride = {
  title?: string;
  options?: string[];
  includeOthers?: boolean;
};

const STORAGE_KEY = 'kitchen-study-responses';

const icpBlueprint = [
  {
    key: 'ICP 1 - Design-Conscious Modern Kitchen Buyers',
    target: 58,
    definition: 'Age 27-35, usually recently married or design-led single/couple, premium aesthetic buyer with visible-countertop preference.',
    example:
      'Ananya, 31, recently married DINK in Bengaluru, is ICP 1 because she optimizes for design and keeps appliances as part of kitchen identity.',
  },
  {
    key: 'ICP 2 - Health-Conscious Urban Professionals',
    target: 24,
    definition: 'Age 24-35, mostly single/young couple, health and convenience optimizer focused on cleaner habits and time efficiency.',
    example:
      'Rohan, 29, single professional in Mumbai, is ICP 2 because he reads labels, meal-preps, and values healthier outcomes with low effort.',
  },
  {
    key: 'ICP 3 - Premium Family Upgraders',
    target: 14,
    definition: 'Age 32-45, married with children or extended-family setup, safety and hygiene driven premium household upgrader.',
    example:
      'Neha, 38, married with children in Gurgaon, is ICP 3 because she upgrades for safer materials and easier family maintenance.',
  },
  {
    key: 'ICP 4 - Aspiring Premium Pragmatists',
    target: 4,
    definition: 'Age 28-38, aspirational premium but value-sensitive buyers who need stronger value proof before converting.',
    example:
      'Karan, 33, newly married in Pune, is ICP 4 because he wants premium design/quality but still hesitates on value-for-money.',
  },
];

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isOtherLabel(option: string) {
  return /^other/i.test(option.trim());
}

function toBuckets(values: string[]): Bucket[] {
  const total = values.length;
  if (!total) return [];

  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));

  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((left, right) => right.count - left.count);
}

function topMulti(rows: ResponseRecord[], key: string, max = 8): TopField[] {
  const counts = new Map<string, number>();

  rows.forEach((row) => {
    const values = asArray(row.answers[key]);
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  });

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, max);
}

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(QUESTION_CONFIG_STORAGE_KEY) || '{}') as Record<string, QuestionOverride>;
  } catch {
    return {};
  }
}

function loadHouseholdWeights(): HouseholdShareWeights {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOUSEHOLD_SHARE_WEIGHTS_STORAGE_KEY) || '{}') as Partial<HouseholdShareWeights>;
    return {
      lifeStage: Number(parsed.lifeStage) || DEFAULT_HOUSEHOLD_SHARE_WEIGHTS.lifeStage,
      livingSetup: Number(parsed.livingSetup) || DEFAULT_HOUSEHOLD_SHARE_WEIGHTS.livingSetup,
      householdAttributes: Number(parsed.householdAttributes) || DEFAULT_HOUSEHOLD_SHARE_WEIGHTS.householdAttributes,
    };
  } catch {
    return DEFAULT_HOUSEHOLD_SHARE_WEIGHTS;
  }
}

export default function Admin() {
  const [rows, setRows] = useState<ResponseRecord[]>([]);
  const [overrides, setOverrides] = useState<Record<string, QuestionOverride>>({});
  const [householdWeights, setHouseholdWeights] = useState<HouseholdShareWeights>(DEFAULT_HOUSEHOLD_SHARE_WEIGHTS);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const payload = localStorage.getItem(STORAGE_KEY) || '[]';
    try {
      const parsed = JSON.parse(payload) as ResponseRecord[];
      setRows(parsed);
    } catch {
      setRows([]);
    }

    setOverrides(loadOverrides());
    setHouseholdWeights(loadHouseholdWeights());
  }, []);

  const enriched = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        classification: classifyResponse(row.answers, { householdWeights }),
      })),
    [rows, householdWeights],
  );

  const total = enriched.length;
  const icpDistribution = useMemo(() => toBuckets(enriched.map((row) => row.classification.top.label)), [enriched]);
  const confidenceSplit = useMemo(() => toBuckets(enriched.map((row) => row.classification.confidence)), [enriched]);
  const genderSplit = useMemo(() => toBuckets(enriched.map((row) => asString(row.answers.gender) || 'Unspecified')), [enriched]);
  const topPains = useMemo(() => topMulti(enriched, 'airFryerPain', 8), [enriched]);
  const topBarriers = useMemo(() => topMulti(enriched, 'airFryerBarrier', 8), [enriched]);

  const icpTargetVsActual = useMemo(() => {
    const actualMap = new Map(icpDistribution.map((bucket) => [bucket.label, bucket.percentage]));
    return icpBlueprint.map((item) => ({
      ...item,
      actual: actualMap.get(item.key) || 0,
    }));
  }, [icpDistribution]);

  const expectedQuestionIds = useMemo(() => baseQuestions.map((q) => q.id), []);
  const keysCoverage = useMemo(() => {
    if (!enriched.length) return [] as { key: string; coverage: number }[];

    return expectedQuestionIds.map((key) => {
      const present = enriched.filter((row) => row.answers[key] !== undefined && String(row.answers[key]).length > 0).length;
      return {
        key,
        coverage: Math.round((present / enriched.length) * 100),
      };
    });
  }, [enriched, expectedQuestionIds]);

  const definiteBuyerShare = useMemo(() => {
    if (!enriched.length) return 0;
    const count = enriched.filter((row) => row.classification.definiteBuyer).length;
    return Math.round((count / enriched.length) * 100);
  }, [enriched]);

  const normalizedHouseholdWeights = useMemo(() => {
    const total = householdWeights.lifeStage + householdWeights.livingSetup + householdWeights.householdAttributes;
    if (!total) return DEFAULT_HOUSEHOLD_SHARE_WEIGHTS;
    return {
      lifeStage: Math.round((householdWeights.lifeStage / total) * 100),
      livingSetup: Math.round((householdWeights.livingSetup / total) * 100),
      householdAttributes: Math.round((householdWeights.householdAttributes / total) * 100),
    };
  }, [householdWeights]);

  const updateOverride = (id: string, patch: Partial<QuestionOverride>) => {
    setOverrides((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        ...patch,
      },
    }));
  };

  const saveOverrides = () => {
    localStorage.setItem(QUESTION_CONFIG_STORAGE_KEY, JSON.stringify(overrides));
    setMessage('Question config saved. Refresh survey tab to apply changes.');
  };

  const saveHouseholdWeights = () => {
    localStorage.setItem(HOUSEHOLD_SHARE_WEIGHTS_STORAGE_KEY, JSON.stringify(householdWeights));
    setMessage('Household share weights saved. Analytics and new submissions now use these weights.');
  };

  const resetHouseholdWeights = () => {
    localStorage.removeItem(HOUSEHOLD_SHARE_WEIGHTS_STORAGE_KEY);
    setHouseholdWeights(DEFAULT_HOUSEHOLD_SHARE_WEIGHTS);
    setMessage('Household share weights reset to default 50/25/25.');
  };

  const resetOverrides = () => {
    localStorage.removeItem(QUESTION_CONFIG_STORAGE_KEY);
    setOverrides({});
    setMessage('Question config reset to default. Refresh survey tab to apply defaults.');
  };

  const download = () => {
    const keys = Array.from(new Set(enriched.flatMap((row) => Object.keys(row.answers)))).sort();

    const esc = (value: unknown) =>
      `"${String(Array.isArray(value) ? value.join(' | ') : value ?? '')
        .replaceAll('"', '""')
        .replaceAll('\n', ' ')}"`;

    const header = ['id', 'timestamp', 'icp', 'secondaryIcp', 'confidence', 'definiteBuyer', ...keys].map(esc).join(',');

    const lines = enriched.map((row) => {
      const fields = [
        row.id,
        row.timestamp,
        row.classification.top.label,
        row.classification.secondary?.label || '',
        row.classification.confidence,
        row.classification.definiteBuyer ? 'Yes' : 'No',
        ...keys.map((key) => row.answers[key]),
      ];
      return fields.map(esc).join(',');
    });

    const csv = [header, ...lines].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'kitchen-study-analytics.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="min-h-screen bg-[#f8f4ef] p-5 text-[#302a25] sm:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#9a7455]">Private research view</p>
            <h1 className="mt-2 text-3xl font-semibold">ICP analytics and survey controls</h1>
            <p className="mt-2 text-sm text-[#75685e]">{total} responses saved on this device</p>
          </div>
          <button disabled={!total} onClick={download} className="rounded-xl bg-[#49382c] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
            Download CSV
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard label="Total responses" value={String(total)} />
          <StatCard label="Definite buyer share" value={`${definiteBuyerShare}%`} />
          <StatCard label="Top segment" value={icpDistribution[0]?.label || 'N/A'} />
          <StatCard label="High confidence" value={`${confidenceSplit.find((x) => x.label === 'high')?.percentage || 0}%`} />
        </div>

        <Panel title="Household share controls (scoring weights)">
          <p className="mb-4 text-sm text-[#6f6259]">
            Control how household context contributes to ICP scoring. Values are normalized to 100% internally.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm">
              <span className="font-medium">Life stage</span>
              <input
                type="number"
                min={0}
                max={100}
                value={householdWeights.lifeStage}
                onChange={(event) => setHouseholdWeights((prev) => ({ ...prev, lifeStage: Number(event.target.value) || 0 }))}
                className="mt-1 w-full rounded border border-[#d9ccc0] bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">Living setup</span>
              <input
                type="number"
                min={0}
                max={100}
                value={householdWeights.livingSetup}
                onChange={(event) => setHouseholdWeights((prev) => ({ ...prev, livingSetup: Number(event.target.value) || 0 }))}
                className="mt-1 w-full rounded border border-[#d9ccc0] bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">Household attributes</span>
              <input
                type="number"
                min={0}
                max={100}
                value={householdWeights.householdAttributes}
                onChange={(event) => setHouseholdWeights((prev) => ({ ...prev, householdAttributes: Number(event.target.value) || 0 }))}
                className="mt-1 w-full rounded border border-[#d9ccc0] bg-white px-3 py-2"
              />
            </label>
          </div>

          <p className="mt-3 text-xs text-[#6f6259]">
            Active normalized share: Life stage {normalizedHouseholdWeights.lifeStage}% | Living setup {normalizedHouseholdWeights.livingSetup}% |
            Household attributes {normalizedHouseholdWeights.householdAttributes}%
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={saveHouseholdWeights} className="rounded-lg bg-[#4a3a2f] px-4 py-2 text-sm font-semibold text-white">
              Save household share
            </button>
            <button onClick={resetHouseholdWeights} className="rounded-lg border border-[#cab8a9] px-4 py-2 text-sm font-semibold text-[#4a3a2f]">
              Reset to 50/25/25
            </button>
          </div>
        </Panel>

        <Panel title="ICP strategy overview: target vs actual">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-[#eadbc9]">
                <tr>
                  <th className="p-3">ICP</th>
                  <th className="p-3">Definition (who)</th>
                  <th className="p-3">Example line (why)</th>
                  <th className="p-3">Target share %</th>
                  <th className="p-3">Actual share %</th>
                </tr>
              </thead>
              <tbody>
                {icpTargetVsActual.map((icp) => (
                  <tr key={icp.key} className="border-t border-[#eee7e0] align-top">
                    <td className="p-3 font-semibold">{icp.key}</td>
                    <td className="p-3 text-[#5f544b]">{icp.definition}</td>
                    <td className="p-3 text-[#5f544b]">{icp.example}</td>
                    <td className="p-3 font-semibold">{icp.target}%</td>
                    <td className="p-3 font-semibold">{icp.actual}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#6f6259]">Actual is calculated from current form responses on this device.</p>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="ICP distribution">
            <BarList buckets={icpDistribution} />
          </Panel>
          <Panel title="Confidence split">
            <BarList buckets={confidenceSplit} />
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Top air fryer pains">
            <TagCloud items={topPains} emptyLabel="No data" />
          </Panel>
          <Panel title="Top non-buyer barriers">
            <TagCloud items={topBarriers} emptyLabel="No data" />
          </Panel>
        </div>

        <Panel title="Sync verification (survey -> admin)">
          <p className="mb-3 text-sm text-[#6f6259]">Coverage shows the percentage of responses containing each expected question key.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {keysCoverage.map((entry) => (
              <div key={entry.key} className="rounded border border-[#e6ddd3] bg-[#fbf8f4] px-3 py-2 text-sm">
                <span className="text-[#5f544b]">{entry.key}</span>
                <span className="float-right font-semibold">{entry.coverage}%</span>
              </div>
            ))}
            {!keysCoverage.length && <p className="text-sm text-[#8a7e74]">No responses yet to verify key coverage.</p>}
          </div>
        </Panel>

        <Panel title="Question and answer editor">
          <p className="mb-4 text-sm text-[#6f6259]">
            Edit survey wording/options and toggle Others (please specify). This config applies in local browser storage.
          </p>

          <div className="space-y-4">
            {baseQuestions.map((question) => {
              const patch = overrides[question.id] || {};
              const effectiveOptions = patch.options || question.options || [];
              const includeOthers =
                typeof patch.includeOthers === 'boolean'
                  ? patch.includeOthers
                  : effectiveOptions.some((option) => isOtherLabel(option));

              return (
                <div key={question.id} className="rounded-xl border border-[#e6ddd3] bg-[#fcfaf7] p-4">
                  <p className="text-xs uppercase tracking-[.12em] text-[#8f7460]">{question.id}</p>
                  <label className="mt-2 block text-sm font-medium">Question title</label>
                  <input
                    value={patch.title ?? question.title}
                    onChange={(event) => updateOverride(question.id, { title: event.target.value })}
                    className="mt-1 w-full rounded border border-[#d9ccc0] bg-white px-3 py-2 text-sm"
                  />

                  {(question.kind === 'single' || question.kind === 'multi') && (
                    <>
                      <label className="mt-3 block text-sm font-medium">Options (comma-separated)</label>
                      <textarea
                        value={effectiveOptions.join(', ')}
                        onChange={(event) => {
                          const values = event.target.value
                            .split(',')
                            .map((item) => item.trim())
                            .filter(Boolean);
                          updateOverride(question.id, { options: values });
                        }}
                        rows={2}
                        className="mt-1 w-full rounded border border-[#d9ccc0] bg-white px-3 py-2 text-sm"
                      />

                      <label className="mt-2 inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={includeOthers}
                          onChange={(event) => updateOverride(question.id, { includeOthers: event.target.checked })}
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

        <Panel title="Response classification details">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="bg-[#eadbc9]">
                <tr>
                  <th className="p-3">Submitted</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Gender</th>
                  <th className="p-3">Primary ICP</th>
                  <th className="p-3">Secondary ICP</th>
                  <th className="p-3">Confidence</th>
                  <th className="p-3">Life stage</th>
                  <th className="p-3">Definite buy</th>
                  <th className="p-3">Why assigned</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((row) => (
                  <tr key={row.id} className="border-t border-[#eee7e0] align-top">
                    <td className="p-3">{new Date(row.timestamp).toLocaleString()}</td>
                    <td className="p-3">{asString(row.answers.name) || 'Anonymous'}</td>
                    <td className="p-3">{asString(row.answers.gender) || '-'}</td>
                    <td className="p-3">{row.classification.top.label}</td>
                    <td className="p-3">{row.classification.secondary?.label || '-'}</td>
                    <td className="p-3">{row.classification.confidence}</td>
                    <td className="p-3">{row.classification.lifeStage}</td>
                    <td className="p-3">{row.classification.definiteBuyer ? 'Yes' : 'No'}</td>
                    <td className="p-3">
                      <ul className="list-disc pl-4 text-xs text-[#5e534a]">
                        {row.classification.top.reasons.map((reason, index) => (
                          <li key={`${row.id}-${index}`}>{reason}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
                {!enriched.length && (
                  <tr>
                    <td colSpan={9} className="p-10 text-center text-[#82756b]">
                      No responses on this device yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Demographics quick split">
          <MiniList title="Gender" buckets={genderSplit} />
        </Panel>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#ded4ca] bg-white p-4">
      <p className="text-xs uppercase tracking-[.14em] text-[#907159]">{label}</p>
      <p className="mt-2 text-xl font-semibold text-[#3f3026]">{value}</p>
    </div>
  );
}

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-[#ded4ca] bg-white p-4 ${className}`}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BarList({ buckets }: { buckets: Bucket[] }) {
  if (!buckets.length) return <p className="text-sm text-[#8b7c71]">No data yet</p>;

  return (
    <div className="space-y-3">
      {buckets.map((bucket) => (
        <div key={bucket.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span>{bucket.label}</span>
            <span className="font-semibold">
              {bucket.count} ({bucket.percentage}%)
            </span>
          </div>
          <div className="h-2 rounded bg-[#eadbc9]">
            <div className="h-full rounded bg-[#6b4f38]" style={{ width: `${bucket.percentage}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniList({ title, buckets }: { title: string; buckets: Bucket[] }) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-[.12em] text-[#876954]">{title}</p>
      <div className="space-y-1 text-sm">
        {buckets.slice(0, 6).map((bucket) => (
          <div key={`${title}-${bucket.label}`} className="flex items-center justify-between">
            <span>{bucket.label}</span>
            <span className="font-semibold">{bucket.count}</span>
          </div>
        ))}
        {!buckets.length && <p className="text-xs text-[#8b7c71]">No data</p>}
      </div>
    </div>
  );
}

function TagCloud({ items, emptyLabel }: { items: TopField[]; emptyLabel: string }) {
  if (!items.length) {
    return <p className="text-sm text-[#8b7c71]">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item.label} className="rounded-full bg-[#f3ebe2] px-3 py-1 text-sm text-[#573f2f]">
          {item.label} · {item.count}
        </span>
      ))}
    </div>
  );
}
