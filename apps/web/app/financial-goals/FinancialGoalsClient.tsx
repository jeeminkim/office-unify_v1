"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FinancialGoal, RealizedProfitEvent } from "@office-unify/shared-types";

const krw = new Intl.NumberFormat("ko-KR");

function fmt(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "NO_DATA";
  return krw.format(v);
}

export function FinancialGoalsClient() {
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [events, setEvents] = useState<RealizedProfitEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ goalName: "", goalType: "other", targetAmountKrw: "", priority: "medium", targetDate: "", memo: "" });

  const load = async () => {
    const [goalsRes, eventsRes, summaryRes] = await Promise.all([
      fetch("/api/financial-goals", { credentials: "same-origin" }),
      fetch("/api/realized-pnl/events", { credentials: "same-origin" }),
      fetch("/api/realized-pnl/summary", { credentials: "same-origin" }),
    ]);
    const goalsJson = (await goalsRes.json()) as { goals?: FinancialGoal[]; error?: string };
    const eventsJson = (await eventsRes.json()) as { events?: RealizedProfitEvent[]; error?: string };
    const summaryJson = (await summaryRes.json()) as { error?: string; recentEvents?: RealizedProfitEvent[] };
    if (!goalsRes.ok) throw new Error(goalsJson.error ?? `HTTP ${goalsRes.status}`);
    if (!eventsRes.ok) throw new Error(eventsJson.error ?? `HTTP ${eventsRes.status}`);
    if (!summaryRes.ok) throw new Error(summaryJson.error ?? `HTTP ${summaryRes.status}`);
    setGoals(goalsJson.goals ?? []);
    setEvents(eventsJson.events ?? []);
  };

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "목표 로드 실패");
      }
    })();
  }, []);

  const byGoalEvents = useMemo(() => {
    const map = new Map<string, RealizedProfitEvent[]>();
    events.forEach((event) => {
      if (!event.linkedGoalId) return;
      map.set(event.linkedGoalId, [...(map.get(event.linkedGoalId) ?? []), event]);
    });
    return map;
  }, [events]);

  const createGoal = async () => {
    setError(null);
    try {
      const targetAmountKrw = Number(draft.targetAmountKrw);
      const res = await fetch("/api/financial-goals", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalName: draft.goalName,
          goalType: draft.goalType,
          targetAmountKrw,
          priority: draft.priority,
          targetDate: draft.targetDate || undefined,
          memo: draft.memo || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDraft({ goalName: "", goalType: "other", targetAmountKrw: "", priority: "medium", targetDate: "", memo: "" });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "목표 생성 실패");
    }
  };

  const allocateToGoal = async (goalId: string, realizedEventId: string, maxAmount: number) => {
    const amountRaw = window.prompt(`배분 금액 입력 (최대 ${fmt(maxAmount)})`);
    if (!amountRaw) return;
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0 || amount > maxAmount) {
      setError("배분액은 순실현손익 이내여야 합니다.");
      return;
    }
    setError(null);
    const res = await fetch(`/api/financial-goals/${goalId}/allocations`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountKrw: amount,
        allocationType: "realized_profit",
        realizedEventId,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    await load();
  };

  return (
    <div className="mx-auto max-w-6xl p-6 text-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">목표 자금 관리</h1>
          <p className="text-sm text-slate-600">목표 배분은 자금 흐름 관리용이며 실제 계좌 이체가 아닙니다.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <Link href="/" className="rounded border border-slate-300 bg-white px-3 py-1.5">홈</Link>
          <Link href="/realized-pnl" className="rounded border border-slate-300 bg-white px-3 py-1.5">실현손익 보기</Link>
        </div>
      </div>
      <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        실현손익은 외부 거래 후 사용자가 입력한 체결 기준입니다. 세금/수수료는 사용자가 입력한 값 기준입니다.
      </div>
      {error ? <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

      <section className="mb-4 rounded border border-slate-200 bg-white p-4 text-xs">
        <h2 className="font-semibold">목표 생성</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <input className="rounded border border-slate-300 px-2 py-1" placeholder="목표명" value={draft.goalName} onChange={(e) => setDraft({ ...draft, goalName: e.target.value })} />
          <select className="rounded border border-slate-300 px-2 py-1" value={draft.goalType} onChange={(e) => setDraft({ ...draft, goalType: e.target.value })}>
            <option value="car_purchase">차량 구매</option>
            <option value="mortgage_interest">주택 대출 이자</option>
            <option value="tax_payment">세금 납부</option>
            <option value="emergency_fund">비상금</option>
            <option value="travel">여행</option>
            <option value="other">기타</option>
          </select>
          <input className="rounded border border-slate-300 px-2 py-1" placeholder="목표 금액(KRW)" value={draft.targetAmountKrw} onChange={(e) => setDraft({ ...draft, targetAmountKrw: e.target.value })} />
          <input className="rounded border border-slate-300 px-2 py-1" placeholder="목표일(YYYY-MM-DD)" value={draft.targetDate} onChange={(e) => setDraft({ ...draft, targetDate: e.target.value })} />
          <select className="rounded border border-slate-300 px-2 py-1" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
          <input className="rounded border border-slate-300 px-2 py-1" placeholder="메모" value={draft.memo} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
        </div>
        <button type="button" className="mt-2 rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-blue-900" onClick={() => void createGoal()}>
          목표 생성
        </button>
      </section>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-sm">목표 목록</h2>
        <div className="mt-2 space-y-3">
          {goals.map((goal) => {
            const progress = goal.targetAmountKrw > 0 ? (goal.currentAllocatedKrw / goal.targetAmountKrw) * 100 : 0;
            const linked = byGoalEvents.get(goal.id) ?? [];
            return (
              <div key={goal.id} className="rounded border border-slate-200 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">{goal.goalName}</p>
                  <p className="text-slate-600">{goal.goalType} · {goal.priority} · {goal.status}</p>
                </div>
                <p className="mt-1 text-slate-600">목표금액 {fmt(goal.targetAmountKrw)} / 현재배분 {fmt(goal.currentAllocatedKrw)} / 달성률 {progress.toFixed(1)}%</p>
                <div className="mt-2 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-slate-700" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>
                <div className="mt-2 space-y-1">
                  {linked.slice(0, 5).map((event) => (
                    <div key={event.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1">
                      <span>{event.sellDate} {event.symbol} 순실현 {fmt(event.netRealizedPnlKrw)}</span>
                      {event.netRealizedPnlKrw != null && event.netRealizedPnlKrw > 0 ? (
                        <button
                          type="button"
                          className="ml-2 rounded border border-slate-300 bg-white px-2 py-0.5"
                          onClick={() => void allocateToGoal(goal.id, event.id, event.netRealizedPnlKrw ?? 0)}
                        >
                          목표에 배분
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {linked.length === 0 ? <p className="text-slate-500">연결된 실현손익 이벤트 없음</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
