"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WatchlistRecommendationCandidate } from "@office-unify/shared-types";
import { PortfolioRoleBanner } from "@/components/PortfolioRoleBanner";
import { SaveToActionInboxButton } from "@/components/SaveToActionInboxButton";
import { buildWatchlistCheckActionItemDetail } from "@/lib/actionItemDetailBuilders";

type WatchlistItem = {
  market: "KR" | "US";
  symbol: string;
  name: string;
  sector: string | null;
  googleTicker: string | null;
  quoteSymbol: string | null;
  investmentMemo: string | null;
  interestReason: string | null;
  updatedAt: string | null;
};

type SectorCandidate = {
  symbol: string;
  market: string;
  readinessLabel?: string;
  sectorRadarBadge?: string;
};

type FilterKey =
  | "all"
  | "sector_unmatched"
  | "ticker_unverified"
  | "quote_missing"
  | "us"
  | "held"
  | "pending_rec";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "sector_unmatched", label: "섹터 미매칭" },
  { key: "ticker_unverified", label: "ticker 미확인" },
  { key: "quote_missing", label: "quote missing" },
  { key: "us", label: "US 관심" },
  { key: "held", label: "보유 중" },
  { key: "pending_rec", label: "등록 후보" },
];

function watchId(market: string, symbol: string) {
  return `${market}:${symbol}`;
}

