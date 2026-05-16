"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type {
  InvestmentPrinciple,
  InvestmentPrincipleSet,
  TradeJournalCheckResponse,
  TradeJournalEntry,
  TradeJournalReflectionType,
  TradeJournalReviewResponse,
  TradeJournalTodayCandidateSeedContext,
} from '@office-unify/shared-types';

const REFLECTION_TYPES: TradeJournalReflectionType[] = ['week_1', 'month_1', 'after_exit', 'manual'];
const PERSONA_OPTIONS = ['private-banker', 'drucker', 'ray-dalio', 'hindenburg', 'jim-simons', 'cio'];

type DraftState = {
  symbol: string;
  market: string;
  side: 'buy' | 'sell';
  strategyHorizon: 'long_term' | 'swing' | 'short_term';
  entryType: 'value_entry' | 'trend_follow' | 'rebalancing_buy' | 'event_driven_buy' | 'long_term_accumulate' | '';
  exitType: 'target_reached' | 'thesis_broken' | 'risk_reduction' | 'rebalancing_sell' | 'stop_loss' | 'event_avoidance' | '';
  convictionLevel: 'low' | 'medium' | 'high' | '';
  tradeDate: string;
  quantity: string;
  price: string;
  amount: string;
  thesisSummary: string;
  tradeReason: string;
  expectedScenario: string;
  invalidationCondition: string;
  emotionState: string;
  note: string;
  reviewDueAt: string;
  reflectionDueAt: string;
};

const EMPTY_DRAFT: DraftState = {
  symbol: '',
  market: 'US',
  side: 'buy',
  strategyHorizon: 'swing',
  entryType: '',
  exitType: '',
  convictionLevel: '',
  tradeDate: new Date().toISOString(),
  quantity: '',
  price: '',
  amount: '',
  thesisSummary: '',
  tradeReason: '',
  expectedScenario: '',
  invalidationCondition: '',
  emotionState: '',
  note: '',
  reviewDueAt: '',
  reflectionDueAt: '',
};

const SIDE_KO: Record<DraftState['side'], string> = { buy: '매수', sell: '매도' };
const HORIZON_KO: Record<DraftState['strategyHorizon'], string> = {
  long_term: '장기',
  swing: '스윙',
  short_term: '단기',
};
const ENTRY_KO: Record<string, string> = {
  value_entry: '가치 진입',
  trend_follow: '추세 추종',
  rebalancing_buy: '리밸런싱 매수',
  event_driven_buy: '이벤트(재료) 매수',
  long_term_accumulate: '장기 적립',
};
const EXIT_KO: Record<string, string> = {
  target_reached: '목표 도달',
  thesis_broken: '테시스 붕괴',
  risk_reduction: '리스크 축소',
  rebalancing_sell: '리밸런싱 매도',
  stop_loss: '손절',
  event_avoidance: '이벤트 회피',
};
const CONVICTION_KO: Record<NonNullable<Exclude<DraftState['convictionLevel'], ''>>, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
};

