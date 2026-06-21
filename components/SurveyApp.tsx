'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Answers,
  classifyResponse,
  DEFAULT_HOUSEHOLD_SHARE_WEIGHTS,
  HOUSEHOLD_SHARE_WEIGHTS_STORAGE_KEY,
  HouseholdShareWeights,
  sections,
} from '@/lib/survey';
import { MultiChoice, Question, RatingScale, SingleChoice, TextInput } from '@/components/fields';
import { baseQuestions, QUESTION_CONFIG_STORAGE_KEY, SurveyQuestion } from '@/lib/questionnaire';

type StoredResponse = {
  id: string;
  timestamp: string;
  answers: Answers;
  score: number;
  segment: string;
  icpKey: 'icp1' | 'icp2' | 'icp3' | 'icp4' | 'non-core';
  icpLabel: string;
  icpReasons: string[];
};

const STORAGE_KEY = 'kitchen-study-responses';

type QuestionOverride = {
  title?: string;
  options?: string[];
  includeOthers?: boolean;
};

function isOtherLabel(option: string) {
  return /^other/i.test(option.trim());
}

function mergeQuestionConfig(base: SurveyQuestion[], overrides: Record<string, QuestionOverride>): SurveyQuestion[] {
  return base.map((question) => {
    const patch = overrides[question.id];
    if (!patch) return question;

    let options = question.options;
    if (patch.options && question.options) {
      options = patch.options;
    }

    if (typeof patch.includeOthers === 'boolean' && options) {
      const cleaned = options.filter((option) => !isOtherLabel(option));
      options = patch.includeOthers ? [...cleaned, 'Others (please specify)'] : cleaned;
    }

    return {
      ...question,
      title: patch.title || question.title,
      options,
    };
  });
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function isOtherSelected(question: SurveyQuestion, answers: Answers): boolean {
  if (!question.otherKey) return false;

  if (question.kind === 'single') {
    const value = asString(answers[question.id]);
    return isOtherLabel(value);
  }

  if (question.kind === 'multi') {
    const value = asArray(answers[question.id]);
    return value.some((item) => isOtherLabel(item));
  }

  return false;
}

function serializeQuestionAnswer(question: SurveyQuestion, answers: Answers, output: Answers) {
  const value = answers[question.id];

  if (question.kind === 'single') {
    const selected = asString(value).trim();
    if (!selected) return;

    if (isOtherLabel(selected) && question.otherKey) {
      const otherText = asString(answers[question.otherKey]).trim();
      output[question.id] = otherText ? `Other: ${otherText}` : selected;
      return;
    }

    output[question.id] = selected;
    return;
  }

  if (question.kind === 'multi') {
    const selected = asArray(value);
    if (!selected.length) return;

    const normalized = selected.filter((item) => !isOtherLabel(item));

    if (question.otherKey) {
      const includesOther = selected.some((item) => isOtherLabel(item));
      const otherText = asString(answers[question.otherKey]).trim();
      if (includesOther) {
        normalized.push(otherText ? `Other: ${otherText}` : 'Other');
      }
    }

    output[question.id] = normalized;
    return;
  }

  if (question.kind === 'rating' || question.kind === 'text') {
    const text = asString(value).trim();
    if (text) {
      output[question.id] = text;
    }
  }
}

function validateQuestion(question: SurveyQuestion, answers: Answers): string | null {
  if (question.condition && !question.condition(answers)) {
    return null;
  }

  const value = answers[question.id];

  if (question.required) {
    if (question.kind === 'multi' && asArray(value).length === 0) {
      return 'Please select at least one option.';
    }

    if ((question.kind === 'single' || question.kind === 'rating' || question.kind === 'text') && !asString(value).trim()) {
      return 'This question is required.';
    }
  }

  if (question.otherKey && isOtherSelected(question, answers)) {
    const other = asString(answers[question.otherKey]).trim();
    if (!other) {
      return 'Please add details for your Other selection.';
    }
  }

  if (question.validate) {
    return question.validate(value);
  }

  return null;
}

function sectionQuestionIndices(visibleQuestions: SurveyQuestion[]) {
  const map = new Map<number, SurveyQuestion[]>();
  visibleQuestions.forEach((question) => {
    if (!map.has(question.section)) {
      map.set(question.section, []);
    }
    map.get(question.section)!.push(question);
  });
  return [...map.keys()].sort((a, b) => a - b);
}

export default function SurveyApp() {
  const [answers, setAnswers] = useState<Answers>({});
  const [sectionCursor, setSectionCursor] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>(baseQuestions);
  const [householdWeights, setHouseholdWeights] = useState<HouseholdShareWeights>(DEFAULT_HOUSEHOLD_SHARE_WEIGHTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(QUESTION_CONFIG_STORAGE_KEY) || '{}';
      const parsed = JSON.parse(raw) as Record<string, QuestionOverride>;
      setQuestions(mergeQuestionConfig(baseQuestions, parsed));
    } catch {
      setQuestions(baseQuestions);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HOUSEHOLD_SHARE_WEIGHTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<HouseholdShareWeights>;
      setHouseholdWeights({
        lifeStage: Number(parsed.lifeStage) || DEFAULT_HOUSEHOLD_SHARE_WEIGHTS.lifeStage,
        livingSetup: Number(parsed.livingSetup) || DEFAULT_HOUSEHOLD_SHARE_WEIGHTS.livingSetup,
        householdAttributes: Number(parsed.householdAttributes) || DEFAULT_HOUSEHOLD_SHARE_WEIGHTS.householdAttributes,
      });
    } catch {
      setHouseholdWeights(DEFAULT_HOUSEHOLD_SHARE_WEIGHTS);
    }
  }, []);

  const visibleQuestions = useMemo(() => questions.filter((question) => (question.condition ? question.condition(answers) : true)), [answers]);
  const sectionIds = useMemo(() => sectionQuestionIndices(visibleQuestions), [visibleQuestions]);
  const currentSectionId = sectionIds[sectionCursor];
  const currentSectionQuestions = useMemo(
    () => visibleQuestions.filter((question) => question.section === currentSectionId),
    [visibleQuestions, currentSectionId],
  );

  useEffect(() => {
    if (sectionCursor >= sectionIds.length) {
      setSectionCursor(Math.max(sectionIds.length - 1, 0));
    }
  }, [sectionCursor, sectionIds.length]);

  const sectionName = typeof currentSectionId === 'number' ? sections[currentSectionId] || 'Survey' : 'Survey';
  const progress = sectionIds.length ? Math.round(((sectionCursor + 1) / sectionIds.length) * 100) : 0;

  const requiredVisible = visibleQuestions.filter((question) => question.required);
  const completion = requiredVisible.length
    ? Math.round(
        (requiredVisible.filter((question) => {
          const value = answers[question.id];
          return Array.isArray(value) ? value.length > 0 : asString(value).trim().length > 0;
        }).length /
          requiredVisible.length) *
          100,
      )
    : 0;

  const setAnswer = (key: string, value: string | string[]) => {
    setAnswers((previous) => ({ ...previous, [key]: value }));
    setError(null);
  };

  const validateCurrentSection = () => {
    for (const question of currentSectionQuestions) {
      const validation = validateQuestion(question, answers);
      if (validation) {
        setError(validation);
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (!validateCurrentSection()) return;
    setError(null);
    setSectionCursor((value) => Math.min(value + 1, sectionIds.length - 1));
  };

  const prev = () => {
    setError(null);
    setSectionCursor((value) => Math.max(value - 1, 0));
  };

  const submit = () => {
    for (const question of visibleQuestions) {
      const validation = validateQuestion(question, answers);
      if (validation) {
        setSectionCursor(Math.max(sectionIds.findIndex((sectionId) => sectionId === question.section), 0));
        setError(validation);
        return;
      }
    }

    const finalAnswers: Answers = {};
    visibleQuestions.forEach((question) => serializeQuestionAnswer(question, answers, finalAnswers));

    const classification = classifyResponse(finalAnswers, { householdWeights });
    const entry: StoredResponse = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      answers: finalAnswers,
      score: classification.top.score,
      segment: classification.top.label,
      icpKey: classification.top.key,
      icpLabel: classification.top.label,
      icpReasons: classification.top.reasons,
    };

    try {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as StoredResponse[];
      localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...existing]));
      setSubmitted(true);
    } catch {
      setError('Could not save response. Please try once more.');
    }
  };

  if (submitted) {
    return (
      <main className="min-h-screen bg-[#b79270] grain p-4 sm:p-8">
        <section className="card mx-auto mt-10 max-w-2xl rounded-[22px] border border-[#d4c7bb] bg-[#f5f2ee] p-8 text-center sm:mt-14 sm:p-12">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#8c6d56]">Response received</p>
          <div className="mx-auto mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-[#d8dfd2] text-2xl text-[#314936]">✓</div>
          <h1 className="mt-7 text-4xl font-semibold leading-tight text-[#221f1d]">Thank you for your perspective.</h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#5b4d43]">
            Your answers help us identify real customer profiles and build a better product with clearer priorities.
          </p>
          <p className="mt-8 text-xs text-[#7d6f64]">Your responses are used only for product research. No sales follow-up.</p>
        </section>
      </main>
    );
  }

  if (!currentSectionQuestions.length) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#b79270] grain p-4 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 text-[#221f1d]">
          <p className="text-xs font-bold uppercase tracking-[.22em]">Independent research</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Kitchen and lifestyle discovery survey</h1>
          <p className="mt-2 text-sm text-[#473c35]">About 4-6 minutes. Please answer honestly.</p>
        </header>

        <section className="card rounded-[22px] border border-[#d4c7bb] bg-[#f5f2ee] p-5 sm:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#8b674a]">{sectionName}</p>
              <p className="mt-1 text-sm text-[#6e5f54]">
                Section {sectionCursor + 1} of {sectionIds.length}
              </p>
            </div>
            <p className="text-sm font-semibold text-[#5d4635]">Required completion: {completion}%</p>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-[#e5d6c8]">
            <div className="h-full rounded-full bg-[#5d4635] transition-all" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-6 space-y-8">
            {currentSectionQuestions.map((question) => {
              const globalNumber = visibleQuestions.findIndex((item) => item.id === question.id) + 1;
              return (
                <Question key={question.id} number={globalNumber} title={question.title} helper={question.helper}>
                  {question.kind === 'single' && question.options && (
                    <SingleChoice
                      value={asString(answers[question.id])}
                      options={question.options}
                      onChange={(value) => {
                        setAnswer(question.id, value);
                        if (question.otherKey && !isOtherLabel(value)) {
                          setAnswer(question.otherKey, '');
                        }
                      }}
                    />
                  )}

                  {question.kind === 'multi' && question.options && (
                    <MultiChoice
                      value={asArray(answers[question.id])}
                      options={question.options}
                      onChange={(value) => {
                        setAnswer(question.id, value);
                        if (question.otherKey && !value.some((item) => isOtherLabel(item))) {
                          setAnswer(question.otherKey, '');
                        }
                      }}
                      max={question.max}
                    />
                  )}

                  {question.kind === 'rating' && <RatingScale value={asString(answers[question.id])} onChange={(value) => setAnswer(question.id, value)} />}

                  {question.kind === 'text' && (
                    <TextInput
                      value={asString(answers[question.id])}
                      onChange={(value) => setAnswer(question.id, value)}
                      placeholder={question.placeholder}
                      multiline={Boolean(question.multiline)}
                    />
                  )}

                  {question.otherKey && isOtherSelected(question, answers) && (
                    <div className="mt-3">
                      <TextInput
                        value={asString(answers[question.otherKey])}
                        onChange={(value) => setAnswer(question.otherKey!, value)}
                        placeholder={question.otherPlaceholder || 'Please specify'}
                        multiline={question.kind === 'multi'}
                      />
                    </div>
                  )}
                </Question>
              );
            })}
            {error && <p className="rounded-lg border border-[#dfb8a2] bg-[#fff1e8] px-3 py-2 text-sm text-[#8a4730]">{error}</p>}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={prev}
              disabled={sectionCursor === 0}
              className="rounded-xl border border-[#cfbfaf] bg-white px-4 py-2 text-sm font-semibold text-[#4d3c2f] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Back
            </button>

            {sectionCursor < sectionIds.length - 1 ? (
              <button type="button" onClick={next} className="rounded-xl bg-[#4b382b] px-5 py-2 text-sm font-semibold text-white">
                Next section
              </button>
            ) : (
              <button type="button" onClick={submit} className="rounded-xl bg-[#3f5d3f] px-5 py-2 text-sm font-semibold text-white">
                Submit response
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
