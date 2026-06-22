'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Plus, RefreshCw, Search, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react';

type DiscoveryItem = {
  symbol: string;
  name: string;
  englishName?: string;
  market: 'KR' | 'US';
  exchange: string;
  currency: string;
  securityType: string;
  currentPrice?: number;
  updatedAt?: string;
  isHeld: boolean;
  isWatchlisted: boolean;
  exactMatch?: boolean;
  analysis?: {
    score: number;
    signal: 'momentum' | 'pullback' | 'recovery' | 'neutral' | 'risk';
    signalLabel: string;
    return5d?: number;
    return20d?: number;
    distanceFrom20dHigh?: number;
    warningTypes: string[];
    reasons: string[];
  };
};

type DiscoveryResponse = {
  ok: boolean;
  generatedAt: string;
  query: string;
  exactMatch?: DiscoveryItem;
  matches: DiscoveryItem[];
  recommendations: DiscoveryItem[];
  disclaimer: string;
  error?: string;
};

const krw = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatPrice(item: DiscoveryItem): string {
  if (item.currentPrice == null) return '가격 확인 중';
  return item.currency === 'KRW' ? `${krw.format(item.currentPrice)}원` : `$${usd.format(item.currentPrice)}`;
}

function formatReturn(value?: number): string {
  if (value == null) return '-';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function signalClass(signal?: NonNullable<DiscoveryItem['analysis']>['signal']): string {
  if (signal === 'risk') return 'bg-amber-50 text-amber-700';
  if (signal === 'momentum') return 'bg-red-50 text-red-600';
  if (signal === 'pullback' || signal === 'recovery') return 'bg-blue-50 text-blue-600';
  return 'bg-slate-100 text-slate-600';
}

function StockCard({ item, onAdd, adding }: { item: DiscoveryItem; onAdd: (item: DiscoveryItem) => void; adding: boolean }) {
  return (
    <article className={`rounded-[24px] border p-5 transition ${item.exactMatch ? 'border-blue-300 bg-blue-50/40 shadow-sm' : 'border-slate-100 bg-white'}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold text-slate-600">{item.symbol.slice(0, 3)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold">{item.name}</h3>
            {item.exactMatch ? <span className="rounded-md bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white">정확히 일치</span> : null}
            {item.isHeld ? <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] text-white">보유 중</span> : null}
          </div>
          <p className="mt-1 text-xs text-slate-400">{item.symbol} · {item.exchange} · {item.securityType}</p>
        </div>
        <div className="text-right">
          <p className="font-bold tabular-nums">{formatPrice(item)}</p>
          <p className="mt-1 text-[11px] text-slate-400">토스 현재가</p>
        </div>
      </div>

      {item.analysis ? (
        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${signalClass(item.analysis.signal)}`}>{item.analysis.signalLabel}</span>
            <span className="text-xs font-semibold text-slate-500">관찰 점수 <strong className="text-slate-950">{item.analysis.score}</strong></span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div><p className="text-[11px] text-slate-400">5일</p><p className="mt-1 text-sm font-semibold">{formatReturn(item.analysis.return5d)}</p></div>
            <div><p className="text-[11px] text-slate-400">20일</p><p className="mt-1 text-sm font-semibold">{formatReturn(item.analysis.return20d)}</p></div>
            <div><p className="text-[11px] text-slate-400">20일 고점 대비</p><p className="mt-1 text-sm font-semibold">{formatReturn(item.analysis.distanceFrom20dHigh)}</p></div>
          </div>
          <ul className="mt-4 space-y-1.5 text-xs leading-5 text-slate-500">
            {item.analysis.reasons.slice(0, 2).map((reason) => <li key={reason}>· {reason}</li>)}
          </ul>
        </div>
      ) : null}

      <button type="button" disabled={item.isHeld || item.isWatchlisted || adding} onClick={() => onAdd(item)} className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-100 disabled:text-slate-400">
        {item.isHeld ? <><Check size={15} />보유 종목</> : item.isWatchlisted ? <><Check size={15} />관심종목에 있음</> : adding ? <><RefreshCw size={15} className="animate-spin" />추가 중</> : <><Plus size={15} />관심종목에 추가</>}
      </button>
    </article>
  );
}