export function TradeJournalClient() {
  const searchParams = useSearchParams();
  const [pendingSeed, setPendingSeed] = useState<TradeJournalTodayCandidateSeedContext | null>(null);
  const [sets, setSets] = useState<InvestmentPrincipleSet[]>([]);
  const [principles, setPrinciples] = useState<InvestmentPrinciple[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string>('');
  const [entries, setEntries] = useState<TradeJournalEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string>('');
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [evaluation, setEvaluation] = useState<TradeJournalCheckResponse | null>(null);
  const [review, setReview] = useState<TradeJournalReviewResponse | null>(null);
  const [entryWarnings, setEntryWarnings] = useState<string[]>([]);
  const [journalStep, setJournalStep] = useState(1);
  const [holdPresets, setHoldPresets] = useState<Array<{ symbol: string; displayName?: string; market?: string }>>([]);
  const [todayPresets, setTodayPresets] = useState<Array<{ label: string; symbol: string; market: string }>>([]);
  const [selectedPersona, setSelectedPersona] = useState('private-banker');
  const [newPrinciple, setNewPrinciple] = useState({
    principleType: 'buy',
    title: '',
    ruleText: '',
    checkMethod: 'blocking_boolean',
    weight: '1',
    isBlocking: false,
    appliesTo: 'all',
    sortOrder: '0',
    ruleKey: '',
    targetMetric: '',
    operator: '',
    thresholdValue: '',
    thresholdUnit: '',
    requiresUserInput: false,
    appliesWhenJson: '{}',
    evaluationHint: '',
  });
  const [editingPrinciples, setEditingPrinciples] = useState<Record<string, Partial<InvestmentPrinciple>>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pattern, setPattern] = useState<{
    topPatterns: Array<{ code: string; title: string; count: number; severity: string; description: string; improvementHint?: string }>;
    currentRiskMatches: Array<{ code: string; title: string; reason: string }>;
  } | null>(null);
  const [reflection, setReflection] = useState({
    reflectionType: 'manual' as TradeJournalReflectionType,
    thesisOutcome: '',
    principleAlignment: '',
    whatWentWell: '',
    whatWentWrong: '',
    nextRuleAdjustment: '',
  });

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId) ?? null,
    [entries, selectedEntryId],
  );

  const loadPrinciples = async () => {
    const res = await fetch('/api/investment-principles', { credentials: 'same-origin' });
    const data = (await res.json()) as {
      sets?: InvestmentPrincipleSet[];
      selectedSetId?: string;
      principles?: InvestmentPrinciple[];
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    setSets(data.sets ?? []);
    setSelectedSetId(data.selectedSetId ?? '');
    setPrinciples(data.principles ?? []);
  };

  const loadEntries = async () => {
    const res = await fetch('/api/trade-journal?limit=80', { credentials: 'same-origin' });
    const data = (await res.json()) as { items?: TradeJournalEntry[]; error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    setEntries(data.items ?? []);
  };

  const loadPattern = async () => {
    const res = await fetch('/api/trade-journal/pattern-analysis', { credentials: 'same-origin' });
    const data = (await res.json()) as {
      topPatterns?: Array<{ code: string; title: string; count: number; severity: string; description: string; improvementHint?: string }>;
      currentRiskMatches?: Array<{ code: string; title: string; reason: string }>;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    setPattern({ topPatterns: data.topPatterns ?? [], currentRiskMatches: data.currentRiskMatches ?? [] });
  };

  useEffect(() => {
    const src = searchParams.get('seedSource');
    if (src !== 'today_candidate') return;
    const stockCode = searchParams.get('seedStockCode') ?? searchParams.get('seedSymbol') ?? '';
    const market = (searchParams.get('seedMarket') ?? 'KR').toUpperCase();
    const trace = searchParams.get('seedTrace') ?? '';
    const seed: TradeJournalTodayCandidateSeedContext = {
      source: 'today_candidate',
      stockCode: stockCode || undefined,
      symbol: stockCode || undefined,
      market,
      decisionTraceSummary: trace || undefined,
    };
    setPendingSeed(seed);
    setDraft((d) => ({
      ...d,
      symbol: stockCode || d.symbol,
      market: market === 'US' ? 'US' : 'KR',
    }));
  }, [searchParams]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setMessage(null);
      try {
        await Promise.all([loadPrinciples(), loadEntries(), loadPattern()]);
        const [ovRes, tbRes] = await Promise.all([
          fetch('/api/dashboard/overview', { credentials: 'same-origin' }),
          fetch('/api/dashboard/today-brief', { credentials: 'same-origin' }),
        ]);
        if (ovRes.ok) {
          const ov = (await ovRes.json()) as {
            portfolio?: { topPositions?: Array<{ symbol: string; displayName?: string; market?: string }> };
          };
          setHoldPresets(ov.portfolio?.topPositions ?? []);
        }
        if (tbRes.ok) {
          const tb = (await tbRes.json()) as {
            primaryCandidateDeck?: Array<{ name: string; stockCode?: string; symbol?: string; market: string }>;
          };
          setTodayPresets(
            (tb.primaryCandidateDeck ?? []).map((c) => ({
              label: c.name,
              symbol: String(c.stockCode ?? c.symbol ?? '').replace(/^KR:/, ''),
              market: c.market === 'US' ? 'US' : 'KR',
            })),
          );
        }
      } catch (error: unknown) {
        setMessage(error instanceof Error ? error.message : '초기 로드 실패');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toEntryPayload = () => ({
    symbol: draft.symbol,
    market: draft.market,
    side: draft.side,
    strategyHorizon: draft.strategyHorizon,
    entryType: draft.side === 'buy' ? (draft.entryType || undefined) : undefined,
    exitType: draft.side === 'sell' ? (draft.exitType || undefined) : undefined,
    convictionLevel: draft.convictionLevel || undefined,
    tradeDate: draft.tradeDate,
    quantity: draft.quantity ? Number(draft.quantity) : undefined,
    price: draft.price ? Number(draft.price) : undefined,
    amount: draft.amount ? Number(draft.amount) : undefined,
    thesisSummary: draft.thesisSummary || undefined,
    tradeReason: draft.tradeReason || undefined,
    expectedScenario: draft.expectedScenario || undefined,
    invalidationCondition: draft.invalidationCondition || undefined,
    emotionState: draft.emotionState || undefined,
    note: draft.note || undefined,
    reviewDueAt: draft.reviewDueAt || undefined,
    reflectionDueAt: draft.reflectionDueAt || undefined,
  });

  const runCheck = async () => {
    setMessage(null);
    const res = await fetch('/api/trade-journal/check', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: toEntryPayload(), selectedPrincipleSetId: selectedSetId }),
    });
    const data = (await res.json()) as TradeJournalCheckResponse & { error?: string; warnings?: string[] };
    if (!res.ok) throw new Error([data.error, ...(data.warnings ?? [])].filter(Boolean).join(' | '));
    setEvaluation(data);
    setEntryWarnings(data.warnings ?? []);
  };

  const saveJournal = async () => {
    setMessage(null);
    const res = await fetch('/api/trade-journal', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry: toEntryPayload(),
        selectedPrincipleSetId: selectedSetId,
        requireNoBlockingViolation: false,
        ...(pendingSeed ? { seedContext: pendingSeed } : {}),
      }),
    });
    const data = (await res.json()) as { error?: string; warnings?: string[]; entry?: TradeJournalEntry };
    if (!res.ok) throw new Error([data.error, ...(data.warnings ?? [])].filter(Boolean).join(' | '));
    setMessage('매매일지를 저장했습니다.');
    setEntryWarnings(data.warnings ?? []);
    setDraft(EMPTY_DRAFT);
    setEvaluation(null);
    setPendingSeed(null);
    await loadEntries();
    if (data.entry?.id) setSelectedEntryId(data.entry.id);
  };

  const createPrinciple = async () => {
    setMessage(null);
    try {
      let appliesWhenJson: Record<string, unknown> = {};
      try {
        appliesWhenJson = JSON.parse(newPrinciple.appliesWhenJson || '{}') as Record<string, unknown>;
      } catch {
        throw new Error('applies_when_json 형식이 올바른 JSON이 아닙니다.');
      }
      const res = await fetch('/api/investment-principles', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          principleSetId: selectedSetId,
          principleType: newPrinciple.principleType,
          title: newPrinciple.title,
          ruleText: newPrinciple.ruleText,
          checkMethod: newPrinciple.checkMethod,
          weight: Number(newPrinciple.weight),
          isBlocking: newPrinciple.isBlocking,
          appliesTo: newPrinciple.appliesTo,
          sortOrder: Number(newPrinciple.sortOrder),
          ruleKey: newPrinciple.ruleKey || undefined,
          targetMetric: newPrinciple.targetMetric || undefined,
          operator: newPrinciple.operator || undefined,
          thresholdValue: newPrinciple.thresholdValue ? Number(newPrinciple.thresholdValue) : undefined,
          thresholdUnit: newPrinciple.thresholdUnit || undefined,
          requiresUserInput: newPrinciple.requiresUserInput,
          appliesWhenJson,
          evaluationHint: newPrinciple.evaluationHint || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; warnings?: string[] };
      if (!res.ok) throw new Error([data.error, ...(data.warnings ?? [])].filter(Boolean).join(' | '));
      setNewPrinciple({
        principleType: 'buy',
        title: '',
        ruleText: '',
        checkMethod: 'blocking_boolean',
        weight: '1',
        isBlocking: false,
        appliesTo: 'all',
        sortOrder: '0',
        ruleKey: '',
        targetMetric: '',
        operator: '',
        thresholdValue: '',
        thresholdUnit: '',
        requiresUserInput: false,
        appliesWhenJson: '{}',
        evaluationHint: '',
      });
      await loadPrinciples();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '원칙 추가 실패');
    }
  };

  const savePrinciplePatch = async (principleId: string) => {
    const patch = editingPrinciples[principleId];
    if (!patch) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/investment-principles/${principleId}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { error?: string; warnings?: string[] };
      if (!res.ok) throw new Error([data.error, ...(data.warnings ?? [])].filter(Boolean).join(' | '));
      setEditingPrinciples((prev) => {
        const next = { ...prev };
        delete next[principleId];
        return next;
      });
      await loadPrinciples();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '원칙 수정 실패');
    }
  };

  const runReview = async () => {
    setMessage(null);
    if (!evaluation) {
      setMessage('먼저 자동 점검을 실행하세요.');
      return;
    }
    const res = await fetch('/api/trade-journal/review', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedPersona,
        entry: toEntryPayload(),
        evaluation,
        selectedPrincipleSetId: selectedSetId,
        tradeJournalEntryId: selectedEntry?.id,
      }),
    });
    const data = (await res.json()) as TradeJournalReviewResponse & { error?: string; warnings?: string[] };
    if (!res.ok) throw new Error([data.error, ...(data.warnings ?? [])].filter(Boolean).join(' | '));
    setReview(data);
  };

  const saveReflection = async () => {
    if (!selectedEntry) {
      setMessage('저장된 매매일지를 먼저 선택하세요.');
      return;
    }
    setMessage(null);
    const res = await fetch('/api/trade-journal/reflection', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tradeJournalEntryId: selectedEntry.id,
        ...reflection,
      }),
    });
    const data = (await res.json()) as { error?: string; warnings?: string[] };
    if (!res.ok) throw new Error([data.error, ...(data.warnings ?? [])].filter(Boolean).join(' | '));
    setMessage('회고를 저장했습니다.');
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 bg-slate-50 p-6 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight text-slate-800">Trade Journal · 원칙 기반 점검</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/trade-journal/analytics" className="text-slate-500 underline underline-offset-4 hover:text-slate-800">
            누적 분석
          </Link>
          <Link href="/" className="text-slate-500 underline underline-offset-4 hover:text-slate-800">
            ← dev_support 홈
          </Link>
        </div>
      </div>
      {message ? <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{message}</div> : null}
      {pendingSeed?.source === 'today_candidate' ? (
        <div className="rounded border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-950">
          <p className="font-semibold">당시 후보 판단 (시드)</p>
          <p className="mt-1 text-violet-900">
            종목 {pendingSeed.stockCode ?? pendingSeed.symbol ?? '—'} · 시장 {pendingSeed.market ?? '—'}
          </p>
          {pendingSeed.decisionTraceSummary ? (
            <p className="mt-1 text-violet-800">요약: {pendingSeed.decisionTraceSummary}</p>
          ) : null}
          <p className="mt-1 text-[10px] text-violet-800">
            저장 시 메모에 자동으로 붙습니다. 매수·매도 지시 아님.
          </p>
        </div>
      ) : null}
      {loading ? <p className="text-sm text-slate-500">로딩 중…</p> : null}
      <section className="rounded-xl border border-violet-200 bg-violet-50 p-4">
        <h2 className="text-sm font-semibold text-violet-900">Pattern Analysis</h2>
        {(pattern?.topPatterns ?? []).length === 0 ? (
          <p className="mt-2 text-xs text-violet-900">NO_DATA</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs text-violet-900">
            {(pattern?.topPatterns ?? []).slice(0, 5).map((p) => (
              <li key={p.code} className="rounded border border-violet-100 bg-white p-2">
                <p className="font-medium">{p.title} ({p.count}회)</p>
                <p className="mt-1">{p.description}</p>
              </li>
            ))}
          </ul>
        )}
        {(pattern?.currentRiskMatches ?? []).length > 0 ? (
          <ul className="mt-2 list-disc pl-4 text-xs text-violet-900">
            {(pattern?.currentRiskMatches ?? []).map((r) => <li key={r.code}>{r.title}: {r.reason}</li>)}
          </ul>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">원칙 관리</h2>
        <p className="mt-1 text-xs text-slate-500">원칙(checklist)이 1차 필터, PB/페르소나는 2차 검토자입니다.</p>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <select
            value={selectedSetId}
            onChange={async (e) => {
              const next = e.target.value;
              setSelectedSetId(next);
              const all = await fetch(`/api/investment-principles?setId=${encodeURIComponent(next)}`, { credentials: 'same-origin' }).then((r) => r.json());
              setPrinciples(all.principles ?? []);
            }}
            className="rounded border border-slate-200 px-2 py-1 text-sm"
          >
            {sets.map((set) => (
              <option key={set.id} value={set.id}>{set.name}{set.isDefault ? ' (default)' : ''}</option>
            ))}
          </select>
          <input
            value={newPrinciple.title}
            onChange={(e) => setNewPrinciple((prev) => ({ ...prev, title: e.target.value }))}
            className="rounded border border-slate-200 px-2 py-1 text-sm"
            placeholder="원칙 제목"
          />
          <input
            value={newPrinciple.ruleText}
            onChange={(e) => setNewPrinciple((prev) => ({ ...prev, ruleText: e.target.value }))}
            className="rounded border border-slate-200 px-2 py-1 text-sm"
            placeholder="원칙 설명"
          />
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-5">
          <select value={newPrinciple.principleType} onChange={(e) => setNewPrinciple((prev) => ({ ...prev, principleType: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm">
            <option value="buy">buy</option>
            <option value="sell">sell</option>
            <option value="common">common</option>
            <option value="risk">risk</option>
          </select>
          <select value={newPrinciple.checkMethod} onChange={(e) => setNewPrinciple((prev) => ({ ...prev, checkMethod: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm">
            <option value="blocking_boolean">blocking_boolean</option>
            <option value="boolean">boolean</option>
            <option value="threshold_numeric">threshold_numeric</option>
            <option value="portfolio_exposure">portfolio_exposure</option>
            <option value="score">score</option>
            <option value="manual">manual</option>
          </select>
          <input value={newPrinciple.weight} onChange={(e) => setNewPrinciple((prev) => ({ ...prev, weight: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm" placeholder="weight" />
          <select value={newPrinciple.appliesTo} onChange={(e) => setNewPrinciple((prev) => ({ ...prev, appliesTo: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm">
            <option value="all">all</option>
            <option value="long_term">long_term</option>
            <option value="swing">swing</option>
            <option value="short_term">short_term</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={newPrinciple.isBlocking} onChange={(e) => setNewPrinciple((prev) => ({ ...prev, isBlocking: e.target.checked }))} />
            blocking
          </label>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input value={newPrinciple.ruleKey} onChange={(e) => setNewPrinciple((prev) => ({ ...prev, ruleKey: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm" placeholder="rule_key" />
          <input value={newPrinciple.targetMetric} onChange={(e) => setNewPrinciple((prev) => ({ ...prev, targetMetric: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm" placeholder="target_metric" />
          <input value={newPrinciple.operator} onChange={(e) => setNewPrinciple((prev) => ({ ...prev, operator: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm" placeholder="operator" />
          <input value={newPrinciple.thresholdValue} onChange={(e) => setNewPrinciple((prev) => ({ ...prev, thresholdValue: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm" placeholder="threshold_value" />
          <input value={newPrinciple.thresholdUnit} onChange={(e) => setNewPrinciple((prev) => ({ ...prev, thresholdUnit: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm" placeholder="threshold_unit" />
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={newPrinciple.requiresUserInput} onChange={(e) => setNewPrinciple((prev) => ({ ...prev, requiresUserInput: e.target.checked }))} />
            requires_user_input
          </label>
          <input value={newPrinciple.evaluationHint} onChange={(e) => setNewPrinciple((prev) => ({ ...prev, evaluationHint: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm" placeholder="evaluation_hint" />
          <input value={newPrinciple.appliesWhenJson} onChange={(e) => setNewPrinciple((prev) => ({ ...prev, appliesWhenJson: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm" placeholder='applies_when_json {"side":"buy"}' />
        </div>
        <button type="button" onClick={() => void createPrinciple()} className="mt-2 rounded border border-slate-300 bg-white px-3 py-1 text-xs">원칙 추가</button>
        <ul className="mt-3 space-y-1 text-xs">
          {principles.map((principle) => (
            <li key={principle.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span>[{principle.principleType}] {principle.title}</span>
                <span>{principle.checkMethod}</span>
                <span>{principle.isBlocking ? 'blocking' : 'non-blocking'}</span>
              </div>
              <div className="mt-1 grid gap-1 md:grid-cols-4">
                <input
                  defaultValue={principle.title}
                  onChange={(e) => setEditingPrinciples((prev) => ({ ...prev, [principle.id]: { ...(prev[principle.id] ?? {}), title: e.target.value } }))}
                  className="rounded border border-slate-200 px-1 py-0.5"
                />
                <input
                  defaultValue={principle.ruleText}
                  onChange={(e) => setEditingPrinciples((prev) => ({ ...prev, [principle.id]: { ...(prev[principle.id] ?? {}), ruleText: e.target.value } }))}
                  className="rounded border border-slate-200 px-1 py-0.5"
                />
                <input
                  defaultValue={principle.targetMetric ?? ''}
                  onChange={(e) => setEditingPrinciples((prev) => ({ ...prev, [principle.id]: { ...(prev[principle.id] ?? {}), targetMetric: e.target.value } }))}
                  className="rounded border border-slate-200 px-1 py-0.5"
                  placeholder="target_metric"
                />
                <input
                  defaultValue={principle.thresholdValue ?? ''}
                  onChange={(e) => setEditingPrinciples((prev) => ({ ...prev, [principle.id]: { ...(prev[principle.id] ?? {}), thresholdValue: Number(e.target.value) } }))}
                  className="rounded border border-slate-200 px-1 py-0.5"
                  placeholder="threshold"
                />
              </div>
              <button type="button" onClick={() => void savePrinciplePatch(principle.id)} className="mt-1 rounded border border-slate-300 bg-white px-2 py-0.5">
                원칙 수정 저장
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">매매일지 · 복기 플로우</h2>
        <p className="mt-1 text-xs text-slate-500">
          단계별 입력(모바일 친화). 관찰·복기용 기록이며 자동 주문·매수 권유가 아닙니다.
        </p>
        <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
          {(
            [
              [1, '종목'],
              [2, '행동'],
              [3, '이유'],
              [4, '원칙'],
              [5, '복ㆍ저장'],
            ] as const
          ).map(([s, label]) => (
            <button
              key={s}
              type="button"
              onClick={() => setJournalStep(s)}
              className={`rounded px-2 py-1 ${journalStep === s ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-800'}`}
            >
              {s}. {label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {journalStep === 1 ? (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">종목명 / 티커</label>
              <input
                value={draft.symbol}
                onChange={(e) => setDraft((prev) => ({ ...prev, symbol: e.target.value }))}
                className="w-full rounded border border-slate-200 px-2 py-2 text-sm"
                placeholder="티커 또는 종목코드"
              />
              <label className="block text-xs font-medium text-slate-700">시장</label>
              <select
                value={draft.market}
                onChange={(e) => setDraft((prev) => ({ ...prev, market: e.target.value }))}
                className="w-full rounded border border-slate-200 px-2 py-2 text-sm"
              >
                <option value="KR">한국 (KR)</option>
                <option value="US">미국 (US)</option>
              </select>
              <p className="text-[11px] font-medium text-slate-700">보유 종목에서 불러오기</p>
              <div className="flex flex-wrap gap-1">
                {holdPresets.length === 0 ? (
                  <span className="text-[11px] text-slate-500">목록 없음</span>
                ) : (
                  holdPresets.map((h) => (
                    <button
                      key={`${h.market}:${h.symbol}`}
                      type="button"
                      className="rounded border border-slate-200 px-2 py-1 text-[11px]"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          symbol: h.symbol,
                          market: h.market === 'US' ? 'US' : 'KR',
                        }))
                      }
                    >
                      {h.displayName ?? h.symbol}
                    </button>
                  ))
                )}
              </div>
              <p className="text-[11px] font-medium text-slate-700">오늘 후보에서 불러오기</p>
              <div className="flex flex-wrap gap-1">
                {todayPresets.length === 0 ? (
                  <span className="text-[11px] text-slate-500">후보 없음</span>
                ) : (
                  todayPresets.map((t) => (
                    <button
                      key={`${t.market}:${t.symbol}:${t.label}`}
                      type="button"
                      className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-[11px]"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          symbol: t.symbol,
                          market: t.market,
                        }))
                      }
                    >
                      {t.label}
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {journalStep === 2 ? (
            <div className="grid gap-2">
              <label className="text-xs font-medium text-slate-700">매매 행동</label>
              <select
                value={draft.side}
                onChange={(e) => setDraft((prev) => ({ ...prev, side: e.target.value as 'buy' | 'sell' }))}
                className="rounded border border-slate-200 px-2 py-2 text-sm"
              >
                <option value="buy">{SIDE_KO.buy}</option>
                <option value="sell">{SIDE_KO.sell}</option>
              </select>
              <label className="text-xs font-medium text-slate-700">매매 유형</label>
              <select
                value={draft.strategyHorizon}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, strategyHorizon: e.target.value as DraftState['strategyHorizon'] }))
                }
                className="rounded border border-slate-200 px-2 py-2 text-sm"
              >
                {(Object.keys(HORIZON_KO) as DraftState['strategyHorizon'][]).map((k) => (
                  <option key={k} value={k}>
                    {HORIZON_KO[k]}
                  </option>
                ))}
              </select>
              <label className="text-xs font-medium text-slate-700">확신 수준 (선택)</label>
              <select
                value={draft.convictionLevel}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, convictionLevel: e.target.value as DraftState['convictionLevel'] }))
                }
                className="rounded border border-slate-200 px-2 py-2 text-sm"
              >
                <option value="">선택 안 함</option>
                {(Object.keys(CONVICTION_KO) as Array<Exclude<DraftState['convictionLevel'], ''>>).map((k) => (
                  <option key={k} value={k}>
                    {CONVICTION_KO[k]}
                  </option>
                ))}
              </select>
              <label className="text-xs font-medium text-slate-700">수량</label>
              <input
                value={draft.quantity}
                onChange={(e) => setDraft((prev) => ({ ...prev, quantity: e.target.value }))}
                className="rounded border border-slate-200 px-2 py-2 text-sm"
                placeholder="수량"
              />
              <label className="text-xs font-medium text-slate-700">체결가</label>
              <input
                value={draft.price}
                onChange={(e) => setDraft((prev) => ({ ...prev, price: e.target.value }))}
                className="rounded border border-slate-200 px-2 py-2 text-sm"
                placeholder="체결가"
              />
              <label className="text-xs font-medium text-slate-700">금액 (선택)</label>
              <input
                value={draft.amount}
                onChange={(e) => setDraft((prev) => ({ ...prev, amount: e.target.value }))}
                className="rounded border border-slate-200 px-2 py-2 text-sm"
                placeholder="금액"
              />
              <label className="text-xs font-medium text-slate-700">체결 시각 (ISO)</label>
              <input
                value={draft.tradeDate}
                onChange={(e) => setDraft((prev) => ({ ...prev, tradeDate: e.target.value }))}
                className="rounded border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
          ) : null}

          {journalStep === 3 ? (
            <div className="grid gap-2">
              {draft.side === 'buy' ? (
                <>
                  <label className="text-xs font-medium text-slate-700">진입 근거</label>
                  <select
                    value={draft.entryType}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        entryType: e.target.value as DraftState['entryType'],
                        exitType: '',
                      }))
                    }
                    className="rounded border border-slate-200 px-2 py-2 text-sm"
                  >
                    <option value="">선택</option>
                    {(Object.keys(ENTRY_KO) as Array<Exclude<DraftState['entryType'], ''>>).map((k) => (
                      <option key={k} value={k}>
                        {ENTRY_KO[k] ?? k}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="text-xs font-medium text-slate-700">청산/매도 유형</label>
                  <select
                    value={draft.exitType}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        exitType: e.target.value as DraftState['exitType'],
                        entryType: '',
                      }))
                    }
                    className="rounded border border-slate-200 px-2 py-2 text-sm"
                  >
                    <option value="">선택</option>
                    {(Object.keys(EXIT_KO) as Array<Exclude<DraftState['exitType'], ''>>).map((k) => (
                      <option key={k} value={k}>
                        {EXIT_KO[k] ?? k}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <textarea
                value={draft.tradeReason}
                onChange={(e) => setDraft((prev) => ({ ...prev, tradeReason: e.target.value }))}
                className="min-h-[72px] w-full rounded border border-slate-200 px-2 py-2 text-sm"
                placeholder="진입/청산 이유 (한 줄 요약부터)"
              />
              <textarea
                value={draft.expectedScenario}
                onChange={(e) => setDraft((prev) => ({ ...prev, expectedScenario: e.target.value }))}
                className="min-h-[64px] w-full rounded border border-slate-200 px-2 py-2 text-sm"
                placeholder="기대 시나리오"
              />
              <textarea
                value={draft.invalidationCondition}
                onChange={(e) => setDraft((prev) => ({ ...prev, invalidationCondition: e.target.value }))}
                className="min-h-[64px] w-full rounded border border-slate-200 px-2 py-2 text-sm"
                placeholder="생각이 틀렸다고 볼 조건 (무효화)"
              />
            </div>
          ) : null}

          {journalStep === 4 ? (
            <div className="grid gap-2">
              <label className="text-xs font-medium text-slate-700">테시스 요약</label>
              <textarea
                value={draft.thesisSummary}
                onChange={(e) => setDraft((prev) => ({ ...prev, thesisSummary: e.target.value }))}
                className="min-h-[70px] w-full rounded border border-slate-200 px-2 py-2 text-sm"
                placeholder="왜 이 종목인지, 기간·근거를 짧게"
              />
              <label className="text-xs font-medium text-slate-700">감정·컨디션 (선택)</label>
              <input
                value={draft.emotionState}
                onChange={(e) => setDraft((prev) => ({ ...prev, emotionState: e.target.value }))}
                className="rounded border border-slate-200 px-2 py-2 text-sm"
                placeholder="예: 초조함 / 차분함"
              />
              <button
                type="button"
                onClick={() => void runCheck()}
                className="mt-1 w-full rounded bg-slate-900 px-3 py-2 text-sm text-white md:w-auto"
              >
                원칙 자동 점검 실행
              </button>
              {evaluation && evaluation.blockingViolationCount > 0 ? (
                <p className="text-[11px] text-amber-800">
                  원칙 위반 가능성이 있습니다. 저장은 가능하나 복기 시 반드시 확인하세요.
                </p>
              ) : null}
            </div>
          ) : null}

          {journalStep === 5 ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">복기 메모</label>
              <textarea
                value={draft.note}
                onChange={(e) => setDraft((prev) => ({ ...prev, note: e.target.value }))}
                className="min-h-[88px] w-full rounded border border-slate-200 px-2 py-2 text-sm"
                placeholder="다시 보면 알고 싶은 점, 다음에 고칠 점"
              />
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-800">
                <p className="font-semibold text-slate-900">저장 전 요약</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  <li>
                    종목: {draft.symbol || '—'} · 시장: {draft.market} · 행동: {SIDE_KO[draft.side]} · 유형:{' '}
                    {HORIZON_KO[draft.strategyHorizon]}
                  </li>
                  <li>
                    수량/가격: {draft.quantity || '—'} / {draft.price || '—'} · 확신:{' '}
                    {draft.convictionLevel ? CONVICTION_KO[draft.convictionLevel as keyof typeof CONVICTION_KO] : '—'}
                  </li>
                  <li>
                    근거:{' '}
                    {draft.side === 'buy'
                      ? draft.entryType
                        ? ENTRY_KO[draft.entryType as keyof typeof ENTRY_KO]
                        : '—'
                      : draft.exitType
                        ? EXIT_KO[draft.exitType as keyof typeof EXIT_KO]
                        : '—'}
                  </li>
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveJournal()}
                  className="rounded border border-slate-800 bg-white px-3 py-2 text-sm font-medium"
                >
                  일지 저장
                </button>
                <select
                  value={selectedPersona}
                  onChange={(e) => setSelectedPersona(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-2 text-sm"
                >
                  {PERSONA_OPTIONS.map((persona) => (
                    <option key={persona} value={persona}>
                      {persona}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void runReview()}
                  className="rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm text-indigo-900"
                >
                  페르소나 검토
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex justify-between gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            className="rounded border border-slate-200 px-3 py-2 text-sm"
            disabled={journalStep <= 1}
            onClick={() => setJournalStep((s) => Math.max(1, s - 1))}
          >
            이전
          </button>
          <button
            type="button"
            className="rounded border border-slate-200 px-3 py-2 text-sm"
            disabled={journalStep >= 5}
            onClick={() => setJournalStep((s) => Math.min(5, s + 1))}
          >
            다음
          </button>
        </div>
        {draft.side === 'sell' ? (
          <p className="mt-2 text-[11px] text-amber-700">
            매도 기록: 왜 파는지, 테시스 붕괴 여부, 감정 반응인지, 리스크 축소 근거를 남기면 복기에 유리합니다.
          </p>
        ) : null}
      </section>
      {entryWarnings.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {entryWarnings.map((warning) => <p key={warning}>- {warning}</p>)}
        </section>
      ) : null}

      {evaluation ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">자동 점검 결과</h2>
          <p className="mt-1 text-sm text-slate-700">{evaluation.summary}</p>
          <p className="mt-1 text-xs text-slate-500">
            원칙 충족률 {evaluation.checklistScore}% · met {evaluation.checklistMetCount}/{evaluation.checklistTotalCount} · blocking 위반 {evaluation.blockingViolationCount}건
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {evaluation.details.map((detail) => (
              <li key={`${detail.principleId}-${detail.title}`} className={`rounded border px-2 py-1 ${detail.isBlocking && detail.status === 'not_met' ? 'border-red-300 bg-red-50 text-red-900' : 'border-slate-200 bg-slate-50'}`}>
                <span className="font-semibold">{detail.title}</span> · {detail.status} {detail.isBlocking ? '(blocking)' : ''} · {detail.explanation}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {review ? (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-indigo-900">PB / 페르소나 검토</h2>
          <p className="mt-1 text-sm text-indigo-900">{review.reviewSummary}</p>
          <p className="mt-1 text-xs text-indigo-700">verdict: {review.verdict} · agreement: {review.agreementLevel}</p>
          <p className="mt-2 text-xs font-semibold text-indigo-800">놓친 점검</p>
          <ul className="list-disc pl-4 text-xs text-indigo-900">{review.missingChecks.map((item) => <li key={item}>{item}</li>)}</ul>
          <p className="mt-2 text-xs font-semibold text-indigo-800">리스크</p>
          <ul className="list-disc pl-4 text-xs text-indigo-900">{review.risks.map((item) => <li key={item}>{item}</li>)}</ul>
          <p className="mt-2 text-xs font-semibold text-indigo-800">다음 행동</p>
          <ul className="list-disc pl-4 text-xs text-indigo-900">{review.nextActions.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">저장된 매매일지 / 회고</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div className="max-h-[280px] space-y-1 overflow-auto rounded border border-slate-200 p-2">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedEntryId(entry.id)}
                className={`w-full rounded border px-2 py-1 text-left text-xs ${selectedEntryId === entry.id ? 'border-slate-800 bg-slate-100' : 'border-slate-200 bg-white'}`}
              >
                {entry.tradeDate.slice(0, 10)} · {entry.side} · {entry.symbol} · {entry.strategyHorizon ?? '-'}
              </button>
            ))}
          </div>
          <div className="space-y-2 rounded border border-slate-200 p-2 text-xs">
            <p className="font-semibold text-slate-700">선택 항목: {selectedEntry ? `${selectedEntry.symbol} (${selectedEntry.side})` : '-'}</p>
            <select value={reflection.reflectionType} onChange={(e) => setReflection((prev) => ({ ...prev, reflectionType: e.target.value as TradeJournalReflectionType }))} className="w-full rounded border border-slate-200 px-2 py-1">
              {REFLECTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <textarea value={reflection.thesisOutcome} onChange={(e) => setReflection((prev) => ({ ...prev, thesisOutcome: e.target.value }))} className="min-h-[50px] w-full rounded border border-slate-200 px-2 py-1" placeholder="thesis 결과" />
            <textarea value={reflection.principleAlignment} onChange={(e) => setReflection((prev) => ({ ...prev, principleAlignment: e.target.value }))} className="min-h-[50px] w-full rounded border border-slate-200 px-2 py-1" placeholder="원칙 부합도" />
            <textarea value={reflection.whatWentWell} onChange={(e) => setReflection((prev) => ({ ...prev, whatWentWell: e.target.value }))} className="min-h-[50px] w-full rounded border border-slate-200 px-2 py-1" placeholder="잘한 점" />
            <textarea value={reflection.whatWentWrong} onChange={(e) => setReflection((prev) => ({ ...prev, whatWentWrong: e.target.value }))} className="min-h-[50px] w-full rounded border border-slate-200 px-2 py-1" placeholder="아쉬운 점" />
            <textarea value={reflection.nextRuleAdjustment} onChange={(e) => setReflection((prev) => ({ ...prev, nextRuleAdjustment: e.target.value }))} className="min-h-[50px] w-full rounded border border-slate-200 px-2 py-1" placeholder="다음 원칙 보정" />
            <button type="button" onClick={() => void saveReflection()} className="rounded border border-slate-300 bg-white px-3 py-1">회고 저장</button>
          </div>
        </div>
      </section>
    </div>
  );
}

