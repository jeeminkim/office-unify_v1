'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Eye, EyeOff, RefreshCw } from 'lucide-react';

type CurrencyAmounts = { krw: string; usd?: string | null };

type HoldingItem = {
  symbol: string;
  name: string;
  marketCountry: string;
  currency: string;
  quantity: string;
  lastPrice: string;
  averagePurchasePrice: string;
  marketValue: { purchaseAmount: string; amount: string; amountAfterCost: string };
  profitLoss: { amount: string; amountAfterCost: string; rate: string; rateAfterCost: string };
  dailyProfitLoss: { amount: string; rate: string };
};

type AssetResponse = {
  ok: boolean;
  generatedAt: string;
  account: { label: string; maskedNumber: string; accountType: string };
  holdings: {
    totalPurchaseAmount: CurrencyAmounts;
    marketValue: { amount: CurrencyAmounts; amountAfterCost: CurrencyAmounts };
    profitLoss: { amount: CurrencyAmounts; amountAfterCost: CurrencyAmounts; rate: string; rateAfterCost: string };
    dailyProfitLoss: { amount: CurrencyAmounts; rate: string };
    items: HoldingItem[];
  };
  usdKrwRate?: number;
};

const krw = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 });

function number(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatWon(value: number): string {
  return `${krw.format(Math.round(value))}원`;
}

function formatPercent(value: string | number): string {
  const rate = number(value) * 100;
  return `${rate > 0 ? '+' : ''}${rate.toFixed(2)}%`;
}

function amountTone(value: number): string {
  if (value > 0) return 'text-red-500';
  if (value < 0) return 'text-blue-500';
  return 'text-slate-500';
}

function AssetsSkeleton() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse px-5 pb-24 pt-8">
      <div className="h-6 w-24 rounded bg-slate-200" />
      <div className="mt-12 h-4 w-28 rounded bg-slate-200" />
      <div className="mt-4 h-10 w-64 rounded bg-slate-200" />
      <div className="mt-10 h-36 rounded-3xl bg-slate-100" />
      <div className="mt-10 space-y-4">
        {[1, 2, 3].map((item) => <div key={item} className="h-16 rounded-2xl bg-slate-100" />)}
      </div>
    </div>
  );
}

