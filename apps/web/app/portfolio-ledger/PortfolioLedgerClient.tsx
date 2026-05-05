"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  PortfolioLedgerApplyResponseBody,
  PortfolioLedgerValidateResponseBody,
  WatchlistSectorMatchApiResponse,
  WatchlistSectorMatchResult,
} from "@office-unify/shared-types";
import type { SectorWatchlistCandidateItem } from "@/lib/sectorRadarContract";
import { OpsFeedbackButton } from "@/components/OpsFeedbackButton";

const jsonHeaders: HeadersInit = { "Content-Type": "application/json" };

type TickerSuggestResponse = {
  ok: boolean;
  suggestion?: {
    market: string;
    symbol: string;
    normalizedSymbol: string;
    name?: string;
    googleTicker?: string;
    quoteSymbol?: string;
    sector?: string;
    confidence: "low" | "medium" | "high";
    reasons: string[];
    warnings: string[];
  };
  error?: string;
};

type LedgerTickerOrigin = "holding_form" | "watchlist_form" | "holding_row" | "watchlist_row";

type HoldingRow = {
  market: "KR" | "US";
  symbol: string;
  name: string;
  google_ticker: string | null;
  quote_symbol: string | null;
  sector: string | null;
  investment_memo: string | null;
  qty: number | string | null;
  avg_price: number | string | null;
  target_price: number | string | null;
  judgment_memo: string | null;
};

type WatchlistRow = {
  market: "KR" | "US";
  symbol: string;
  name: string;
  google_ticker: string | null;
  quote_symbol: string | null;
  sector?: string | null;
  priority?: string | null;
  interest_reason?: string | null;
  desired_buy_range?: string | null;
  observation_points?: string | null;
  investment_memo?: string | null;
  sector_is_manual?: boolean | null;
  sector_match_status?: string | null;
  sector_match_confidence?: number | null;
  sector_match_source?: string | null;
  sector_match_reason?: string | null;
};
type GoalRow = {
  id: string;
  goalName: string;
  goalType: string;
  targetAmountKrw: number;
  currentAllocatedKrw: number;
  status: string;
};

type TradeEventRow = {
  id: string;
  market: string;
  symbol: string;
  eventType: "buy" | "sell" | "correct";
  tradeDate: string;
  quantity?: number;
  price?: number;
  beforeQuantity?: number;
  afterQuantity?: number;
  beforeAvgPrice?: number;
  afterAvgPrice?: number;
  realizedPnlKrw?: number;
  memo?: string;
  reason?: string;
};

const EXAMPLE_SQL = `-- 보유 upsert (KR 예시) — 수정도 동일 형식 INSERT 한 줄(upsert). UPDATE 문은 거부됩니다.
INSERT INTO web_portfolio_holdings (market, symbol, name, sector, investment_memo, qty, avg_price, target_price, judgment_memo)
VALUES ('KR', '000660', 'SK하이닉스', '반도체', '메모', 20, 513000, 1300000, '판단');

-- 관심 upsert (US 예시)
INSERT INTO web_portfolio_watchlist (market, symbol, name, sector, investment_memo, interest_reason, desired_buy_range, observation_points, priority)
VALUES ('US', 'NFLX', '넷플릭스', 'OTT', '메모', '성장성', '92 이하', '실적', '중');

-- 관심 종목 제거
DELETE FROM web_portfolio_watchlist WHERE symbol = 'NFLX' AND market = 'US';
`;

