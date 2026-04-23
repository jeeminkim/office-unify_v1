"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  InvestmentPrinciple,
  InvestmentPrincipleSet,
  TradeJournalCheckResponse,
  TradeJournalEntry,
  TradeJournalReflectionType,
  TradeJournalReviewResponse,
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

export function TradeJournalClient() {
  const [sets, setSets] = useState<InvestmentPrincipleSet[]>([]);
  const [principles, setPrinciples] = useState<InvestmentPrinciple[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string>('');
  const [entries, setEntries] = useState<TradeJournalEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string>('');
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [evaluation, setEvaluation] = useState<TradeJournalCheckResponse | null>(null);
  const [review, setReview] = useState<TradeJournalReviewResponse | null>(null);
  const [entryWarnings, setEntryWarnings] = useState<string[]>([]);
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

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setMessage(null);
      try {
        await Promise.all([loadPrinciples(), loadEntries()]);
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
      }),
    });
    const data = (await res.json()) as { error?: string; warnings?: string[]; entry?: TradeJournalEntry };
    if (!res.ok) throw new Error([data.error, ...(data.warnings ?? [])].filter(Boolean).join(' | '));
    setMessage('매매일지를 저장했습니다.');
    setEntryWarnings(data.warnings ?? []);
    setDraft(EMPTY_DRAFT);
    setEvaluation(null);
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
      {loading ? <p className="text-sm text-slate-500">로딩 중…</p> : null}

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
        <h2 className="text-sm font-semibold text-slate-800">매매일지 입력</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input value={draft.symbol} onChange={(e) => setDraft((prev) => ({ ...prev, symbol: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm" placeholder="symbol" />
          <input value={draft.market} onChange={(e) => setDraft((prev) => ({ ...prev, market: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm" placeholder="market" />
          <select value={draft.side} onChange={(e) => setDraft((prev) => ({ ...prev, side: e.target.value as 'buy' | 'sell' }))} className="rounded border border-slate-200 px-2 py-1 text-sm">
            <option value="buy">buy</option>
            <option value="sell">sell</option>
          </select>
          <select value={draft.strategyHorizon} onChange={(e) => setDraft((prev) => ({ ...prev, strategyHorizon: e.target.value as 'long_term' | 'swing' | 'short_term' }))} className="rounded border border-slate-200 px-2 py-1 text-sm">
            <option value="long_term">long_term</option>
            <option value="swing">swing</option>
            <option value="short_term">short_term</option>
          </select>
          {draft.side === 'buy' ? (
            <select value={draft.entryType} onChange={(e) => setDraft((prev) => ({ ...prev, entryType: e.target.value as DraftState['entryType'], exitType: '' }))} className="rounded border border-slate-200 px-2 py-1 text-sm">
              <option value="">entry_type</option>
              <option value="value_entry">value_entry</option>
              <option value="trend_follow">trend_follow</option>
              <option value="rebalancing_buy">rebalancing_buy</option>
              <option value="event_driven_buy">event_driven_buy</option>
              <option value="long_term_accumulate">long_term_accumulate</option>
            </select>
          ) : (
            <select value={draft.exitType} onChange={(e) => setDraft((prev) => ({ ...prev, exitType: e.target.value as DraftState['exitType'], entryType: '' }))} className="rounded border border-slate-200 px-2 py-1 text-sm">
              <option value="">exit_type</option>
              <option value="target_reached">target_reached</option>
              <option value="thesis_broken">thesis_broken</option>
              <option value="risk_reduction">risk_reduction</option>
              <option value="rebalancing_sell">rebalancing_sell</option>
              <option value="stop_loss">stop_loss</option>
              <option value="event_avoidance">event_avoidance</option>
            </select>
          )}
          <select value={draft.convictionLevel} onChange={(e) => setDraft((prev) => ({ ...prev, convictionLevel: e.target.value as DraftState['convictionLevel'] }))} className="rounded border border-slate-200 px-2 py-1 text-sm">
            <option value="">conviction_level</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
          <input value={draft.quantity} onChange={(e) => setDraft((prev) => ({ ...prev, quantity: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm" placeholder="quantity" />
          <input value={draft.price} onChange={(e) => setDraft((prev) => ({ ...prev, price: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm" placeholder="price" />
          <input value={draft.amount} onChange={(e) => setDraft((prev) => ({ ...prev, amount: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm" placeholder="amount" />
          <input value={draft.tradeDate} onChange={(e) => setDraft((prev) => ({ ...prev, tradeDate: e.target.value }))} className="rounded border border-slate-200 px-2 py-1 text-sm" placeholder="tradeDate(ISO)" />
        </div>
        <textarea value={draft.tradeReason} onChange={(e) => setDraft((prev) => ({ ...prev, tradeReason: e.target.value }))} className="mt-2 min-h-[80px] w-full rounded border border-slate-200 px-2 py-1 text-sm" placeholder="거래 이유" />
        <textarea value={draft.expectedScenario} onChange={(e) => setDraft((prev) => ({ ...prev, expectedScenario: e.target.value }))} className="mt-2 min-h-[80px] w-full rounded border border-slate-200 px-2 py-1 text-sm" placeholder="기대 시나리오" />
        <textarea value={draft.invalidationCondition} onChange={(e) => setDraft((prev) => ({ ...prev, invalidationCondition: e.target.value }))} className="mt-2 min-h-[80px] w-full rounded border border-slate-200 px-2 py-1 text-sm" placeholder="틀릴 수 있는 조건" />
        <textarea value={draft.thesisSummary} onChange={(e) => setDraft((prev) => ({ ...prev, thesisSummary: e.target.value }))} className="mt-2 min-h-[70px] w-full rounded border border-slate-200 px-2 py-1 text-sm" placeholder="thesis 요약" />
        <input value={draft.emotionState} onChange={(e) => setDraft((prev) => ({ ...prev, emotionState: e.target.value }))} className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm" placeholder="감정 상태" />
        <textarea value={draft.note} onChange={(e) => setDraft((prev) => ({ ...prev, note: e.target.value }))} className="mt-2 min-h-[70px] w-full rounded border border-slate-200 px-2 py-1 text-sm" placeholder="메모" />

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void runCheck()} className="rounded bg-slate-900 px-3 py-1 text-xs text-white">자동 점검</button>
          <button type="button" onClick={() => void saveJournal()} className="rounded border border-slate-300 bg-white px-3 py-1 text-xs">일지 저장</button>
          <select value={selectedPersona} onChange={(e) => setSelectedPersona(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
            {PERSONA_OPTIONS.map((persona) => <option key={persona} value={persona}>{persona}</option>)}
          </select>
          <button type="button" onClick={() => void runReview()} className="rounded border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs text-indigo-900">페르소나 검토</button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          매수는 entry_type, 매도는 exit_type을 사용합니다. conviction_level은 선택 입력입니다.
        </p>
        {draft.side === 'sell' ? (
          <p className="mt-1 text-[11px] text-amber-700">
            매도 체크리스트: 왜 파는지(exit_type), thesis가 깨졌는지, 감정 반응인지, 리스크 축소 근거를 함께 남기세요.
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