export function TossAssetsClient() {
  const [data, setData] = useState<AssetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visible, setVisible] = useState(true);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/assets/toss', { cache: 'no-store', credentials: 'same-origin' });
      const body = await response.json() as AssetResponse & { error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error ?? 'asset_fetch_failed');
      setData(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'asset_fetch_failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => {
    if (!data) return null;
    const fx = data.usdKrwRate ?? 0;
    const toKrw = (amount: CurrencyAmounts) => number(amount.krw) + number(amount.usd) * fx;
    const totalValue = toKrw(data.holdings.marketValue.amount);
    const totalProfit = toKrw(data.holdings.profitLoss.amount);
    const dailyProfit = toKrw(data.holdings.dailyProfitLoss.amount);
    const krValue = data.holdings.items
      .filter((item) => item.marketCountry === 'KR')
      .reduce((sum, item) => sum + number(item.marketValue.amount), 0);
    const usValue = data.holdings.items
      .filter((item) => item.marketCountry === 'US')
      .reduce((sum, item) => sum + number(item.marketValue.amount) * fx, 0);
    return { totalValue, totalProfit, dailyProfit, krValue, usValue };
  }, [data]);

  if (loading) return <AssetsSkeleton />;

  if (error || !data || !summary) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-xl">!</div>
        <h1 className="mt-5 text-xl font-bold text-slate-950">자산을 불러오지 못했어요</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{error === 'toss_api_not_configured' ? '토스 API 키 설정을 확인해 주세요.' : '토스증권 연결 상태를 확인한 뒤 다시 시도해 주세요.'}</p>
        <button type="button" onClick={() => void load()} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">다시 불러오기</button>
      </div>
    );
  }

  const totalMarket = summary.krValue + summary.usValue;
  const krShare = totalMarket > 0 ? summary.krValue / totalMarket * 100 : 0;
  const sortedItems = [...data.holdings.items].sort((a, b) => {
    const aValue = number(a.marketValue.amount) * (a.currency === 'USD' ? data.usdKrwRate ?? 0 : 1);
    const bValue = number(b.marketValue.amount) * (b.currency === 'USD' ? data.usdKrwRate ?? 0 : 1);
    return bValue - aValue;
  });
  const hidden = '••••••••';

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <div className="mx-auto max-w-3xl px-5 pb-28 pt-6 sm:px-8 sm:pt-10">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight">내 자산</h1>
            <p className="mt-1 text-xs text-slate-400">{data.account.label} {data.account.maskedNumber}</p>
          </div>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} aria-label="자산 새로고침" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50">
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </header>

        <section className="pt-12">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            총 평가금액
            <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? '금액 숨기기' : '금액 보이기'} className="text-slate-400">
              {visible ? <Eye size={17} /> : <EyeOff size={17} />}
            </button>
          </div>
          <p className="mt-2 text-[34px] font-bold tracking-[-0.04em] sm:text-[42px]">{visible ? formatWon(summary.totalValue) : hidden}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className={amountTone(summary.dailyProfit)}>오늘 {visible ? `${summary.dailyProfit >= 0 ? '+' : ''}${formatWon(summary.dailyProfit)}` : hidden} ({formatPercent(data.holdings.dailyProfitLoss.rate)})</span>
            <span className={amountTone(summary.totalProfit)}>총 {formatPercent(data.holdings.profitLoss.rate)}</span>
          </div>
        </section>

        <section className="mt-10 rounded-[24px] bg-slate-50 px-5 py-5 sm:px-6">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">자산 구성</h2>
            <span className="text-xs text-slate-400">원화 환산</span>
          </div>
          <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-blue-100">
            <div className="rounded-full bg-blue-500" style={{ width: `${krShare}%` }} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-slate-400">국내 주식</p><p className="mt-1 font-semibold">{visible ? formatWon(summary.krValue) : hidden}</p><p className="mt-0.5 text-xs text-slate-400">{krShare.toFixed(1)}%</p></div>
            <div><p className="text-xs text-slate-400">미국 주식</p><p className="mt-1 font-semibold">{visible ? formatWon(summary.usValue) : hidden}</p><p className="mt-0.5 text-xs text-slate-400">{(100 - krShare).toFixed(1)}%</p></div>
          </div>
        </section>

        <section className="mt-11">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-bold tracking-tight">보유 종목 <span className="text-blue-500">{sortedItems.length}</span></h2>
            <p className="text-xs text-slate-400">평가금액순</p>
          </div>
          {sortedItems.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">보유 중인 주식이 없어요.</div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {sortedItems.map((item) => {
                const profit = number(item.profitLoss.amount);
                const value = number(item.marketValue.amount);
                const unit = item.currency === 'USD' ? '$' : '';
                const valueLabel = item.currency === 'USD' ? `${unit}${krw.format(value)}` : formatWon(value);
                return (
                  <div key={`${item.marketCountry}:${item.symbol}`} className="flex items-center gap-3 py-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold text-slate-600">{item.symbol.slice(0, 3)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-400">{decimal.format(number(item.quantity))}주 · {item.marketCountry === 'KR' ? '국내' : '미국'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{visible ? valueLabel : '••••'}</p>
                      <p className={`mt-1 text-xs font-medium ${amountTone(profit)}`}>{profit > 0 ? '+' : ''}{formatPercent(item.profitLoss.rate)}</p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-slate-300" />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p className="mt-10 text-center text-[11px] leading-5 text-slate-400">토스증권 Open API 기준 · {new Date(data.generatedAt).toLocaleString('ko-KR')}<br />세금과 수수료 반영 전 금액이 포함될 수 있어요.</p>
      </div>
    </div>
  );
}