export function PortfolioLedgerClient() {
  const router = useRouter();
  const [sql, setSql] = useState(EXAMPLE_SQL);
  const [validateResult, setValidateResult] = useState<PortfolioLedgerValidateResponseBody | null>(null);
  const [applyResult, setApplyResult] = useState<PortfolioLedgerApplyResponseBody | null>(null);
  const [loadingV, setLoadingV] = useState(false);
  const [loadingA, setLoadingA] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteSyncStatus, setQuoteSyncStatus] = useState<{
    kind: "success" | "warning" | "error" | "info";
    message: string;
  } | null>(null);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [quoteRefreshBusy, setQuoteRefreshBusy] = useState(false);
  const [quoteStatusBusy, setQuoteStatusBusy] = useState(false);
  const [sheetsPreview, setSheetsPreview] = useState<string | null>(null);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [queueJson, setQueueJson] = useState(
    '{"schema":"jo_ledger_v1","ledgerTarget":"holding","actionType":"upsert","market":"KR","name":"","symbol":""}',
  );
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [snapshot, setSnapshot] = useState<{ holdings: HoldingRow[]; watchlist: WatchlistRow[] } | null>(null);
  const [watchRadarByKey, setWatchRadarByKey] = useState<Map<string, SectorWatchlistCandidateItem>>(() => new Map());
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [ledgerTickerReqId, setLedgerTickerReqId] = useState<string | null>(null);
  const [ledgerTickerBusy, setLedgerTickerBusy] = useState(false);
  const [ledgerTickerStatusBusy, setLedgerTickerStatusBusy] = useState(false);
  const [ledgerTickerRows, setLedgerTickerRows] = useState<
    Array<{
      targetType: string;
      market: string;
      symbol: string;
      name?: string;
      candidateTicker: string;
      parsedPrice?: number;
      currency?: string;
      googleName?: string;
      status: string;
      confidence: string;
      message?: string;
    }>
  >([]);
  const [ledgerTickerOrigin, setLedgerTickerOrigin] = useState<LedgerTickerOrigin | null>(null);
  const [suggestFillHoldingBusy, setSuggestFillHoldingBusy] = useState(false);
  const [suggestFillWatchBusy, setSuggestFillWatchBusy] = useState(false);
  const [suggestFormBanner, setSuggestFormBanner] = useState<{ kind: "success" | "partial"; message: string } | null>(null);
  const [holdingDupNavKey, setHoldingDupNavKey] = useState<string | null>(null);
  const [watchDupNavKey, setWatchDupNavKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    qty: string;
    avg_price: string;
    google_ticker: string;
    quote_symbol: string;
    investment_memo: string;
    target_price: string;
    judgment_memo: string;
  } | null>(null);
  const [tradeDraft, setTradeDraft] = useState<{
    key: string | null;
    action: "buy" | "sell" | "correct";
    quantity: string;
    price: string;
    newQuantity: string;
    newAveragePrice: string;
    memo: string;
    moveToWatchlistOnFullSell: boolean;
    feeKrw: string;
    taxKrw: string;
    tradeReason: string;
    linkedGoalId: string;
    allocationAmountKrw: string;
  }>({
    key: null,
    action: "buy",
    quantity: "",
    price: "",
    newQuantity: "",
    newAveragePrice: "",
    memo: "",
    moveToWatchlistOnFullSell: false,
    feeKrw: "",
    taxKrw: "",
    tradeReason: "",
    linkedGoalId: "",
    allocationAmountKrw: "",
  });
  const [applyTradeBusy, setApplyTradeBusy] = useState(false);
  const [ledgerTradeBanner, setLedgerTradeBanner] = useState<{
    kind: "success" | "info";
    message: string;
    realizedEventId?: string;
  } | null>(null);
  const applyTradePanelRef = useRef<HTMLDivElement | null>(null);
  const [holdingCreateDraft, setHoldingCreateDraft] = useState({
    market: "KR" as "KR" | "US",
    symbol: "",
    name: "",
    quantity: "",
    avgPrice: "",
    sector: "",
    investmentMemo: "",
    judgmentMemo: "",
    targetPrice: "",
    stopPrice: "",
    googleTicker: "",
    quoteSymbol: "",
    krQuoteMarket: "KOSPI" as "KOSPI" | "KOSDAQ",
  });
  const [watchCreateDraft, setWatchCreateDraft] = useState({
    market: "KR" as "KR" | "US",
    symbol: "",
    name: "",
    sector: "",
    interestReason: "",
    observationPoints: "",
    desiredBuyRange: "",
    priority: "medium" as "low" | "medium" | "high",
    googleTicker: "",
    quoteSymbol: "",
    krQuoteMarket: "KOSPI" as "KOSPI" | "KOSDAQ",
  });
  const [createBusy, setCreateBusy] = useState<null | "holding" | "watchlist">(null);
  const [eventsByKey, setEventsByKey] = useState<Record<string, TradeEventRow[]>>({});
  const [eventsOpenKey, setEventsOpenKey] = useState<string | null>(null);
  const [eventsBusyKey, setEventsBusyKey] = useState<string | null>(null);
  const [watchSectorMatchBusy, setWatchSectorMatchBusy] = useState<null | "preview" | "apply">(null);
  const [watchSectorMatchPreview, setWatchSectorMatchPreview] = useState<WatchlistSectorMatchResult[]>([]);
  const [watchSectorMatchMeta, setWatchSectorMatchMeta] = useState<WatchlistSectorMatchApiResponse["qualityMeta"] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("portfolioLedgerAdvancedMode");
    setAdvancedMode(saved === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("portfolioLedgerAdvancedMode", advancedMode ? "true" : "false");
  }, [advancedMode]);

  const parseQty = (v: unknown): number => {
    const n = Number(String(v ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const parseAvg = (v: unknown): number => {
    const n = Number(String(v ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const getDefaultGoogleTicker = (market: "KR" | "US", symbol: string): string => {
    const normalized = symbol.trim().toUpperCase();
    if (market === "KR") return `KRX:${normalized.replace(/\D/g, "").padStart(6, "0")}`;
    return normalized;
  };

  const getDefaultQuoteSymbol = (
    market: "KR" | "US",
    symbol: string,
    krQuoteMarket: "KOSPI" | "KOSDAQ",
  ): string => {
    const normalized = symbol.trim().toUpperCase();
    if (market === "US") return normalized;
    return `${normalized.replace(/\D/g, "").padStart(6, "0")}.${krQuoteMarket === "KOSDAQ" ? "KQ" : "KS"}`;
  };

  const normalizeTickerDraftSymbol = (market: "KR" | "US", raw: string): string => {
    const t = raw.trim().toUpperCase();
    if (!t) return "";
    if (market === "KR" && /^\d+$/.test(t)) return t.padStart(6, "0");
    return t;
  };

  const openApplyTradePanel = useCallback((row: HoldingRow) => {
    const key = `${row.market}:${row.symbol}`;
    setLedgerTradeBanner(null);
    setError(null);
    if (process.env.NODE_ENV === "development") {
      console.debug("[portfolio-ledger] open apply-trade panel", { key, row });
    }
    setTradeDraft({
      key,
      action: "buy",
      quantity: "",
      price: "",
      newQuantity: String(row.qty ?? ""),
      newAveragePrice: String(row.avg_price ?? ""),
      memo: "",
      moveToWatchlistOnFullSell: false,
      feeKrw: "",
      taxKrw: "",
      tradeReason: "",
      linkedGoalId: "",
      allocationAmountKrw: "",
    });
  }, []);

  useEffect(() => {
    if (!tradeDraft.key || !applyTradePanelRef.current) return;
    applyTradePanelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [tradeDraft.key]);

  const selectedApplyHolding = useMemo(() => {
    if (!tradeDraft.key || !snapshot?.holdings) return null;
    return snapshot.holdings.find((h) => `${h.market}:${h.symbol}` === tradeDraft.key) ?? null;
  }, [tradeDraft.key, snapshot]);

  const buyPreviewAvg = useMemo(() => {
    if (tradeDraft.action !== "buy" || !selectedApplyHolding) return null;
    const addQty = Number(tradeDraft.quantity);
    const addPrice = Number(tradeDraft.price);
    const curQ = parseQty(selectedApplyHolding.qty);
    const curA = parseAvg(selectedApplyHolding.avg_price);
    if (!Number.isFinite(addQty) || addQty <= 0 || !Number.isFinite(addPrice) || addPrice <= 0) return null;
    if (curQ < 0 || !Number.isFinite(curA) || curA <= 0) return null;
    const nq = curQ + addQty;
    return ((curQ * curA) + (addQty * addPrice)) / nq;
  }, [tradeDraft.action, tradeDraft.quantity, tradeDraft.price, selectedApplyHolding]);

  const runValidate = useCallback(async () => {
    setError(null);
    setApplyResult(null);
    setLoadingV(true);
    try {
      const res = await fetch("/api/portfolio/ledger/validate", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({ sql }),
      });
      const data = (await res.json()) as PortfolioLedgerValidateResponseBody & { error?: string };
      if (!res.ok) {
        setError((data as { error?: string }).error ?? `HTTP ${res.status}`);
        setValidateResult(null);
        return;
      }
      setValidateResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "검증 실패");
      setValidateResult(null);
    } finally {
      setLoadingV(false);
    }
  }, [sql]);

  const runApply = useCallback(async () => {
    setError(null);
    setApplyResult(null);
    setLoadingA(true);
    try {
      const res = await fetch("/api/portfolio/ledger/apply", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({ sql }),
      });
      const data = (await res.json()) as PortfolioLedgerApplyResponseBody & { error?: string };
      if (!res.ok) {
        setError(data.errors?.join("\n") ?? data.error ?? "반영 실패");
        setApplyResult(data.ok === false ? data : null);
        return;
      }
      setApplyResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "반영 실패");
    } finally {
      setLoadingA(false);
    }
  }, [sql]);

  const canApply = validateResult?.ok === true;

  const loadSnapshot = useCallback(async () => {
    setLoadingSnapshot(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/holdings", { credentials: "same-origin" });
      const data = (await res.json()) as { holdings?: HoldingRow[]; watchlist?: WatchlistRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSnapshot({
        holdings: data.holdings ?? [],
        watchlist: (data.watchlist ?? []).map((w) => ({
          ...w,
          google_ticker: w.google_ticker ?? null,
          quote_symbol: w.quote_symbol ?? null,
        })),
      });
      try {
        const cq = await fetch("/api/sector-radar/watchlist-candidates", { credentials: "same-origin" });
        const cj = (await cq.json()) as { candidates?: SectorWatchlistCandidateItem[] };
        const m = new Map<string, SectorWatchlistCandidateItem>();
        for (const c of cj.candidates ?? []) {
          m.set(`${c.market}:${c.symbol.trim().toUpperCase()}`, c);
        }
        setWatchRadarByKey(m);
      } catch {
        setWatchRadarByKey(new Map());
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "보유 목록 로드 실패");
    } finally {
      setLoadingSnapshot(false);
    }
  }, []);

  const runWatchlistSectorMatch = useCallback(
    async (mode: "preview" | "apply") => {
      setWatchSectorMatchBusy(mode);
      setError(null);
      try {
        const res = await fetch("/api/portfolio/watchlist/sector-match", {
          method: "POST",
          headers: jsonHeaders,
          credentials: "same-origin",
          body: JSON.stringify({
            mode,
            onlyUnmatched: mode === "preview",
            minConfidenceToApply: 75,
          }),
        });
        const data = (await res.json()) as WatchlistSectorMatchApiResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setWatchSectorMatchPreview(data.items ?? []);
        setWatchSectorMatchMeta(data.qualityMeta ?? null);
        if (mode === "apply") {
          setLedgerTradeBanner({
            kind: "info",
            message: `관심종목 섹터 자동 매칭 적용: ${data.applied}건 (검토 필요 ${data.needsReview}, 미매칭 ${data.noMatch})`,
          });
          await loadSnapshot();
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "관심종목 섹터 자동 매칭 실패");
      } finally {
        setWatchSectorMatchBusy(null);
      }
    },
    [loadSnapshot],
  );

  const suggestLedgerTicker = useCallback(
    async (
      targetType: "holding" | "watchlist",
      market: "KR" | "US",
      symbol: string,
      options?: { name?: string; origin?: LedgerTickerOrigin },
    ) => {
      const sym = symbol.trim();
      if (!sym) {
        setError("심볼 또는 종목명을 먼저 입력하세요.");
        return;
      }
      setLedgerTickerOrigin(options?.origin ?? null);
      setLedgerTickerBusy(true);
      setError(null);
      setLedgerTickerRows([]);
      try {
        const payload: { market: "KR" | "US"; symbol: string; name?: string } = { market, symbol: sym };
        if (options?.name?.trim()) payload.name = options.name.trim();
        const res = await fetch("/api/portfolio/ticker-resolver/refresh", {
          method: "POST",
          headers: jsonHeaders,
          credentials: "same-origin",
          body: JSON.stringify({
            targetType,
            symbols: [payload],
          }),
        });
        const data = (await res.json()) as { requestId?: string; error?: string; message?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (data.requestId) setLedgerTickerReqId(data.requestId);
        const scopeMsg =
          targetType === "holding"
            ? "보유 종목 기준으로 ticker 후보를 생성했습니다."
            : "관심종목 기준으로 ticker 후보를 생성했습니다.";
        const formNote =
          options?.origin === "holding_form" || options?.origin === "watchlist_form" ? "이 폼에서 요청한 후보입니다. " : "";
        setLedgerTradeBanner({
          kind: "info",
          message:
            formNote +
            scopeMsg +
            " " +
            (data.message ??
              "Sheets portfolio_quote_candidates 탭에 후보 수식을 작성했습니다. 30~90초 후 「추천 결과」를 누르세요."),
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "ticker 추천 요청 실패");
      } finally {
        setLedgerTickerBusy(false);
      }
    },
    [],
  );

  const fillHoldingFromSuggest = useCallback(async () => {
    const sym = holdingCreateDraft.symbol.trim();
    const nam = holdingCreateDraft.name.trim();
    if (!sym && !nam) {
      setSuggestFormBanner(null);
      setError("심볼 또는 종목명을 먼저 입력하세요.");
      return;
    }
    setSuggestFillHoldingBusy(true);
    setError(null);
    setSuggestFormBanner(null);
    setHoldingDupNavKey(null);
    setWatchDupNavKey(null);
    try {
      const params = new URLSearchParams({ market: holdingCreateDraft.market, symbol: sym, name: nam });
      const res = await fetch(`/api/portfolio/ticker-resolver/suggest?${params}`, { credentials: "same-origin" });
      const data = (await res.json()) as TickerSuggestResponse;
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (!data.ok || !data.suggestion) throw new Error(data.error ?? "추천 응답이 비어 있습니다.");
      const s = data.suggestion;
      if (!s.normalizedSymbol?.trim()) {
        setHoldingCreateDraft((prev) => ({
          ...prev,
          sector: s.sector?.trim() ? s.sector : prev.sector,
          name: s.name?.trim() ? s.name : prev.name,
        }));
        setSuggestFormBanner({
          kind: "partial",
          message: "일부 정보만 추천했습니다. 심볼 또는 종목명을 확인하세요.",
        });
        return;
      }
      setHoldingCreateDraft((prev) => ({
        ...prev,
        symbol: s.normalizedSymbol,
        name: s.name?.trim() ? s.name : prev.name,
        sector: s.sector?.trim() ? s.sector : prev.sector,
        googleTicker: s.googleTicker?.trim() ? s.googleTicker : prev.googleTicker,
        quoteSymbol: s.quoteSymbol?.trim() ? s.quoteSymbol : prev.quoteSymbol,
        krQuoteMarket: s.quoteSymbol?.endsWith(".KQ") ? "KOSDAQ" : s.quoteSymbol?.endsWith(".KS") ? "KOSPI" : prev.krQuoteMarket,
      }));
      const partial = s.confidence === "low" || (s.warnings?.length ?? 0) > 0;
      setSuggestFormBanner({
        kind: partial ? "partial" : "success",
        message: partial
          ? "일부 정보만 추천했습니다. 심볼 또는 종목명을 확인하세요."
          : "추천 정보를 채웠습니다. 저장 전 ticker/섹터를 확인하세요.",
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "자동 채움 실패");
    } finally {
      setSuggestFillHoldingBusy(false);
    }
  }, [holdingCreateDraft.market, holdingCreateDraft.symbol, holdingCreateDraft.name]);

  const fillWatchFromSuggest = useCallback(async () => {
    const sym = watchCreateDraft.symbol.trim();
    const nam = watchCreateDraft.name.trim();
    if (!sym && !nam) {
      setSuggestFormBanner(null);
      setError("심볼 또는 종목명을 먼저 입력하세요.");
      return;
    }
    setSuggestFillWatchBusy(true);
    setError(null);
    setSuggestFormBanner(null);
    setHoldingDupNavKey(null);
    setWatchDupNavKey(null);
    try {
      const params = new URLSearchParams({ market: watchCreateDraft.market, symbol: sym, name: nam });
      const res = await fetch(`/api/portfolio/ticker-resolver/suggest?${params}`, { credentials: "same-origin" });
      const data = (await res.json()) as TickerSuggestResponse;
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (!data.ok || !data.suggestion) throw new Error(data.error ?? "추천 응답이 비어 있습니다.");
      const s = data.suggestion;
      if (!s.normalizedSymbol?.trim()) {
        setWatchCreateDraft((prev) => ({
          ...prev,
          sector: s.sector?.trim() ? s.sector : prev.sector,
          name: s.name?.trim() ? s.name : prev.name,
        }));
        setSuggestFormBanner({
          kind: "partial",
          message: "일부 정보만 추천했습니다. 심볼 또는 종목명을 확인하세요.",
        });
        return;
      }
      setWatchCreateDraft((prev) => ({
        ...prev,
        symbol: s.normalizedSymbol,
        name: s.name?.trim() ? s.name : prev.name,
        sector: s.sector?.trim() ? s.sector : prev.sector,
        googleTicker: s.googleTicker?.trim() ? s.googleTicker : prev.googleTicker,
        quoteSymbol: s.quoteSymbol?.trim() ? s.quoteSymbol : prev.quoteSymbol,
        krQuoteMarket: s.quoteSymbol?.endsWith(".KQ") ? "KOSDAQ" : s.quoteSymbol?.endsWith(".KS") ? "KOSPI" : prev.krQuoteMarket,
      }));
      const partial = s.confidence === "low" || (s.warnings?.length ?? 0) > 0;
      setSuggestFormBanner({
        kind: partial ? "partial" : "success",
        message: partial
          ? "일부 정보만 추천했습니다. 심볼 또는 종목명을 확인하세요."
          : "추천 정보를 채웠습니다. 저장 전 ticker/섹터를 확인하세요.",
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "자동 채움 실패");
    } finally {
      setSuggestFillWatchBusy(false);
    }
  }, [watchCreateDraft.market, watchCreateDraft.symbol, watchCreateDraft.name]);

  const loadLedgerTickerStatus = useCallback(async () => {
    if (!ledgerTickerReqId) return;
    setLedgerTickerStatusBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portfolio/ticker-resolver/status?requestId=${encodeURIComponent(ledgerTickerReqId)}`,
        { credentials: "same-origin" },
      );
      const data = (await res.json()) as {
        rows?: Array<{
          targetType: string;
          market: string;
          symbol: string;
          name?: string;
          candidateTicker: string;
          parsedPrice?: number;
          currency?: string;
          googleName?: string;
          status: string;
          confidence: string;
          message?: string;
        }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setLedgerTickerRows(data.rows ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "추천 결과 로드 실패");
    } finally {
      setLedgerTickerStatusBusy(false);
    }
  }, [ledgerTickerReqId]);

  const loadGoals = useCallback(async () => {
    try {
      const res = await fetch("/api/financial-goals", { credentials: "same-origin" });
      const data = (await res.json()) as { goals?: GoalRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setGoals(data.goals ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "목표 목록 로드 실패");
    }
  }, []);

  const notifyDashboardReload = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("portfolio-ledger:updated"));
  }, []);

  const requestQuoteRefresh = useCallback(async () => {
    setQuoteRefreshBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/quotes/refresh", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setQuoteSyncStatus({ kind: "success", message: "시세 동기화 요청 완료" });
      return true;
    } catch {
      setQuoteSyncStatus({ kind: "warning", message: "등록은 완료됐지만 시세 동기화 실패" });
      return false;
    } finally {
      setQuoteRefreshBusy(false);
    }
  }, []);

  const loadQuoteStatus = useCallback(async () => {
    setQuoteStatusBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/quotes/status", { credentials: "same-origin" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return true;
    } catch {
      setQuoteSyncStatus({ kind: "warning", message: "시세 상태 확인에 실패했습니다." });
      return false;
    } finally {
      setQuoteStatusBusy(false);
    }
  }, []);

  const loadTradeHistory = useCallback(async () => {
    if (!eventsOpenKey) return;
    setEventsBusyKey(eventsOpenKey);
    try {
      const res = await fetch(`/api/portfolio/holdings/${encodeURIComponent(eventsOpenKey)}/events`, {
        credentials: "same-origin",
      });
      const data = (await res.json()) as { events?: TradeEventRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setEventsByKey((prev) => ({ ...prev, [eventsOpenKey]: data.events ?? [] }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "거래 이력 로드 실패");
    } finally {
      setEventsBusyKey(null);
    }
  }, [eventsOpenKey]);

  const startEdit = (row: HoldingRow) => {
    const key = `${row.market}:${row.symbol}`;
    setEditingKey(key);
    setEditDraft({
      name: row.name ?? row.symbol,
      qty: String(row.qty ?? ""),
      avg_price: String(row.avg_price ?? ""),
      google_ticker: row.google_ticker ?? "",
      quote_symbol: row.quote_symbol ?? "",
      investment_memo: row.investment_memo ?? "",
      target_price: String(row.target_price ?? ""),
      judgment_memo: row.judgment_memo ?? "",
    });
  };

  const saveEdit = useCallback(async (key: string) => {
    if (!editDraft) return;
    const qty = Number(editDraft.qty);
    const avg = Number(editDraft.avg_price);
    if (!Number.isFinite(qty) || qty < 0) {
      setError("수량은 0 이상 숫자여야 합니다.");
      return;
    }
    if (!Number.isFinite(avg) || avg <= 0) {
      setError("평균단가는 0보다 커야 합니다.");
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/portfolio/holdings/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({
          name: editDraft.name.trim(),
          qty,
          avg_price: avg,
          google_ticker: editDraft.google_ticker.trim() || null,
          quote_symbol: editDraft.quote_symbol.trim() || null,
          investment_memo: editDraft.investment_memo.trim() || null,
          target_price: editDraft.target_price.trim() ? Number(editDraft.target_price) : null,
          judgment_memo: editDraft.judgment_memo.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setEditingKey(null);
      setEditDraft(null);
      await loadSnapshot();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "수정 저장 실패");
    }
  }, [editDraft, loadSnapshot]);

  const removeHolding = useCallback(async (key: string) => {
    if (!window.confirm("해당 보유 종목을 삭제할까요?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/portfolio/holdings/${encodeURIComponent(key)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await loadSnapshot();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    }
  }, [loadSnapshot]);

  const applyTrade = useCallback(async () => {
    if (!tradeDraft.key) return;
    const [marketRaw, symbol] = tradeDraft.key.split(":");
    const market = marketRaw === "KR" || marketRaw === "US" ? marketRaw : null;
    if (!market || !symbol) return;

    const holding = snapshot?.holdings.find((h) => `${h.market}:${h.symbol}` === tradeDraft.key);
    const currentQty = holding ? parseQty(holding.qty) : 0;

    const tradeQty = tradeDraft.quantity.trim() ? Number(tradeDraft.quantity) : NaN;
    const tradePrice = tradeDraft.price.trim() ? Number(tradeDraft.price) : NaN;

    if (tradeDraft.action === "sell") {
      if (!Number.isFinite(tradeQty) || tradeQty <= 0) {
        setError("매도 수량을 입력하세요.");
        return;
      }
      if (tradeQty > currentQty) {
        setError(`매도 수량은 보유 수량(${currentQty})을 초과할 수 없습니다.`);
        return;
      }
    }

    if (tradeDraft.action === "buy") {
      if (!Number.isFinite(tradeQty) || tradeQty <= 0 || !Number.isFinite(tradePrice) || tradePrice <= 0) {
        setError("추가 매수 수량·단가를 올바르게 입력하세요.");
        return;
      }
    }

    if (tradeDraft.action === "correct") {
      const nq = tradeDraft.newQuantity.trim() ? Number(tradeDraft.newQuantity) : NaN;
      const na = tradeDraft.newAveragePrice.trim() ? Number(tradeDraft.newAveragePrice) : NaN;
      if (!Number.isFinite(nq) || nq < 0) {
        setError("정정 수량을 입력하세요(0 이상).");
        return;
      }
      if (!Number.isFinite(na) || na <= 0) {
        setError("정정 평균단가를 입력하세요(0보다 커야 합니다).");
        return;
      }
    }

    const body = {
      market,
      symbol,
      action: tradeDraft.action,
      quantity: tradeDraft.quantity.trim() ? Number(tradeDraft.quantity) : undefined,
      price: tradeDraft.price.trim() ? Number(tradeDraft.price) : undefined,
      newQuantity: tradeDraft.newQuantity.trim() ? Number(tradeDraft.newQuantity) : undefined,
      newAveragePrice: tradeDraft.newAveragePrice.trim() ? Number(tradeDraft.newAveragePrice) : undefined,
      memo: tradeDraft.memo.trim() || undefined,
      moveToWatchlistOnFullSell: tradeDraft.moveToWatchlistOnFullSell,
      feeKrw: tradeDraft.feeKrw.trim() ? Number(tradeDraft.feeKrw) : undefined,
      taxKrw: tradeDraft.taxKrw.trim() ? Number(tradeDraft.taxKrw) : undefined,
      tradeReason: tradeDraft.tradeReason.trim() || undefined,
      linkedGoalId: tradeDraft.linkedGoalId || undefined,
      allocationAmountKrw: tradeDraft.allocationAmountKrw.trim() ? Number(tradeDraft.allocationAmountKrw) : undefined,
    };

    if (process.env.NODE_ENV === "development") {
      console.debug("[portfolio-ledger] submit apply-trade", body);
    }

    setError(null);
    setLedgerTradeBanner(null);
    setApplyTradeBusy(true);
    try {
      const res = await fetch("/api/portfolio/holdings/apply-trade", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        error?: string;
        realizedEvent?: { id: string; linkedGoalId?: string | null; goalAllocated?: number };
        tradeEventId?: string;
        realizedEventId?: string;
        suggestTickerResolver?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const suggest = data.suggestTickerResolver === true;
      const realizedId = data.realizedEventId ?? data.realizedEvent?.id;
      let msg = "반영 완료.";
      if (realizedId) {
        msg = "실현손익 기록됨";
        if (data.realizedEvent?.linkedGoalId) msg += " 목표에 배분되었습니다.";
      } else if (tradeDraft.action === "buy") {
        msg = "매수 반영 완료";
      } else if (tradeDraft.action === "sell") {
        msg = "매도 반영 완료";
      } else if (tradeDraft.action === "correct") {
        msg = "보유 정정 완료";
      }
      if (suggest) {
        msg =
          `${msg}. google_ticker가 비어 있으면 아래 「ticker 추천」으로 후보를 검증한 뒤 적용하세요.`;
      }

      setLedgerTradeBanner({
        kind: suggest ? "info" : "success",
        message: msg,
        realizedEventId: realizedId,
      });
      setTradeDraft({
        key: null,
        action: "buy",
        quantity: "",
        price: "",
        newQuantity: "",
        newAveragePrice: "",
        memo: "",
        moveToWatchlistOnFullSell: false,
        feeKrw: "",
        taxKrw: "",
        tradeReason: "",
        linkedGoalId: "",
        allocationAmountKrw: "",
      });
      await loadSnapshot();
      await loadGoals();
      await loadTradeHistory();
      await requestQuoteRefresh();
      await loadQuoteStatus();
      notifyDashboardReload();
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "매수/매도 반영 실패");
    } finally {
      setApplyTradeBusy(false);
    }
  }, [
    tradeDraft,
    snapshot,
    loadSnapshot,
    loadGoals,
    loadTradeHistory,
    requestQuoteRefresh,
    loadQuoteStatus,
    notifyDashboardReload,
    router,
  ]);

  const createHolding = useCallback(async () => {
    const quantity = Number(holdingCreateDraft.quantity);
    const avgPrice = Number(holdingCreateDraft.avgPrice);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(avgPrice) || avgPrice <= 0) {
      setError("보유 종목은 수량과 평균단가가 필수입니다.");
      return;
    }
    if (!holdingCreateDraft.symbol.trim() || !holdingCreateDraft.name.trim()) {
      setError("심볼과 종목명을 입력하세요. 「보유 정보 자동 채움」으로 보정할 수 있습니다.");
      return;
    }
    const normalizedSymbol =
      holdingCreateDraft.market === "KR" && /^\d+$/.test(holdingCreateDraft.symbol.trim())
        ? holdingCreateDraft.symbol.trim().padStart(6, "0")
        : holdingCreateDraft.symbol.trim().toUpperCase();
    const dupKey = `${holdingCreateDraft.market}:${normalizedSymbol}`;
    const dup = snapshot?.holdings.some((h) => {
      if (h.market !== holdingCreateDraft.market) return false;
      const hs =
        h.market === "KR" && /^\d+$/.test(h.symbol.trim())
          ? h.symbol.trim().padStart(6, "0")
          : h.symbol.trim().toUpperCase();
      return hs === normalizedSymbol;
    });
    if (dup) {
      setHoldingDupNavKey(dupKey);
      setError("이미 보유 중입니다. 신규 추가가 아니라 매수/매도 반영을 사용하세요.");
      return;
    }
    setHoldingDupNavKey(null);
    setCreateBusy("holding");
    setError(null);
    setLedgerTradeBanner(null);
    setQuoteSyncStatus(null);
    const marketSave = holdingCreateDraft.market;
    const nameSave = holdingCreateDraft.name.trim();
    const hadGoogleTicker = holdingCreateDraft.googleTicker.trim().length > 0;
    try {
      const googleTicker =
        holdingCreateDraft.googleTicker.trim() ||
        getDefaultGoogleTicker(holdingCreateDraft.market, normalizedSymbol);
      const quoteSymbol =
        holdingCreateDraft.quoteSymbol.trim() ||
        getDefaultQuoteSymbol(holdingCreateDraft.market, normalizedSymbol, holdingCreateDraft.krQuoteMarket);
      const res = await fetch("/api/portfolio/holdings", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({
          ...holdingCreateDraft,
          symbol: normalizedSymbol,
          googleTicker,
          quoteSymbol,
          quantity,
          avgPrice,
          targetPrice: holdingCreateDraft.targetPrice.trim() ? Number(holdingCreateDraft.targetPrice) : undefined,
          stopPrice: holdingCreateDraft.stopPrice.trim() ? Number(holdingCreateDraft.stopPrice) : undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setHoldingCreateDraft((prev) => ({
        ...prev,
        symbol: "",
        name: "",
        quantity: "",
        avgPrice: "",
      }));
      setLedgerTradeBanner({
        kind: "success",
        message: data.message ?? "보유 종목 등록 완료",
      });
      const refreshOk = await requestQuoteRefresh();
      await loadQuoteStatus();
      await loadSnapshot();
      notifyDashboardReload();
      router.refresh();
      if (!hadGoogleTicker) {
        void suggestLedgerTicker("holding", marketSave, normalizedSymbol, { name: nameSave, origin: "holding_form" });
      }
      if (refreshOk) {
        setQuoteSyncStatus({
          kind: "info",
          message: "Google Sheets 계산 반영 대기 (30~90초)",
        });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "보유 종목 추가 실패");
    } finally {
      setCreateBusy(null);
    }
  }, [holdingCreateDraft, snapshot, loadSnapshot, requestQuoteRefresh, loadQuoteStatus, notifyDashboardReload, router, suggestLedgerTicker]);

  const createWatchlist = useCallback(async () => {
    if (!watchCreateDraft.symbol.trim() || !watchCreateDraft.name.trim()) {
      setError("심볼과 종목명이 필요합니다. 「관심 정보 자동 채움」으로 채울 수 있습니다.");
      return;
    }
    const normalizedSymbol =
      watchCreateDraft.market === "KR" && /^\d+$/.test(watchCreateDraft.symbol.trim())
        ? watchCreateDraft.symbol.trim().padStart(6, "0")
        : watchCreateDraft.symbol.trim().toUpperCase();
    const dup = snapshot?.watchlist.some((w) => {
      if (w.market !== watchCreateDraft.market) return false;
      const ws =
        w.market === "KR" && /^\d+$/.test(w.symbol.trim())
          ? w.symbol.trim().padStart(6, "0")
          : w.symbol.trim().toUpperCase();
      return ws === normalizedSymbol;
    });
    if (dup) {
      setWatchDupNavKey(`${watchCreateDraft.market}:${normalizedSymbol}`);
      setError("이미 관심종목에 있습니다. 수정 화면을 사용하세요.");
      return;
    }
    setWatchDupNavKey(null);
    setCreateBusy("watchlist");
    setError(null);
    setLedgerTradeBanner(null);
    setQuoteSyncStatus(null);
    const marketSave = watchCreateDraft.market;
    const nameSave = watchCreateDraft.name.trim();
    const hadGoogleTicker = watchCreateDraft.googleTicker.trim().length > 0;
    try {
      const googleTicker =
        watchCreateDraft.googleTicker.trim() ||
        getDefaultGoogleTicker(watchCreateDraft.market, normalizedSymbol);
      const quoteSymbol =
        watchCreateDraft.quoteSymbol.trim() ||
        getDefaultQuoteSymbol(watchCreateDraft.market, normalizedSymbol, watchCreateDraft.krQuoteMarket);
      const res = await fetch("/api/portfolio/watchlist", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({
          ...watchCreateDraft,
          symbol: normalizedSymbol,
          googleTicker,
          quoteSymbol,
        }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setWatchCreateDraft((prev) => ({ ...prev, symbol: "", name: "" }));
      setLedgerTradeBanner({ kind: "success", message: data.message ?? "관심종목 등록 완료" });
      await requestQuoteRefresh();
      await loadQuoteStatus();
      await loadSnapshot();
      notifyDashboardReload();
      router.refresh();
      if (!hadGoogleTicker) {
        void suggestLedgerTicker("watchlist", marketSave, normalizedSymbol, { name: nameSave, origin: "watchlist_form" });
      }
      setQuoteSyncStatus({ kind: "success", message: "시세 후보 동기화 완료" });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "관심종목 추가 실패");
    } finally {
      setCreateBusy(null);
    }
  }, [watchCreateDraft, snapshot, loadSnapshot, requestQuoteRefresh, loadQuoteStatus, notifyDashboardReload, router, suggestLedgerTicker]);

  const toggleHoldingEvents = useCallback(async (key: string) => {
    if (eventsOpenKey === key) {
      setEventsOpenKey(null);
      return;
    }
    setEventsOpenKey(key);
    if (eventsByKey[key]) return;
    setEventsBusyKey(key);
    try {
      const res = await fetch(`/api/portfolio/holdings/${encodeURIComponent(key)}/events`, {
        credentials: "same-origin",
      });
      const data = (await res.json()) as { events?: TradeEventRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setEventsByKey((prev) => ({ ...prev, [key]: data.events ?? [] }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "거래 이력 로드 실패");
    } finally {
      setEventsBusyKey(null);
    }
  }, [eventsByKey, eventsOpenKey]);

  const fetchSheetsPreview = useCallback(async () => {
    setError(null);
    setLoadingSheets(true);
    try {
      const res = await fetch("/api/integrations/google-sheets/preview", { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) {
        setError((data as { error?: string }).error ?? `HTTP ${res.status}`);
        setSheetsPreview(null);
        return;
      }
      setSheetsPreview(JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "미리보기 실패");
      setSheetsPreview(null);
    } finally {
      setLoadingSheets(false);
    }
  }, []);

  const runSheetsSync = useCallback(async () => {
    setError(null);
    setLoadingSheets(true);
    try {
      const res = await fetch("/api/integrations/google-sheets/sync", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSheetsPreview(JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "동기화 실패");
    } finally {
      setLoadingSheets(false);
    }
  }, []);

  const appendQueue = useCallback(async () => {
    setError(null);
    setLoadingQueue(true);
    try {
      let joPayload: unknown;
      try {
        joPayload = JSON.parse(queueJson) as unknown;
      } catch {
        setError("큐 JSON 파싱 실패");
        return;
      }
      const res = await fetch("/api/integrations/google-sheets/queue", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({ joPayload }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSheetsPreview(JSON.stringify({ ok: true, note: "ledger_change_queue에 한 줄 추가됨" }, null, 2));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "큐 추가 실패");
    } finally {
      setLoadingQueue(false);
    }
  }, [queueJson]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">포트폴리오 원장</h1>
          <p className="text-sm text-slate-500">
            INSERT / DELETE 만 허용. <strong className="text-slate-700">정합성 검사</strong> 통과 후{" "}
            <strong className="text-slate-700">원장 반영</strong>을 누르세요. user_key는 서버가 세션으로 채웁니다.
          </p>
          <OpsFeedbackButton domain="portfolio" component="PortfolioLedgerClient" className="mt-2" />
        </div>
        <Link href="/" className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800">
          ← 홈
        </Link>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
        <button
          type="button"
          onClick={() => setAdvancedMode(false)}
          className={`rounded px-3 py-1 ${!advancedMode ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}
        >
          기본 모드
        </button>
        <button
          type="button"
          onClick={() => setAdvancedMode(true)}
          className={`rounded px-3 py-1 ${advancedMode ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}
        >
          고급(SQL)
        </button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        Supabase에 <code className="rounded bg-amber-100 px-1">docs/sql/append_web_portfolio_ledger.sql</code> 적용 후
        사용하세요. 조일현 페르소나(persona-chat)에서도 동일 형식 SQL 초안을 요청할 수 있습니다.
      </div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        이 화면은 <strong>주문 실행이 아니라 기록 반영</strong>입니다. 실제 매수/매도는 외부 증권사에서 수행한 뒤 여기서 수량/평단을 사후 반영하세요.
      </div>
      {quoteSyncStatus ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            quoteSyncStatus.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : quoteSyncStatus.kind === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : quoteSyncStatus.kind === "error"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : "border-blue-200 bg-blue-50 text-blue-900"
          }`}
        >
          {quoteSyncStatus.message}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
        <p className="font-semibold text-slate-900">보유 종목 추가 (외부 매수 완료 후 기록용)</p>
        <p className="mt-1 text-[11px] text-slate-500">보유 종목은 수량과 평균단가가 필수입니다. 심볼·종목명·ticker는 「보유 정보 자동 채움」으로 추천할 수 있습니다(저장 전 확인).</p>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <select className="rounded border border-slate-300 bg-white px-2 py-1" value={holdingCreateDraft.market} onChange={(e) => setHoldingCreateDraft({ ...holdingCreateDraft, market: e.target.value as "KR" | "US" })}><option value="KR">KR</option><option value="US">US</option></select>
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="심볼" value={holdingCreateDraft.symbol} onChange={(e) => setHoldingCreateDraft({ ...holdingCreateDraft, symbol: e.target.value })} />
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="종목명" value={holdingCreateDraft.name} onChange={(e) => setHoldingCreateDraft({ ...holdingCreateDraft, name: e.target.value })} />
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="수량" value={holdingCreateDraft.quantity} onChange={(e) => setHoldingCreateDraft({ ...holdingCreateDraft, quantity: e.target.value })} />
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="평균단가" value={holdingCreateDraft.avgPrice} onChange={(e) => setHoldingCreateDraft({ ...holdingCreateDraft, avgPrice: e.target.value })} />
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="섹터(추천·확인)" value={holdingCreateDraft.sector} onChange={(e) => setHoldingCreateDraft({ ...holdingCreateDraft, sector: e.target.value })} />
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="투자 메모" value={holdingCreateDraft.investmentMemo} onChange={(e) => setHoldingCreateDraft({ ...holdingCreateDraft, investmentMemo: e.target.value })} />
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="판단 메모" value={holdingCreateDraft.judgmentMemo} onChange={(e) => setHoldingCreateDraft({ ...holdingCreateDraft, judgmentMemo: e.target.value })} />
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="목표가" value={holdingCreateDraft.targetPrice} onChange={(e) => setHoldingCreateDraft({ ...holdingCreateDraft, targetPrice: e.target.value })} />
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="손절가" value={holdingCreateDraft.stopPrice} onChange={(e) => setHoldingCreateDraft({ ...holdingCreateDraft, stopPrice: e.target.value })} />
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="google_ticker(선택·추천)" value={holdingCreateDraft.googleTicker} onChange={(e) => setHoldingCreateDraft({ ...holdingCreateDraft, googleTicker: e.target.value })} />
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="quote_symbol(선택·추천)" value={holdingCreateDraft.quoteSymbol} onChange={(e) => setHoldingCreateDraft({ ...holdingCreateDraft, quoteSymbol: e.target.value })} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-violet-900 disabled:opacity-50"
            disabled={ledgerTickerBusy}
            onClick={() => {
              const sym = normalizeTickerDraftSymbol(holdingCreateDraft.market, holdingCreateDraft.symbol);
              void suggestLedgerTicker("holding", holdingCreateDraft.market, sym, {
                name: holdingCreateDraft.name.trim(),
                origin: "holding_form",
              });
            }}
          >
            {ledgerTickerBusy ? "처리 중…" : "보유 ticker 자동 추천"}
          </button>
          <button
            type="button"
            className="rounded border border-teal-300 bg-teal-50 px-2 py-1 text-teal-900 disabled:opacity-50"
            disabled={suggestFillHoldingBusy}
            onClick={() => void fillHoldingFromSuggest()}
          >
            {suggestFillHoldingBusy ? "처리 중…" : "보유 정보 자동 채움"}
          </button>
          <button type="button" className="rounded border border-blue-600 bg-blue-600 px-3 py-1 text-white disabled:opacity-50" disabled={createBusy === "holding" || quoteRefreshBusy || quoteStatusBusy} onClick={() => void createHolding()}>{createBusy === "holding" ? "저장 중…" : "보유 종목 추가"}</button>
          <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1 disabled:opacity-50" disabled={quoteRefreshBusy} onClick={() => void requestQuoteRefresh()}>{quoteRefreshBusy ? "동기화 중…" : "시세 새로고침 요청"}</button>
          <Link href="/trade-journal" className="rounded border border-slate-300 bg-white px-2 py-1">Trade Journal 기록</Link>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
        <p className="font-semibold text-slate-900">관심종목 추가 (SQL 없이 등록)</p>
        <p className="mt-1 text-[11px] text-slate-500">관심종목은 수량/평단 없이 저장할 수 있습니다. 심볼·종목명·ticker는 「관심 정보 자동 채움」으로 추천할 수 있습니다.</p>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <select className="rounded border border-slate-300 bg-white px-2 py-1" value={watchCreateDraft.market} onChange={(e) => setWatchCreateDraft({ ...watchCreateDraft, market: e.target.value as "KR" | "US" })}><option value="KR">KR</option><option value="US">US</option></select>
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="심볼" value={watchCreateDraft.symbol} onChange={(e) => setWatchCreateDraft({ ...watchCreateDraft, symbol: e.target.value })} />
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="종목명" value={watchCreateDraft.name} onChange={(e) => setWatchCreateDraft({ ...watchCreateDraft, name: e.target.value })} />
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="섹터(추천·확인)" value={watchCreateDraft.sector} onChange={(e) => setWatchCreateDraft({ ...watchCreateDraft, sector: e.target.value })} />
          <input
            className="rounded border border-slate-300 bg-white px-2 py-1"
            placeholder="예: 섹터 조정 시 분할매수 후보"
            value={watchCreateDraft.interestReason}
            onChange={(e) => setWatchCreateDraft({ ...watchCreateDraft, interestReason: e.target.value })}
          />
          <input
            className="rounded border border-slate-300 bg-white px-2 py-1"
            placeholder="예: 거래량 증가, 20일선 회복, 실적 이벤트"
            value={watchCreateDraft.observationPoints}
            onChange={(e) => setWatchCreateDraft({ ...watchCreateDraft, observationPoints: e.target.value })}
          />
          <input
            className="rounded border border-slate-300 bg-white px-2 py-1"
            placeholder="예: 1차 00원, 2차 00원"
            value={watchCreateDraft.desiredBuyRange}
            onChange={(e) => setWatchCreateDraft({ ...watchCreateDraft, desiredBuyRange: e.target.value })}
          />
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="google_ticker(선택·추천)" value={watchCreateDraft.googleTicker} onChange={(e) => setWatchCreateDraft({ ...watchCreateDraft, googleTicker: e.target.value })} />
          <input className="rounded border border-slate-300 bg-white px-2 py-1" placeholder="quote_symbol(선택·추천)" value={watchCreateDraft.quoteSymbol} onChange={(e) => setWatchCreateDraft({ ...watchCreateDraft, quoteSymbol: e.target.value })} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-violet-900 disabled:opacity-50"
            disabled={ledgerTickerBusy}
            onClick={() => {
              const sym = normalizeTickerDraftSymbol(watchCreateDraft.market, watchCreateDraft.symbol);
              void suggestLedgerTicker("watchlist", watchCreateDraft.market, sym, {
                name: watchCreateDraft.name.trim(),
                origin: "watchlist_form",
              });
            }}
          >
            {ledgerTickerBusy ? "처리 중…" : "관심 ticker 자동 추천"}
          </button>
          <button
            type="button"
            className="rounded border border-teal-300 bg-teal-50 px-2 py-1 text-teal-900 disabled:opacity-50"
            disabled={suggestFillWatchBusy}
            onClick={() => void fillWatchFromSuggest()}
          >
            {suggestFillWatchBusy ? "처리 중…" : "관심 정보 자동 채움"}
          </button>
          <button type="button" className="rounded border border-blue-600 bg-blue-600 px-3 py-1 text-white disabled:opacity-50" disabled={createBusy === "watchlist" || quoteRefreshBusy || quoteStatusBusy} onClick={() => void createWatchlist()}>{createBusy === "watchlist" ? "저장 중…" : "관심종목 추가"}</button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-slate-800">보유 종목 관리 (빠른 수정/매수·매도 반영)</p>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1.5"
            onClick={() => void loadSnapshot()}
            disabled={loadingSnapshot}
          >
            {loadingSnapshot ? "로딩 중..." : "보유 목록 불러오기"}
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1.5"
            onClick={() => void loadGoals()}
          >
            목표 목록 불러오기
          </button>
        </div>
        {snapshot?.holdings?.length ? (
          <>
            {ledgerTradeBanner ? (
              <div
                className={`mt-2 rounded border px-3 py-2 text-[11px] ${
                  ledgerTradeBanner.kind === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-blue-200 bg-blue-50 text-blue-950"
                }`}
                role="status"
              >
                <p>{ledgerTradeBanner.message}</p>
                {ledgerTradeBanner.realizedEventId ? (
                  <p className="mt-1">
                    <Link href="/realized-pnl" className="font-medium underline underline-offset-2">
                      실현손익 대시보드로 이동
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="sr-only" aria-live="polite">
              {tradeDraft.key ? `매수·매도 반영 패널 열림: ${tradeDraft.key}` : "패널 닫힘"}
            </p>
            <div className="mt-3 overflow-auto">
              <table className="min-w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-2 py-1 text-left">종목</th>
                    <th className="px-2 py-1 text-left">수량</th>
                    <th className="px-2 py-1 text-left">평단</th>
                    <th className="px-2 py-1 text-left">google_ticker</th>
                    <th className="px-2 py-1 text-left">quote_symbol</th>
                    <th className="px-2 py-1 text-left">메모</th>
                    <th className="px-2 py-1 text-left">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.holdings.map((row) => {
                    const key = `${row.market}:${row.symbol}`;
                    const isEditing = editingKey === key && editDraft;
                    const isApplyTarget = tradeDraft.key === key;
                    return (
                      <tr
                        id={`holding-row-${key}`}
                        key={key}
                        className={`border-b border-slate-100 align-top ${isApplyTarget ? "bg-emerald-50/90 ring-1 ring-emerald-200 ring-inset" : ""}`}
                      >
                        <td className="px-2 py-1">
                          <p className="font-medium">{row.name}</p>
                          <p className="text-slate-500">{key}</p>
                        </td>
                        <td className="px-2 py-1">{isEditing ? <input className="w-20 rounded border border-slate-300 px-1 py-0.5" value={editDraft.qty} onChange={(e) => setEditDraft({ ...editDraft, qty: e.target.value })} /> : String(row.qty ?? "NO_DATA")}</td>
                        <td className="px-2 py-1">{isEditing ? <input className="w-24 rounded border border-slate-300 px-1 py-0.5" value={editDraft.avg_price} onChange={(e) => setEditDraft({ ...editDraft, avg_price: e.target.value })} /> : String(row.avg_price ?? "NO_DATA")}</td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <input
                              className="w-32 rounded border border-slate-300 px-1 py-0.5"
                              placeholder="예: KRX:005930"
                              value={editDraft.google_ticker}
                              onChange={(e) => setEditDraft({ ...editDraft, google_ticker: e.target.value })}
                            />
                          ) : (row.google_ticker ?? "-")}
                        </td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <input
                              className="w-28 rounded border border-slate-300 px-1 py-0.5"
                              placeholder="예: 005930.KS"
                              value={editDraft.quote_symbol}
                              onChange={(e) => setEditDraft({ ...editDraft, quote_symbol: e.target.value })}
                            />
                          ) : (row.quote_symbol ?? "-")}
                        </td>
                        <td className="px-2 py-1">{isEditing ? <textarea className="w-48 rounded border border-slate-300 px-1 py-0.5" value={editDraft.investment_memo} onChange={(e) => setEditDraft({ ...editDraft, investment_memo: e.target.value })} /> : (row.investment_memo ?? "-")}</td>
                        <td className="px-2 py-1">
                          <div className="flex flex-wrap gap-1">
                            {isEditing ? (
                              <>
                                <button type="button" className="rounded border border-blue-300 bg-blue-50 px-2 py-0.5" onClick={() => void saveEdit(key)}>저장</button>
                                <button type="button" className="rounded border border-slate-300 bg-white px-2 py-0.5" onClick={() => { setEditingKey(null); setEditDraft(null); }}>취소</button>
                              </>
                            ) : (
                              <button type="button" className="rounded border border-slate-300 bg-white px-2 py-0.5" onClick={() => startEdit(row)}>빠른 수정</button>
                            )}
                            <button type="button" className="rounded border border-red-300 bg-red-50 px-2 py-0.5 text-red-800" onClick={() => void removeHolding(key)}>삭제</button>
                            <button
                              type="button"
                              className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-800"
                              aria-expanded={isApplyTarget}
                              aria-controls="ledger-apply-trade-panel"
                              onClick={() => openApplyTradePanel(row)}
                            >
                              매수/매도 반영
                            </button>
                            <button
                              type="button"
                              className="rounded border border-violet-300 bg-violet-50 px-2 py-0.5 text-violet-900 disabled:opacity-50"
                              disabled={ledgerTickerBusy}
                              onClick={() =>
                                void suggestLedgerTicker("holding", row.market, row.symbol, {
                                  name: row.name,
                                  origin: "holding_row",
                                })
                              }
                            >
                              이 종목 ticker 추천
                            </button>
                            <button
                              type="button"
                              className="rounded border border-slate-300 bg-white px-2 py-0.5"
                              aria-expanded={eventsOpenKey === key}
                              onClick={() => void toggleHoldingEvents(key)}
                            >
                              거래 이력
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {tradeDraft.key ? (
              <div
                id="ledger-apply-trade-panel"
                ref={applyTradePanelRef}
                className="mt-3 rounded-lg border-2 border-emerald-400 bg-emerald-50/40 p-3 shadow-sm"
                role="region"
                aria-label="매수·매도·정정 반영"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-emerald-950">매수·매도·정정 반영</p>
                    <p className="mt-1 text-[11px] text-slate-700">
                      주문 실행이 아니라 <strong>사후 기록 반영</strong>입니다. 선택:{" "}
                      <span className="font-mono">{tradeDraft.key}</span>
                    </p>
                    {selectedApplyHolding ? (
                      <ul className="mt-2 list-inside list-disc text-[11px] text-slate-800">
                        <li>
                          종목: {selectedApplyHolding.name} · 시장 {selectedApplyHolding.market} · 심볼 {selectedApplyHolding.symbol}
                        </li>
                        <li>현재 수량: {String(selectedApplyHolding.qty ?? "—")}</li>
                        <li>현재 평균단가: {String(selectedApplyHolding.avg_price ?? "—")}</li>
                      </ul>
                    ) : (
                      <p className="mt-2 text-[11px] text-amber-800">선택한 종목을 목록에서 찾지 못했습니다. 목록을 새로고침하세요.</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded border border-slate-400 bg-white px-2 py-1 text-[11px] text-slate-800"
                    onClick={() => {
                      setTradeDraft({
                        key: null,
                        action: "buy",
                        quantity: "",
                        price: "",
                        newQuantity: "",
                        newAveragePrice: "",
                        memo: "",
                        moveToWatchlistOnFullSell: false,
                        feeKrw: "",
                        taxKrw: "",
                        tradeReason: "",
                        linkedGoalId: "",
                        allocationAmountKrw: "",
                      });
                    }}
                  >
                    패널 닫기
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-emerald-200/80 pt-3">
                  <label className="flex flex-col gap-0.5 text-[10px] text-slate-600">
                    유형
                    <select
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                      value={tradeDraft.action}
                      onChange={(e) =>
                        setTradeDraft({ ...tradeDraft, action: e.target.value as "buy" | "sell" | "correct" })
                      }
                    >
                      <option value="buy">매수 후 반영</option>
                      <option value="sell">매도 후 반영</option>
                      <option value="correct">단순 정정</option>
                    </select>
                  </label>
                  {tradeDraft.action !== "correct" ? (
                    <label className="flex flex-col gap-0.5 text-[10px] text-slate-600">
                      수량
                      <input
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                        placeholder="수량"
                        value={tradeDraft.quantity}
                        onChange={(e) => setTradeDraft({ ...tradeDraft, quantity: e.target.value })}
                      />
                    </label>
                  ) : null}
                  {tradeDraft.action !== "correct" ? (
                    <label className="flex flex-col gap-0.5 text-[10px] text-slate-600">
                      단가
                      <input
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                        placeholder="단가"
                        value={tradeDraft.price}
                        onChange={(e) => setTradeDraft({ ...tradeDraft, price: e.target.value })}
                      />
                    </label>
                  ) : null}
                  {tradeDraft.action === "correct" ? (
                    <label className="flex flex-col gap-0.5 text-[10px] text-slate-600">
                      새 수량
                      <input
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                        placeholder="새 수량"
                        value={tradeDraft.newQuantity}
                        onChange={(e) => setTradeDraft({ ...tradeDraft, newQuantity: e.target.value })}
                      />
                    </label>
                  ) : null}
                  {tradeDraft.action === "correct" ? (
                    <label className="flex flex-col gap-0.5 text-[10px] text-slate-600">
                      새 평균단가
                      <input
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                        placeholder="새 평균단가"
                        value={tradeDraft.newAveragePrice}
                        onChange={(e) => setTradeDraft({ ...tradeDraft, newAveragePrice: e.target.value })}
                      />
                    </label>
                  ) : null}
                  <label className="flex min-w-[200px] flex-col gap-0.5 text-[10px] text-slate-600">
                    메모
                    <input
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                      placeholder="메모 / 정정 이유"
                      value={tradeDraft.memo}
                      onChange={(e) => setTradeDraft({ ...tradeDraft, memo: e.target.value })}
                    />
                  </label>
                </div>
                {tradeDraft.action === "buy" && buyPreviewAvg != null ? (
                  <p className="mt-2 text-[11px] font-medium text-emerald-900">
                    예상 새 평균단가: {buyPreviewAvg.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}
                  </p>
                ) : null}
                {tradeDraft.action === "sell" && selectedApplyHolding ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className="flex flex-col gap-0.5 text-[10px] text-slate-600">
                      수수료(원)
                      <input
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                        placeholder="수수료"
                        value={tradeDraft.feeKrw}
                        onChange={(e) => setTradeDraft({ ...tradeDraft, feeKrw: e.target.value })}
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px] text-slate-600">
                      세금(원)
                      <input
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                        placeholder="세금"
                        value={tradeDraft.taxKrw}
                        onChange={(e) => setTradeDraft({ ...tradeDraft, taxKrw: e.target.value })}
                      />
                    </label>
                    <label className="flex min-w-[180px] flex-col gap-0.5 text-[10px] text-slate-600">
                      매도 사유
                      <input
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                        placeholder="매도 사유"
                        value={tradeDraft.tradeReason}
                        onChange={(e) => setTradeDraft({ ...tradeDraft, tradeReason: e.target.value })}
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px] text-slate-600">
                      목표 연결
                      <select
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                        value={tradeDraft.linkedGoalId}
                        onChange={(e) => setTradeDraft({ ...tradeDraft, linkedGoalId: e.target.value })}
                      >
                        <option value="">목표 연결 없음</option>
                        {goals.filter((goal) => goal.status === "active").map((goal) => (
                          <option key={goal.id} value={goal.id}>
                            {goal.goalName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px] text-slate-600">
                      목표 배분액(원)
                      <input
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                        placeholder="배분액"
                        value={tradeDraft.allocationAmountKrw}
                        onChange={(e) => setTradeDraft({ ...tradeDraft, allocationAmountKrw: e.target.value })}
                      />
                    </label>
                  </div>
                ) : null}
                {tradeDraft.action === "sell" &&
                selectedApplyHolding &&
                (() => {
                  const cur = parseQty(selectedApplyHolding.qty);
                  const sq = Number(tradeDraft.quantity);
                  return cur > 0 && Number.isFinite(sq) && sq > 0 && sq === cur;
                })() ? (
                  <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-800">
                    <input
                      type="checkbox"
                      checked={tradeDraft.moveToWatchlistOnFullSell}
                      onChange={(e) => setTradeDraft({ ...tradeDraft, moveToWatchlistOnFullSell: e.target.checked })}
                    />
                    전량 매도 시 관심 종목으로 이동
                  </label>
                ) : null}
                {tradeDraft.action === "sell" && selectedApplyHolding ? (
                  (() => {
                    const cur = parseQty(selectedApplyHolding.qty);
                    const sq = Number(tradeDraft.quantity);
                    if (!Number.isFinite(sq) || sq <= 0) return null;
                    if (sq > cur) {
                      return (
                        <p className="mt-2 text-[11px] font-medium text-red-700">
                          매도 수량이 보유 수량({cur})보다 큽니다. 저장할 수 없습니다.
                        </p>
                      );
                    }
                    return null;
                  })()
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
                    disabled={
                      applyTradeBusy ||
                      !selectedApplyHolding ||
                      (tradeDraft.action === "sell" &&
                        selectedApplyHolding != null &&
                        (() => {
                          const cur = parseQty(selectedApplyHolding.qty);
                          const sq = Number(tradeDraft.quantity);
                          return Number.isFinite(sq) && sq > cur;
                        })())
                    }
                    onClick={() => void applyTrade()}
                  >
                    {applyTradeBusy ? "Applying..." : "반영 저장"}
                  </button>
                </div>
              </div>
            ) : null}
            {eventsOpenKey ? (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-[11px]">
                <p className="font-semibold text-slate-900">거래 이력: {eventsOpenKey}</p>
                {eventsBusyKey === eventsOpenKey ? (
                  <p className="mt-2 text-slate-600">불러오는 중...</p>
                ) : (eventsByKey[eventsOpenKey]?.length ?? 0) === 0 ? (
                  <p className="mt-2 text-slate-600">기록된 거래 이력이 없습니다.</p>
                ) : (
                  <div className="mt-2 overflow-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="px-2 py-1 text-left">일자</th>
                          <th className="px-2 py-1 text-left">유형</th>
                          <th className="px-2 py-1 text-right">수량</th>
                          <th className="px-2 py-1 text-right">단가</th>
                          <th className="px-2 py-1 text-right">전 수량/평단</th>
                          <th className="px-2 py-1 text-right">후 수량/평단</th>
                          <th className="px-2 py-1 text-left">메모</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(eventsByKey[eventsOpenKey] ?? []).map((evt) => (
                          <tr key={evt.id} className="border-b border-slate-100">
                            <td className="px-2 py-1">{evt.tradeDate}</td>
                            <td className="px-2 py-1">{evt.eventType}</td>
                            <td className="px-2 py-1 text-right">{evt.quantity ?? "—"}</td>
                            <td className="px-2 py-1 text-right">{evt.price ?? "—"}</td>
                            <td className="px-2 py-1 text-right">{evt.beforeQuantity ?? "—"} / {evt.beforeAvgPrice ?? "—"}</td>
                            <td className="px-2 py-1 text-right">{evt.afterQuantity ?? "—"} / {evt.afterAvgPrice ?? "—"}</td>
                            <td className="px-2 py-1">{evt.reason ?? evt.memo ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-slate-500">보유 목록을 먼저 불러오세요.</p>
        )}
        {snapshot?.watchlist?.length ? (
          <div className="mt-4">
            <p className="font-semibold text-slate-800">관심 종목</p>
            <p className="mt-1 text-[11px] text-slate-600">
              Sector Radar와 연동된 <strong>관찰 우선순위</strong> 배지입니다. 매수 추천이 아니며,{" "}
              <Link href="/sector-radar" className="text-violet-700 underline underline-offset-2">
                섹터 온도계
              </Link>
              에서 전체 큐를 볼 수 있습니다.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <button
                type="button"
                className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-blue-900 disabled:opacity-50"
                disabled={watchSectorMatchBusy != null}
                onClick={() => void runWatchlistSectorMatch("preview")}
              >
                {watchSectorMatchBusy === "preview" ? "미리보기..." : "섹터 자동 매칭 미리보기"}
              </button>
              <button
                type="button"
                className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-900 disabled:opacity-50"
                disabled={watchSectorMatchBusy != null}
                onClick={() => void runWatchlistSectorMatch("apply")}
              >
                {watchSectorMatchBusy === "apply" ? "적용 중..." : "섹터 자동 매칭 적용"}
              </button>
              {watchSectorMatchMeta ? (
                <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">
                  매칭 {watchSectorMatchMeta.sectorMatch.matched} · 적용 {watchSectorMatchMeta.sectorMatch.applied} · 검토필요{" "}
                  {watchSectorMatchMeta.sectorMatch.needsReview} · 미매칭 {watchSectorMatchMeta.sectorMatch.noMatch}
                </span>
              ) : null}
            </div>
            {watchSectorMatchPreview.length > 0 ? (
              <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
                <p className="font-medium">자동 매칭 미리보기 (상위 8건)</p>
                <ul className="mt-1 list-disc pl-4">
                  {watchSectorMatchPreview.slice(0, 8).map((x) => (
                    <li key={`${x.name}-${x.rawTicker ?? ""}-${x.status}`}>
                      {x.name} ({x.rawTicker ?? "-"}) → {x.matchedSector ?? "미매칭"} · {x.confidence}점 ·{" "}
                      {x.needsReview ? "검토 필요" : "적용 가능"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-2 overflow-auto">
              <table className="min-w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-2 py-1 text-left">종목</th>
                    <th className="px-2 py-1 text-left">섹터 레이더</th>
                    <th className="px-2 py-1 text-left">google_ticker</th>
                    <th className="px-2 py-1 text-left">quote_symbol</th>
                    <th className="px-2 py-1 text-left">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.watchlist.map((row) => {
                    const key = `${row.market}:${row.symbol}`;
                    const symU = row.symbol.trim().toUpperCase();
                    const cand = watchRadarByKey.get(`${row.market}:${symU}`);
                    const zoneKo = (z: string) => {
                      if (z === "extreme_fear") return "극공포";
                      if (z === "fear") return "공포";
                      if (z === "neutral") return "중립";
                      if (z === "greed") return "탐욕";
                      if (z === "extreme_greed") return "과열";
                      return "NO_DATA";
                    };
                    return (
                      <tr id={`watch-row-${key}`} key={key} className="border-b border-slate-100">
                        <td className="px-2 py-1">
                          <p className="font-medium">{row.name}</p>
                          <p className="text-slate-500">{key}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {!row.sector?.trim() ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-950">섹터 연결 필요</span>
                            ) : null}
                            {cand?.sectorKey === "unlinked" ? (
                              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-800">섹터 키워드 미매칭</span>
                            ) : null}
                            {row.sector_match_confidence != null ? (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-900">
                                자동매칭 {row.sector_match_confidence}점
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-1 align-top">
                          {cand ? (
                            <div className="flex flex-col gap-1">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-800">
                                {zoneKo(cand.sectorZone)} · {cand.readinessScore}점
                              </span>
                              <span className="text-[10px] text-slate-500">{cand.sectorName}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1">{row.google_ticker ?? "-"}</td>
                        <td className="px-2 py-1">{row.quote_symbol ?? "-"}</td>
                        <td className="px-2 py-1">
                          <button
                            type="button"
                            className="rounded border border-violet-300 bg-violet-50 px-2 py-0.5 text-violet-900 disabled:opacity-50"
                            disabled={ledgerTickerBusy}
                            onClick={() =>
                              void suggestLedgerTicker("watchlist", row.market, row.symbol, {
                                name: row.name,
                                origin: "watchlist_row",
                              })
                            }
                          >
                            관심종목 ticker 추천
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        {ledgerTickerReqId || ledgerTickerRows.length > 0 ? (
          <div className="mt-4 rounded border border-violet-200 bg-violet-50/50 p-3 text-[11px] text-violet-950">
            <p className="font-semibold">GOOGLEFINANCE ticker 후보 (승인 후 DB 반영)</p>
            {ledgerTickerOrigin === "holding_form" || ledgerTickerOrigin === "watchlist_form" ? (
              <p className="mt-1 font-medium text-violet-950">이 폼에서 요청한 후보입니다.</p>
            ) : null}
            <p className="mt-1 text-violet-900/90">
              requestId: {ledgerTickerReqId ?? "—"} · Google Sheets 계산까지 30~90초 걸릴 수 있습니다. 자동 저장 없음.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-violet-400 bg-white px-2 py-1 disabled:opacity-50"
                disabled={ledgerTickerStatusBusy || !ledgerTickerReqId}
                onClick={() => void loadLedgerTickerStatus()}
              >
                {ledgerTickerStatusBusy ? "읽는 중…" : "추천 결과"}
              </button>
            </div>
            {ledgerTickerRows.length > 0 ? (
              <div className="mt-2 overflow-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-violet-200 text-violet-800">
                      <th className="px-2 py-1 text-left">종목</th>
                      <th className="px-2 py-1 text-left">후보 ticker</th>
                      <th className="px-2 py-1 text-right">가격</th>
                      <th className="px-2 py-1 text-left">통화</th>
                      <th className="px-2 py-1 text-left">googleName</th>
                      <th className="px-2 py-1 text-left">상태</th>
                      <th className="px-2 py-1 text-left">적용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerTickerRows.map((row) => (
                      <tr key={`${row.targetType}-${row.market}-${row.symbol}-${row.candidateTicker}`}>
                        <td className="px-2 py-1">{row.name ?? row.symbol}</td>
                        <td className="px-2 py-1 font-mono">{row.candidateTicker}</td>
                        <td className="px-2 py-1 text-right">{row.parsedPrice == null ? "—" : row.parsedPrice.toLocaleString("ko-KR")}</td>
                        <td className="px-2 py-1">{row.currency ?? "—"}</td>
                        <td className="px-2 py-1">{row.googleName ?? "—"}</td>
                        <td className="px-2 py-1">{row.status}</td>
                        <td className="px-2 py-1">
                          <button
                            type="button"
                            className="rounded border border-violet-500 bg-white px-2 py-0.5 disabled:opacity-40"
                            disabled={row.status !== "ok"}
                            onClick={() => {
                              void (async () => {
                                setError(null);
                                try {
                                  const apply = await fetch("/api/portfolio/ticker-resolver/apply", {
                                    method: "POST",
                                    headers: jsonHeaders,
                                    credentials: "same-origin",
                                    body: JSON.stringify({
                                      targetType: row.targetType === "watchlist" ? "watchlist" : "holding",
                                      market: row.market,
                                      symbol: row.symbol,
                                      googleTicker: row.candidateTicker,
                                      quoteSymbol:
                                        row.market === "KR"
                                          ? `${row.symbol.replace(/\D/g, "").padStart(6, "0")}.KS`
                                          : undefined,
                                    }),
                                  });
                                  const ar = (await apply.json()) as { error?: string; message?: string };
                                  if (!apply.ok) throw new Error(ar.error ?? `HTTP ${apply.status}`);
                                  const qref = await fetch("/api/portfolio/quotes/refresh", {
                                    method: "POST",
                                    credentials: "same-origin",
                                  });
                                  if (!qref.ok) {
                                    const qr = (await qref.json()) as { error?: string };
                                    throw new Error(qr.error ?? "시세 새로고침 실패");
                                  }
                                  setLedgerTradeBanner({
                                    kind: "info",
                                    message:
                                      ar.message ??
                                      "저장 및 시세 새로고침 요청 완료. 30~90초 후 /portfolio에서 확인하세요.",
                                  });
                                  await loadSnapshot();
                                } catch (e: unknown) {
                                  setError(e instanceof Error ? e.message : "적용 실패");
                                }
                              })();
                            }}
                          >
                            적용
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {advancedMode ? (
        <div className="rounded-lg border border-slate-300 bg-slate-50 p-3 text-xs text-slate-800">
          <p className="font-semibold text-slate-900">고급(SQL) 운영 기능</p>
          <p className="mt-1 text-slate-600">
            SQL 검증/반영, raw JSON preview, ledger queue append는 운영자 전용입니다.
          </p>
          <div className="mt-3">
            <textarea
              className="min-h-[220px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              spellCheck={false}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50"
                onClick={() => void runValidate()}
                disabled={loadingV || loadingA}
              >
                {loadingV ? "검사 중…" : "SQL 정합성 검사"}
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 disabled:opacity-50"
                onClick={() => void runApply()}
                disabled={loadingA || loadingV || !canApply}
                title={!canApply ? "먼저 정합성 검사를 통과해야 합니다." : undefined}
              >
                {loadingA ? "반영 중…" : "원장 반영"}
              </button>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
            <p className="font-semibold text-slate-900">Google Sheets 운영 대시보드 (보조)</p>
            <p className="mt-1 text-slate-600">
              원장은 항상 Supabase가 기준입니다. 시트는 동기화·요약용이며, 시트만 고쳐서 DB가 바뀌지는 않습니다.
              반영은 SQL 검증/적용 또는 조일현 → validate/apply 흐름을 사용하세요.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-slate-800 disabled:opacity-50"
                disabled={loadingSheets || loadingQueue}
                onClick={() => void fetchSheetsPreview()}
              >
                {loadingSheets ? "불러오는 중…" : "시트용 JSON 미리보기"}
              </button>
              <button
                type="button"
                className="rounded border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-emerald-900 disabled:opacity-50"
                disabled={loadingSheets || loadingQueue}
                onClick={() => void runSheetsSync()}
              >
                Sheets 동기화 (4탭)
              </button>
            </div>
            <label className="mt-3 block text-[11px] font-medium text-slate-700">ledger_change_queue에 append (jo_ledger_v1 JSON)</label>
            <textarea
              className="mt-1 min-h-[72px] w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px]"
              value={queueJson}
              onChange={(e) => setQueueJson(e.target.value)}
              spellCheck={false}
            />
            <button
              type="button"
              className="mt-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-slate-800 disabled:opacity-50"
              disabled={loadingQueue || loadingSheets}
              onClick={() => void appendQueue()}
            >
              {loadingQueue ? "추가 중…" : "큐에 한 줄 추가 (DB 미변경)"}
            </button>
            {sheetsPreview ? (
              <pre className="mt-2 max-h-40 overflow-auto rounded border border-slate-200 bg-white p-2 text-[10px] text-slate-700">
                {sheetsPreview}
              </pre>
            ) : null}
          </div>
        </div>
      ) : null}

      {error || suggestFormBanner ? (
        <div className="space-y-2">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 whitespace-pre-wrap">
              {error}
              {holdingDupNavKey ? (
                <div className="mt-2">
                  <button
                    type="button"
                    className="rounded border border-red-400 bg-white px-2 py-1 text-xs font-medium text-red-900"
                    onClick={() => {
                      document.getElementById(`holding-row-${holdingDupNavKey}`)?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }}
                  >
                    기존 보유로 이동
                  </button>
                </div>
              ) : null}
              {watchDupNavKey ? (
                <div className="mt-2">
                  <button
                    type="button"
                    className="rounded border border-red-400 bg-white px-2 py-1 text-xs font-medium text-red-900"
                    onClick={() => {
                      document.getElementById(`watch-row-${watchDupNavKey}`)?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }}
                  >
                    관심 목록으로 이동
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {suggestFormBanner ? (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                suggestFormBanner.kind === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              {suggestFormBanner.message}
            </div>
          ) : null}
        </div>
      ) : null}

      {advancedMode && validateResult ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-800">검사 결과: {validateResult.ok ? "통과" : "실패"}</p>
          <ul className="mt-2 list-inside list-disc text-xs text-slate-600">
            <li>보유 INSERT: {validateResult.summary.insertHoldings}</li>
            <li>관심 INSERT: {validateResult.summary.insertWatchlist}</li>
            <li>보유 DELETE: {validateResult.summary.deleteHoldings}</li>
            <li>관심 DELETE: {validateResult.summary.deleteWatchlist}</li>
          </ul>
          {validateResult.errors.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-xs text-red-700">
              {validateResult.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {advancedMode && applyResult?.ok ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          원장 반영 완료: {applyResult.applied}건 처리
        </div>
      ) : null}
    </div>
  );
}