export function StockDiscoverClient() {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<DiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const load = useCallback(async (searchQuery: string, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/stocks/discover?q=${encodeURIComponent(searchQuery)}`, { cache: 'no-store', signal });
      const body = await response.json() as DiscoveryResponse;
      if (!response.ok || !body.ok) throw new Error(body.error ?? 'stock_discovery_failed');
      setData(body);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : 'stock_discovery_failed');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(query.trim(), controller.signal), query.trim() ? 350 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load, query]);

  const displayedMatches = useMemo(() => data?.matches ?? [], [data]);

  async function addToWatchlist(item: DiscoveryItem) {
    setAdding(item.symbol);
    setError(null);
    try {
      const response = await fetch('/api/portfolio/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market: item.market,
          symbol: item.symbol,
          name: item.name,
          krQuoteMarket: item.exchange === 'KOSDAQ' ? 'KOSDAQ' : 'KOSPI',
          interestReason: `토스 가격 흐름: ${item.analysis?.signalLabel ?? '관찰 후보'}`,
        }),
      });
      if (!response.ok) throw new Error('watchlist_add_failed');
      setData((current) => current ? {
        ...current,
        matches: current.matches.map((row) => row.symbol === item.symbol ? { ...row, isWatchlisted: true } : row),
        recommendations: current.recommendations.map((row) => row.symbol === item.symbol ? { ...row, isWatchlisted: true } : row),
      } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'watchlist_add_failed');
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-950">
      <div className="mx-auto max-w-4xl px-5 pb-28 pt-8 sm:px-8 sm:pt-12">
        <header>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-500"><Sparkles size={16} />토스 실시간 탐색</div>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em]">종목명만 입력해도<br />바로 찾아드려요</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">내 보유·관심종목과 대표 종목을 종목명 또는 티커로 찾고, 최신 가격 흐름을 함께 확인합니다.</p>
        </header>

        <div className="sticky top-3 z-20 mt-8 rounded-2xl bg-white p-2 shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
          <label className="flex items-center gap-3 px-3">
            <Search size={20} className="shrink-0 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 삼성전자, 애플, NVDA" className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400" />
            {loading ? <RefreshCw size={17} className="animate-spin text-blue-500" /> : null}
          </label>
        </div>

        {error ? <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div> : null}

        {query.trim() ? (
          <section className="mt-9">
            <div className="flex items-center justify-between"><h2 className="text-xl font-bold">검색 결과</h2><span className="text-xs text-slate-400">{displayedMatches.length}개</span></div>
            {!loading && displayedMatches.length === 0 ? (
              <div className="mt-4 rounded-3xl bg-white px-6 py-12 text-center"><p className="font-semibold">일치하는 종목을 찾지 못했어요</p><p className="mt-2 text-sm text-slate-400">정확한 종목명, 6자리 코드 또는 미국 티커를 입력해 보세요.</p></div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">{displayedMatches.map((item) => <StockCard key={item.symbol} item={item} onAdd={addToWatchlist} adding={adding === item.symbol} />)}</div>
            )}
          </section>
        ) : (
          <section className="mt-10">
            <div className="flex items-center gap-2"><TrendingUp size={19} className="text-blue-500" /><h2 className="text-xl font-bold">오늘의 관심 후보</h2></div>
            <p className="mt-2 text-sm text-slate-500">보유 종목은 제외하고 최근 5일·20일 가격 흐름을 비교했습니다.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">{(data?.recommendations ?? []).map((item) => <StockCard key={item.symbol} item={item} onAdd={addToWatchlist} adding={adding === item.symbol} />)}</div>
          </section>
        )}

        <aside className="mt-10 flex gap-3 rounded-2xl bg-amber-50 px-4 py-4 text-xs leading-5 text-amber-800"><ShieldAlert size={18} className="mt-0.5 shrink-0" /><p>{data?.disclaimer ?? '가격 흐름을 정리한 관찰 후보이며 매수 추천이나 주문 실행이 아닙니다.'}</p></aside>
      </div>
    </div>
  );
}