export function WatchlistManagerClient() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [holdings, setHoldings] = useState<Set<string>>(new Set());
  const [sectorByKey, setSectorByKey] = useState<Record<string, SectorCandidate>>({});
  const [pending, setPending] = useState<WatchlistRecommendationCandidate[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memoDrafts, setMemoDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wlRes, snapRes, pendRes, secRes] = await Promise.all([
        fetch("/api/portfolio/watchlist", { credentials: "same-origin" }),
        fetch("/api/portfolio/ledger/snapshot", { credentials: "same-origin" }),
        fetch("/api/watchlist/recommendations", { credentials: "same-origin" }),
        fetch("/api/sector-radar/watchlist-candidates", { credentials: "same-origin" }),
      ]);
      const wl = (await wlRes.json()) as { items?: WatchlistItem[]; error?: string };
      if (!wlRes.ok) throw new Error(wl.error ?? `watchlist HTTP ${wlRes.status}`);
      setItems(wl.items ?? []);
      const snap = (await snapRes.json()) as { holdings?: Array<{ market: string; symbol: string }> };
      if (snapRes.ok) {
        setHoldings(new Set((snap.holdings ?? []).map((h) => watchId(h.market, h.symbol))));
      }
      const pend = (await pendRes.json()) as { candidates?: WatchlistRecommendationCandidate[] };
      if (pendRes.ok) setPending(pend.candidates ?? []);
      const sec = (await secRes.json()) as { candidates?: SectorCandidate[] };
      if (secRes.ok) {
        const map: Record<string, SectorCandidate> = {};
        for (const c of sec.candidates ?? []) {
          map[watchId(c.market, c.symbol)] = c;
        }
        setSectorByKey(map);
      }
      setMemoDrafts(
        Object.fromEntries((wl.items ?? []).map((i) => [watchId(i.market, i.symbol), i.investmentMemo ?? ""])),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "pending_rec") return [];
    return items.filter((i) => {
      const key = watchId(i.market, i.symbol);
      if (filter === "us" && i.market !== "US") return false;
      if (filter === "held" && !holdings.has(key)) return false;
      if (filter === "sector_unmatched" && i.sector?.trim()) return false;
      if (filter === "ticker_unverified" && i.googleTicker?.trim() && i.quoteSymbol?.trim()) return false;
      if (filter === "quote_missing" && i.googleTicker?.trim()) return false;
      return true;
    });
  }, [items, filter, holdings]);

  const saveMemo = async (item: WatchlistItem) => {
    const id = watchId(item.market, item.symbol);
    setBusy(id);
    try {
      const res = await fetch(`/api/portfolio/watchlist/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ investment_memo: memoDrafts[id] ?? "" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "메모 저장 실패");
    } finally {
      setBusy(null);
    }
  };

  const removeItem = async (item: WatchlistItem) => {
    const id = watchId(item.market, item.symbol);
    if (!window.confirm(`${item.name} (${id}) 관심종목에서 제외할까요? 원장 데이터가 삭제됩니다.`)) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/portfolio/watchlist/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "제외 실패");
    } finally {
      setBusy(null);
    }
  };

  const approveRec = async (c: WatchlistRecommendationCandidate) => {
    if (!window.confirm(`「${c.name}」을(를) 관심종목에 등록할까요? 승인 시에만 DB에 저장됩니다.`)) return;
    const rid = c.recommendationId ?? `${c.market}:${c.symbol}`;
    setBusy(rid);
    try {
      const res = await fetch("/api/watchlist/recommendations/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ recommendationId: c.recommendationId, symbol: c.symbol, market: c.market }),
      });
      const data = (await res.json()) as { ok?: boolean; actionHint?: string; error?: string };
      if (!res.ok) throw new Error(data.actionHint ?? data.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "승인 실패");
    } finally {
      setBusy(null);
    }
  };

  const rejectRec = async (c: WatchlistRecommendationCandidate) => {
    if (!window.confirm(`「${c.name}」 등록 후보를 거절할까요?`)) return;
    setBusy(`reject-${c.recommendationId}`);
    try {
      const res = await fetch("/api/watchlist/recommendations/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ recommendationId: c.recommendationId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "거절 실패");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-4 pb-20 text-slate-900 md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">관심종목 관리</h1>
          <p className="mt-1 text-xs text-slate-600">
            관심종목·섹터·ticker·메모·등록 후보를 한곳에서 관리합니다. 자동 등록·자동 주문은 없습니다.
          </p>
        </div>
        <Link href="/portfolio-ledger" className="text-xs text-violet-800 underline">
          보유/거래 원장
        </Link>
      </div>

      <PortfolioRoleBanner variant="holdings" />

      <div className="mb-3 md:hidden">
        <button
          type="button"
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs"
          onClick={() => setFilterOpen((v) => !v)}
        >
          필터: {FILTERS.find((f) => f.key === filter)?.label} {filterOpen ? "▴" : "▾"}
        </button>
        {filterOpen ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`rounded border px-2 py-1 text-[10px] ${filter === f.key ? "border-slate-800 bg-slate-100" : ""}`}
                onClick={() => {
                  setFilter(f.key);
                  setFilterOpen(false);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mb-3 hidden flex-wrap gap-1 md:flex">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`rounded border px-2 py-1 text-[11px] ${filter === f.key ? "border-slate-800 bg-slate-100 font-medium" : "border-slate-200"}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <p className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">불러오는 중…</p> : null}

      {(filter === "pending_rec" || pending.length > 0) && (
        <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
          <h2 className="text-sm font-semibold text-amber-950">등록 후보 (승인 전 미등록)</h2>
          <p className="mt-1 text-[10px] text-amber-900">승인 버튼을 누를 때만 관심종목 DB에 저장됩니다.</p>
          {pending.length === 0 ? (
            <p className="mt-2 text-xs text-amber-800">대기 중인 후보가 없습니다.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {pending.map((c) => (
                <li key={c.recommendationId} className="rounded border border-amber-200 bg-white p-2 text-xs">
                  <p className="font-medium break-all">
                    {c.name} · {c.market}:{c.symbol}
                  </p>
                  <p className="mt-0.5 text-slate-600">{(c.displayReasons ?? []).join(" · ").slice(0, 160)}</p>
                  <div className="mt-2 flex flex-col gap-1">
                    <button
                      type="button"
                      disabled={busy === c.recommendationId}
                      className="rounded border border-emerald-500 bg-emerald-50 px-2 py-1 text-emerald-950 disabled:opacity-50"
                      onClick={() => void approveRec(c)}
                    >
                      승인 (등록)
                    </button>
                    <button
                      type="button"
                      disabled={busy === `reject-${c.recommendationId}`}
                      className="rounded border px-2 py-1 disabled:opacity-50"
                      onClick={() => void rejectRec(c)}
                    >
                      거절
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {filter !== "pending_rec" ? (
        <ul className="space-y-3">
          {filtered.map((item) => {
            const key = watchId(item.market, item.symbol);
            const sec = sectorByKey[key];
            return (
              <li key={key} className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {item.name}{" "}
                      <span className="font-mono text-[10px] text-slate-500">
                        {item.market}:{item.symbol}
                      </span>
                    </p>
                    <p className="mt-0.5 text-slate-600">
                      sector: {item.sector || "—"} · google: {item.googleTicker || "—"} · quote:{" "}
                      <span className="break-all">{item.quoteSymbol || "—"}</span>
                    </p>
                    {sec?.readinessLabel ? (
                      <p className="mt-0.5 text-violet-800">레이더: {sec.readinessLabel}</p>
                    ) : null}
                    {holdings.has(key) ? <span className="mt-1 inline-block rounded bg-slate-100 px-1 text-[10px]">보유 중</span> : null}
                  </div>
                </div>
                <label className="mt-2 block">
                  <span className="text-[10px] text-slate-500">메모</span>
                  <textarea
                    className="mt-0.5 w-full rounded border border-slate-200 p-1.5 text-[11px]"
                    rows={2}
                    value={memoDrafts[key] ?? ""}
                    onChange={(e) => setMemoDrafts((d) => ({ ...d, [key]: e.target.value }))}
                  />
                </label>
                <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:flex-wrap">
                  <Link
                    href={`/portfolio-ledger?focus=watchlist&symbol=${encodeURIComponent(item.symbol)}&market=${item.market}`}
                    className="rounded border px-2 py-1 text-center"
                  >
                    ticker resolver
                  </Link>
                  <Link
                    href={`/research-center?symbol=${encodeURIComponent(item.symbol)}&name=${encodeURIComponent(item.name)}&market=${item.market}`}
                    className="rounded border px-2 py-1 text-center"
                  >
                    Research
                  </Link>
                  <SaveToActionInboxButton
                    compact
                    label="Action Item"
                    className="rounded border px-2 py-1"
                    request={{
                      title: `[${item.symbol}] 관심종목 점검`,
                      sourceType: "manual",
                      sourceLabel: "watchlist_manager",
                      idempotencyKey: `watchlist:${key}`,
                      detailJson: buildWatchlistCheckActionItemDetail(item),
                    }}
                  />
                  <button
                    type="button"
                    className="rounded border px-2 py-1 disabled:opacity-50"
                    disabled={busy === key}
                    onClick={() => void saveMemo(item)}
                  >
                    메모 저장
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-200 px-2 py-1 text-red-800 disabled:opacity-50"
                    disabled={busy === key}
                    onClick={() => void removeItem(item)}
                  >
                    제외
                  </button>
                </div>
              </li>
            );
          })}
          {!loading && filtered.length === 0 ? (
            <li className="text-sm text-slate-500">조건에 맞는 관심종목이 없습니다.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
