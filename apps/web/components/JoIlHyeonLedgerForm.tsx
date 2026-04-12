"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  JoLedgerEditMode,
  JoLedgerLedgerTarget,
  JoLedgerPayloadV1,
  JoLedgerPriority,
} from "@office-unify/shared-types";
import { PERSONA_CHAT_USER_MESSAGE_MAX_CHARS } from "@office-unify/shared-types";

type SnapshotRow = {
  market: string;
  symbol: string;
  name: string;
  sector: string | null;
  investment_memo: string | null;
  qty: number | string | null;
  avg_price: number | string | null;
  target_price: number | string | null;
  judgment_memo: string | null;
};

type WatchSnap = {
  market: string;
  symbol: string;
  name: string;
  sector: string | null;
  investment_memo: string | null;
  interest_reason: string | null;
  desired_buy_range: string | null;
  observation_points: string | null;
  priority: string | null;
};

function parseNum(s: string): number | null {
  const t = s.replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function mergeKey(market: string, symbol: string): string {
  return `${market}|${symbol.trim().toUpperCase()}`;
}

/** SQL 미리보기용 이스케이프 (표시만) */
function sqlLit(s: string | null | undefined): string {
  if (s == null || s === "") return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}

function sqlNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "NULL";
  return String(n);
}

type Props = {
  disabled?: boolean;
  onSubmitContent: (jsonText: string) => void;
};

export function JoIlHyeonLedgerForm(props: Props) {
  const { disabled, onSubmitContent } = props;

  const [ledgerTarget, setLedgerTarget] = useState<JoLedgerLedgerTarget>("holding");
  const [actionType, setActionType] = useState<"upsert" | "delete">("upsert");
  const [editMode, setEditMode] = useState<JoLedgerEditMode>("full");
  const [market, setMarket] = useState<"KR" | "US">("KR");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [sector, setSector] = useState("");
  const [investmentMemo, setInvestmentMemo] = useState("");
  const [qty, setQty] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [judgmentMemo, setJudgmentMemo] = useState("");
  const [interestReason, setInterestReason] = useState("");
  const [desiredBuyRange, setDesiredBuyRange] = useState("");
  const [observationPoints, setObservationPoints] = useState("");
  const [priority, setPriority] = useState<JoLedgerPriority | "">("");

  const [loadMsg, setLoadMsg] = useState<string | null>(null);
  const [loadingSnap, setLoadingSnap] = useState(false);

  /** 성공적으로 불러온 행(병합 신뢰 기준) */
  const [holdingBaseline, setHoldingBaseline] = useState<SnapshotRow | null>(null);
  const [holdingMergeKey, setHoldingMergeKey] = useState<string | null>(null);
  const [canonicalHoldingName, setCanonicalHoldingName] = useState<string | null>(null);

  const [watchlistBaseline, setWatchlistBaseline] = useState<WatchSnap | null>(null);
  const [canonicalWatchlistName, setCanonicalWatchlistName] = useState<string | null>(null);

  const holdingPartial =
    ledgerTarget === "holding" && actionType === "upsert" && editMode !== "full";

  const inputMergeKey = useMemo(() => mergeKey(market, symbol), [market, symbol]);

  const holdingMergeReady =
    holdingPartial &&
    holdingBaseline != null &&
    holdingMergeKey != null &&
    holdingMergeKey === inputMergeKey;

  const holdingMergeBroken =
    holdingPartial && holdingBaseline != null && holdingMergeKey != null && holdingMergeKey !== inputMergeKey;

  const nameDiffersFromCanonical =
    ledgerTarget === "holding" &&
    canonicalHoldingName != null &&
    name.trim() !== "" &&
    name.trim() !== canonicalHoldingName.trim();

  const nameDiffersWatchlist =
    ledgerTarget === "watchlist" &&
    canonicalWatchlistName != null &&
    name.trim() !== "" &&
    name.trim() !== canonicalWatchlistName.trim();

  const resetHoldingMerge = useCallback(() => {
    setHoldingBaseline(null);
    setHoldingMergeKey(null);
    setCanonicalHoldingName(null);
  }, []);

  const resetWatchlistMerge = useCallback(() => {
    setWatchlistBaseline(null);
    setCanonicalWatchlistName(null);
  }, []);

  const loadHoldingRow = useCallback(async () => {
    setLoadMsg(null);
    if (!symbol.trim()) {
      setLoadMsg("종목코드/티커를 먼저 입력하세요. (원장 조회는 시장+심볼 기준입니다)");
      return;
    }
    setLoadingSnap(true);
    try {
      const res = await fetch("/api/portfolio/ledger/snapshot", { credentials: "same-origin" });
      const data = (await res.json()) as { holdings?: SnapshotRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const rows = data.holdings ?? [];
      const sym = symbol.trim().toUpperCase();
      const row = rows.find(
        (r) => r.market?.toUpperCase() === market && r.symbol?.trim().toUpperCase() === sym,
      );
      if (!row) {
        resetHoldingMerge();
        setLoadMsg(
          "해당 시장/심볼의 보유 행을 찾지 못했습니다. 시장(KR/US)·티커를 확인하거나, 전체 입력으로 신규 추가하세요.",
        );
        if (process.env.NODE_ENV === "development") {
          console.debug("[jo-ledger] snapshot merge miss holding", { market, symbol: sym, rowCount: rows.length });
        }
        return;
      }
      const canonical = String(row.name ?? "").trim();
      const prevName = name.trim();
      setCanonicalHoldingName(canonical || null);
      setName(canonical || prevName);
      setHoldingBaseline(row);
      setHoldingMergeKey(mergeKey(market, symbol));
      setSector(row.sector != null ? String(row.sector) : "");
      setInvestmentMemo(row.investment_memo != null ? String(row.investment_memo) : "");
      setQty(row.qty != null ? String(row.qty) : "");
      setAvgPrice(row.avg_price != null ? String(row.avg_price) : "");
      setTargetPrice(row.target_price != null ? String(row.target_price) : "");
      setJudgmentMemo(row.judgment_memo != null ? String(row.judgment_memo) : "");

      let msg = "원장에서 보유 행을 불러왔습니다. 심볼·시장이 같으면 동일 종목으로 upsert됩니다.";
      if (prevName && canonical && prevName !== canonical) {
        msg += ` 종목명은 원장 기준(${canonical})으로 맞췄습니다.`;
      }
      setLoadMsg(msg);
      if (process.env.NODE_ENV === "development") {
        console.debug("[jo-ledger] snapshot merge ok holding", {
          mergeKey: mergeKey(market, symbol),
          fieldsFromLedger: ["qty", "avg_price", "target_price", "investment_memo", "judgment_memo"],
        });
      }
    } catch (e: unknown) {
      resetHoldingMerge();
      setLoadMsg(e instanceof Error ? e.message : "불러오기 실패");
      if (process.env.NODE_ENV === "development") {
        console.debug("[jo-ledger] snapshot fetch error", e);
      }
    } finally {
      setLoadingSnap(false);
    }
  }, [market, symbol, name, resetHoldingMerge]);

  const loadWatchlistRow = useCallback(async () => {
    setLoadMsg(null);
    if (!symbol.trim()) {
      setLoadMsg("종목코드를 입력하세요.");
      return;
    }
    setLoadingSnap(true);
    try {
      const res = await fetch("/api/portfolio/ledger/snapshot", { credentials: "same-origin" });
      const data = (await res.json()) as { watchlist?: WatchSnap[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const rows = data.watchlist ?? [];
      const sym = symbol.trim().toUpperCase();
      const row = rows.find(
        (r) => r.market?.toUpperCase() === market && r.symbol?.trim().toUpperCase() === sym,
      );
      if (!row) {
        resetWatchlistMerge();
        setLoadMsg("해당 시장/심볼의 관심 행을 찾지 못했습니다. 식별자를 확인하세요.");
        return;
      }
      const canonical = String(row.name ?? "").trim();
      const prevName = name.trim();
      setCanonicalWatchlistName(canonical || null);
      setName(canonical || prevName);
      setWatchlistBaseline(row);
      setSector(row.sector != null ? String(row.sector) : "");
      setInvestmentMemo(row.investment_memo != null ? String(row.investment_memo) : "");
      setInterestReason(row.interest_reason != null ? String(row.interest_reason) : "");
      setDesiredBuyRange(row.desired_buy_range != null ? String(row.desired_buy_range) : "");
      setObservationPoints(row.observation_points != null ? String(row.observation_points) : "");
      setPriority((row.priority as JoLedgerPriority) || "");
      let msg = "원장에서 관심 행을 불러왔습니다.";
      if (prevName && canonical && prevName !== canonical) {
        msg += ` 종목명은 원장 기준(${canonical})으로 맞췄습니다.`;
      }
      setLoadMsg(msg);
    } catch (e: unknown) {
      resetWatchlistMerge();
      setLoadMsg(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoadingSnap(false);
    }
  }, [market, symbol, name, resetWatchlistMerge]);

  const buildPayload = (): JoLedgerPayloadV1 => {
    const base: JoLedgerPayloadV1 = {
      schema: "jo_ledger_v1",
      ledgerTarget,
      actionType,
      market,
      name: name.trim(),
      symbol: symbol.trim(),
    };
    if (actionType === "delete") return base;

    if (ledgerTarget === "holding") {
      const p: JoLedgerPayloadV1 = {
        ...base,
        actionType: "upsert",
        editMode,
        sector: sector.trim() || undefined,
        investmentMemo: investmentMemo.trim() || undefined,
        qty: parseNum(qty),
        avgPrice: parseNum(avgPrice),
        targetPrice: parseNum(targetPrice),
        judgmentMemo: judgmentMemo.trim() || undefined,
      };
      return p;
    }

    return {
      ...base,
      actionType: "upsert",
      sector: sector.trim() || undefined,
      investmentMemo: investmentMemo.trim() || undefined,
      interestReason: interestReason.trim() || undefined,
      desiredBuyRange: desiredBuyRange.trim() || undefined,
      observationPoints: observationPoints.trim() || undefined,
      priority: priority || undefined,
    };
  };

  const holdingInsertPreview = useMemo(() => {
    if (ledgerTarget !== "holding" || actionType !== "upsert") return null;
    const q = parseNum(qty);
    const a = parseNum(avgPrice);
    const t = parseNum(targetPrice);
    return `INSERT INTO web_portfolio_holdings (market, symbol, name, sector, investment_memo, qty, avg_price, target_price, judgment_memo) VALUES (${sqlLit(
      market,
    )}, ${sqlLit(symbol.trim())}, ${sqlLit(name.trim())}, ${sqlLit(sector.trim() || null)}, ${sqlLit(
      investmentMemo.trim() || null,
    )}, ${sqlNum(q)}, ${sqlNum(a)}, ${sqlNum(t)}, ${sqlLit(judgmentMemo.trim() || null)});`;
  }, [
    ledgerTarget,
    actionType,
    market,
    symbol,
    name,
    sector,
    investmentMemo,
    qty,
    avgPrice,
    targetPrice,
    judgmentMemo,
  ]);

  const watchlistInsertPreview = useMemo(() => {
    if (ledgerTarget !== "watchlist" || actionType !== "upsert") return null;
    return `INSERT INTO web_portfolio_watchlist (market, symbol, name, sector, investment_memo, interest_reason, desired_buy_range, observation_points, priority) VALUES (${sqlLit(
      market,
    )}, ${sqlLit(symbol.trim())}, ${sqlLit(name.trim())}, ${sqlLit(sector.trim() || null)}, ${sqlLit(
      investmentMemo.trim() || null,
    )}, ${sqlLit(interestReason.trim() || null)}, ${sqlLit(desiredBuyRange.trim() || null)}, ${sqlLit(
      observationPoints.trim() || null,
    )}, ${sqlLit(priority || null)});`;
  }, [
    ledgerTarget,
    actionType,
    market,
    symbol,
    name,
    sector,
    investmentMemo,
    interestReason,
    desiredBuyRange,
    observationPoints,
    priority,
  ]);

  const deletePreview = useMemo(() => {
    if (actionType !== "delete") return null;
    const table = ledgerTarget === "holding" ? "web_portfolio_holdings" : "web_portfolio_watchlist";
    return `DELETE FROM ${table} WHERE symbol = ${sqlLit(symbol.trim())} AND market = ${sqlLit(market)};`;
  }, [actionType, ledgerTarget, market, symbol]);

  const statusBadge = useMemo(() => {
    if (actionType === "delete") return { label: "DELETE 한 줄", tone: "slate" as const };
    if (ledgerTarget === "holding" && holdingPartial) {
      if (holdingMergeBroken) return { label: "식별자 불일치 — 다시 불러오기", tone: "amber" as const };
      if (holdingMergeReady) return { label: "부분 병합됨 · INSERT(upsert) 예상", tone: "emerald" as const };
      return { label: "기존 보유 row 필요", tone: "amber" as const };
    }
    if (ledgerTarget === "holding") return { label: "전체 입력 · INSERT(upsert)", tone: "emerald" as const };
    return { label: "관심 · INSERT(upsert)", tone: "emerald" as const };
  }, [actionType, ledgerTarget, holdingPartial, holdingMergeBroken, holdingMergeReady]);

  const fieldDelta = (
    label: string,
    before: string | null | undefined,
    after: string | null | undefined,
  ) => {
    const b = before == null || before === "" ? "—" : String(before);
    const a = after == null || after === "" ? "—" : String(after);
    const changed = b !== a;
    return (
      <div key={label} className="grid grid-cols-[1fr_auto_1fr] gap-1 text-[11px] leading-snug">
        <span className="text-slate-500">{label}</span>
        <span className={changed ? "text-amber-800" : "text-slate-400"}>{changed ? "변경" : "유지"}</span>
        <span className="font-mono text-slate-800">{changed ? <>{b} → {a}</> : a}</span>
      </div>
    );
  };

  const handleSubmit = () => {
    const payload = buildPayload();
    const text = JSON.stringify(payload, null, 2);
    if (text.length > PERSONA_CHAT_USER_MESSAGE_MAX_CHARS) {
      setLoadMsg(`JSON이 ${PERSONA_CHAT_USER_MESSAGE_MAX_CHARS}자를 초과합니다. 필드를 줄이세요.`);
      return;
    }

    if (!symbol.trim()) {
      setLoadMsg("종목코드/티커는 필수입니다.");
      return;
    }
    if (!market) {
      setLoadMsg("시장(KR/US)을 선택하세요.");
      return;
    }

    if (actionType === "delete") {
      if (!payload.symbol || !payload.name) {
        setLoadMsg("제거 시에도 종목명·종목코드가 필요합니다(DELETE WHERE에는 symbol·market 사용).");
        return;
      }
    }

    if (ledgerTarget === "holding" && actionType === "upsert") {
      if (holdingPartial) {
        if (holdingMergeBroken) {
          setLoadMsg(
            "시장 또는 종목코드가 불러온 행과 다릅니다. 「원장에서 보유 행 불러오기」를 다시 실행하거나 식별자를 맞추세요.",
          );
          return;
        }
        if (!holdingMergeReady) {
          setLoadMsg(
            "부분 수정은 기존 보유 행이 있어야 합니다. 먼저 「원장에서 보유 행 불러오기」로 병합한 뒤 진행하세요.",
          );
          return;
        }
        const q = parseNum(qty);
        const a = parseNum(avgPrice);
        const t = parseNum(targetPrice);
        if (q == null || a == null || t == null) {
          setLoadMsg(
            "부분 수정도 반영 엔진은 INSERT upsert 한 줄입니다. 수량·평단·목표가가 비어 있으면 안 됩니다. 원장 불러오기로 채우세요.",
          );
          return;
        }
      } else if (editMode === "full") {
        const q = parseNum(qty);
        const a = parseNum(avgPrice);
        if (q == null || a == null) {
          setLoadMsg(
            "전체 입력 모드에서 수량·평균단가가 비어 있으면 validator에서 실패할 가능성이 큽니다. 숫자를 입력하거나 원장에서 불러오세요.",
          );
          return;
        }
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.debug("[jo-ledger] submit", {
        holdingPartial,
        holdingMergeReady,
        editMode,
        payloadSummary: {
          ledgerTarget: payload.ledgerTarget,
          actionType: payload.actionType,
          market: payload.market,
          symbol: payload.symbol,
        },
      });
    }

    setLoadMsg(null);
    onSubmitContent(text);
  };

  const fullHoldingWarning =
    ledgerTarget === "holding" && actionType === "upsert" && editMode === "full" && (parseNum(qty) == null || parseNum(avgPrice) == null);

  const watchlistPriorityWarn = ledgerTarget === "watchlist" && actionType === "upsert" && !priority;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 text-sm">
      <p className="text-xs text-emerald-900/90">
        구조화 입력 → 조일현에게 JSON으로 전달됩니다. 반영 엔진은{" "}
        <strong>INSERT(upsert)와 DELETE만</strong> 허용합니다. 수정은 UPDATE가 아니라 <strong>동일 키(market+symbol) INSERT</strong>로
        덮어씁니다. 생성 SQL은 <strong className="text-emerald-950">포트 원장</strong> 화면에서 검증할 수 있습니다.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${
            statusBadge.tone === "amber"
              ? "bg-amber-100 text-amber-950"
              : statusBadge.tone === "slate"
                ? "bg-slate-200 text-slate-800"
                : "bg-emerald-200 text-emerald-950"
          }`}
        >
          {statusBadge.label}
        </span>
        {holdingPartial ? (
          <span className="text-[11px] text-slate-600">부분 수정은 원장 스냅샷 병합에 의존합니다. snapshot이 없으면 진행할 수 없습니다.</span>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-700">1) 대상</span>
          <select
            className="rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-900"
            value={ledgerTarget}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value as JoLedgerLedgerTarget;
              setLedgerTarget(v);
              resetHoldingMerge();
              resetWatchlistMerge();
              setLoadMsg(null);
            }}
          >
            <option value="holding">보유</option>
            <option value="watchlist">관심</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-700">2) 동작</span>
          <select
            className="rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-900"
            value={actionType}
            disabled={disabled}
            onChange={(e) => {
              setActionType(e.target.value as "upsert" | "delete");
              setLoadMsg(null);
            }}
          >
            <option value="upsert">추가·수정(upsert)</option>
            <option value="delete">제거(DELETE)</option>
          </select>
        </label>
      </div>

      {ledgerTarget === "holding" && actionType === "upsert" ? (
        <div className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-700">3) 빠른 수정 (보유)</span>
          <select
            className="rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-900"
            value={editMode}
            disabled={disabled}
            onChange={(e) => {
              setEditMode(e.target.value as JoLedgerEditMode);
              resetHoldingMerge();
              setLoadMsg(null);
            }}
          >
            <option value="full">전체 입력</option>
            <option value="memo_only">메모만 수정</option>
            <option value="target_only">목표가만 수정</option>
            <option value="memo_target">메모 + 목표가만 수정</option>
          </select>
          {holdingPartial ? (
            <p className="text-[11px] text-amber-800">
              실제 DB는 UPDATE가 아니라 <strong>동일 키 INSERT upsert</strong>입니다. 원장에 없는 종목은 부분 수정 대신{" "}
              <strong>전체 입력</strong>으로 추가하세요.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 text-xs">
        <span className="font-medium text-slate-700">4) 시장</span>
        <label className="inline-flex items-center gap-1">
          <input type="radio" name="mkt" checked={market === "KR"} disabled={disabled} onChange={() => setMarket("KR")} />
          KR
        </label>
        <label className="inline-flex items-center gap-1">
          <input type="radio" name="mkt" checked={market === "US"} disabled={disabled} onChange={() => setMarket("US")} />
          US
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          종목코드/티커
          <input
            className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-slate-900"
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value);
            }}
            placeholder="005930, AAPL …"
            disabled={disabled}
          />
          <span className="text-[10px] text-slate-500">원장 조회·병합은 심볼+시장을 기준으로 합니다.</span>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          종목명
          <input
            className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-900"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="삼성전자 …"
            disabled={disabled}
          />
          {nameDiffersFromCanonical ? (
            <span className="text-[11px] text-amber-800">
              입력한 종목명이 원장({canonicalHoldingName})과 다릅니다. 반영 시 잘못된 이름이 들어갈 수 있어{" "}
              <button
                type="button"
                className="underline"
                onClick={() => canonicalHoldingName && setName(canonicalHoldingName)}
              >
                원장 이름으로 맞추기
              </button>
              를 권장합니다.
            </span>
          ) : null}
          {nameDiffersWatchlist ? (
            <span className="text-[11px] text-amber-800">
              종목명이 원장({canonicalWatchlistName})과 다릅니다.{" "}
              <button type="button" className="underline" onClick={() => canonicalWatchlistName && setName(canonicalWatchlistName)}>
                원장 이름으로 맞추기
              </button>
            </span>
          ) : null}
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs">
        섹터 (선택)
        <input
          className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-900"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          placeholder="반도체, 기술주 …"
          disabled={disabled}
        />
      </label>

      {actionType === "delete" ? (
        <p className="text-xs text-slate-600">
          제거 시 SQL은 <code className="rounded bg-slate-100 px-1">DELETE</code> 한 줄만 생성합니다.{" "}
          <code className="rounded bg-slate-100 px-1">symbol</code>·<code className="rounded bg-slate-100 px-1">market</code> 조건으로
          삭제됩니다.
        </p>
      ) : ledgerTarget === "holding" ? (
        <>
          {ledgerTarget === "holding" && actionType === "upsert" && holdingPartial ? (
            <button
              type="button"
              className="self-start rounded border border-emerald-600 bg-white px-3 py-1.5 text-xs text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
              disabled={disabled || loadingSnap}
              onClick={() => void loadHoldingRow()}
            >
              {loadingSnap ? "불러오는 중…" : "원장에서 보유 행 불러오기"}
            </button>
          ) : null}

          {holdingBaseline && holdingPartial ? (
            <div className="rounded border border-slate-200 bg-white/80 p-2 text-[11px] text-slate-800">
              <p className="mb-1 font-medium text-slate-700">불러온 원장 값 (참고)</p>
              <p className="font-mono text-[10px] text-slate-600">
                qty={String(holdingBaseline.qty ?? "—")} · avg={String(holdingBaseline.avg_price ?? "—")} · target=
                {String(holdingBaseline.target_price ?? "—")}
              </p>
              <p className="mt-1 line-clamp-2 text-slate-600">investment_memo: {holdingBaseline.investment_memo ?? "—"}</p>
              <p className="line-clamp-2 text-slate-600">judgment_memo: {holdingBaseline.judgment_memo ?? "—"}</p>
            </div>
          ) : null}

          {holdingMergeBroken ? (
            <p className="text-[11px] font-medium text-red-800">
              시장 또는 종목코드가 불러온 행과 다릅니다. 「원장에서 보유 행 불러오기」를 다시 하거나 식별자를 원장과 맞추세요.
            </p>
          ) : null}

          {(editMode === "full" || editMode === "memo_only" || editMode === "memo_target" || editMode === "target_only") && (
            <label className="flex flex-col gap-1 text-xs">
              투자 메모 (investment_memo)
              <textarea
                className="min-h-[56px] rounded border border-slate-200 bg-white px-2 py-1 text-slate-900"
                value={investmentMemo}
                onChange={(e) => setInvestmentMemo(e.target.value)}
                placeholder="비중·테마 등 메모"
                disabled={disabled || editMode === "target_only"}
              />
            </label>
          )}

          {(editMode === "full" || editMode === "target_only" || editMode === "memo_target" || editMode === "memo_only") && (
            <label className="flex flex-col gap-1 text-xs">
              목표가 (target_price)
              <input
                type="text"
                inputMode="decimal"
                className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-900"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="숫자만"
                disabled={disabled || editMode === "memo_only"}
              />
            </label>
          )}

          {(editMode === "full" || holdingPartial) && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  수량 qty
                  <input
                    type="text"
                    inputMode="decimal"
                    className="rounded border border-slate-200 bg-white px-2 py-1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    disabled={disabled || holdingPartial}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  평균단가 avg_price
                  <input
                    type="text"
                    inputMode="decimal"
                    className="rounded border border-slate-200 bg-white px-2 py-1"
                    value={avgPrice}
                    onChange={(e) => setAvgPrice(e.target.value)}
                    disabled={disabled || holdingPartial}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs">
                판단 메모 judgment_memo
                <textarea
                  className="min-h-[48px] rounded border border-slate-200 bg-white px-2 py-1"
                  value={judgmentMemo}
                  onChange={(e) => setJudgmentMemo(e.target.value)}
                  disabled={disabled || holdingPartial}
                />
              </label>
            </>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            className="self-start rounded border border-emerald-600 bg-white px-3 py-1.5 text-xs text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
            disabled={disabled || loadingSnap}
            onClick={() => void loadWatchlistRow()}
          >
            {loadingSnap ? "불러오는 중…" : "원장에서 관심 행 불러오기 (선택)"}
          </button>
          {watchlistBaseline ? (
            <div className="rounded border border-slate-200 bg-white/80 p-2 text-[11px] text-slate-800">
              <p className="mb-1 font-medium text-slate-700">불러온 관심 행 (참고)</p>
              <p className="line-clamp-2">이유: {watchlistBaseline.interest_reason ?? "—"}</p>
              <p>우선순위: {watchlistBaseline.priority ?? "—"}</p>
            </div>
          ) : null}
          <label className="flex flex-col gap-1 text-xs">
            관심 이유
            <textarea
              className="min-h-[44px] rounded border border-slate-200 bg-white px-2 py-1"
              value={interestReason}
              onChange={(e) => setInterestReason(e.target.value)}
              disabled={disabled}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            희망 매수 구간
            <input
              className="rounded border border-slate-200 bg-white px-2 py-1"
              value={desiredBuyRange}
              onChange={(e) => setDesiredBuyRange(e.target.value)}
              placeholder="예: 7만 이하"
              disabled={disabled}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            관찰 포인트
            <textarea
              className="min-h-[40px] rounded border border-slate-200 bg-white px-2 py-1"
              value={observationPoints}
              onChange={(e) => setObservationPoints(e.target.value)}
              disabled={disabled}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            우선순위
            <select
              className="rounded border border-slate-200 bg-white px-2 py-1"
              value={priority}
              onChange={(e) => setPriority(e.target.value as JoLedgerPriority | "")}
              disabled={disabled}
            >
              <option value="">(선택)</option>
              <option value="상">상</option>
              <option value="중">중</option>
              <option value="하">하</option>
            </select>
          </label>
          {watchlistPriorityWarn ? (
            <p className="text-[11px] text-amber-800">우선순위를 비워 두면 원장 정렬·검토에 불리할 수 있습니다.</p>
          ) : null}
          <label className="flex flex-col gap-1 text-xs">
            투자 메모
            <textarea
              className="min-h-[40px] rounded border border-slate-200 bg-white px-2 py-1"
              value={investmentMemo}
              onChange={(e) => setInvestmentMemo(e.target.value)}
              disabled={disabled}
            />
          </label>
        </>
      )}

      {fullHoldingWarning ? (
        <p className="text-[11px] text-amber-800">수량·평균단가가 비어 있으면 검증 실패 가능성이 있습니다.</p>
      ) : null}

      {ledgerTarget === "holding" && actionType === "upsert" && holdingBaseline && holdingMergeReady && holdingPartial ? (
        <div className="rounded border border-emerald-200 bg-white p-2 text-[11px]">
          <p className="mb-1 font-medium text-emerald-900">최종 반영 예정 (병합 후 필드)</p>
          {fieldDelta(
            "investment_memo",
            holdingBaseline.investment_memo,
            editMode === "target_only" ? holdingBaseline.investment_memo : investmentMemo,
          )}
          {fieldDelta(
            "target_price",
            holdingBaseline.target_price != null ? String(holdingBaseline.target_price) : null,
            editMode === "memo_only" ? String(holdingBaseline.target_price ?? "") : targetPrice,
          )}
          {fieldDelta("qty", holdingBaseline.qty != null ? String(holdingBaseline.qty) : null, qty)}
          {fieldDelta("avg_price", holdingBaseline.avg_price != null ? String(holdingBaseline.avg_price) : null, avgPrice)}
        </div>
      ) : null}

      {ledgerTarget === "holding" && actionType === "upsert" && holdingInsertPreview ? (
        <details className="rounded border border-slate-200 bg-white p-2 text-[11px]">
          <summary className="cursor-pointer font-medium text-slate-700">반영 엔진 호환 INSERT 미리보기 (표시용)</summary>
          <p className="mt-1 text-slate-500">
            user_key는 SQL에 넣지 않습니다. 아래는 폼 값 기준 예시이며, 조일현 출력과 다를 수 있습니다.
          </p>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-slate-800">
            {holdingInsertPreview}
          </pre>
        </details>
      ) : null}
      {ledgerTarget === "watchlist" && actionType === "upsert" && watchlistInsertPreview ? (
        <details className="rounded border border-slate-200 bg-white p-2 text-[11px]">
          <summary className="cursor-pointer font-medium text-slate-700">반영 엔진 호환 INSERT 미리보기 (표시용)</summary>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-slate-800">
            {watchlistInsertPreview}
          </pre>
        </details>
      ) : null}
      {deletePreview ? (
        <details className="rounded border border-slate-200 bg-white p-2 text-[11px]">
          <summary className="cursor-pointer font-medium text-slate-700">DELETE 미리보기 (표시용)</summary>
          <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-slate-800">{deletePreview}</pre>
        </details>
      ) : null}

      {loadMsg ? <p className="text-xs text-slate-600">{loadMsg}</p> : null}

      <button
        type="button"
        className="rounded-md bg-emerald-800 px-4 py-2 text-sm text-white disabled:opacity-50"
        disabled={disabled || (holdingPartial && holdingMergeBroken)}
        onClick={handleSubmit}
      >
        이 내용을 JSON으로 전송
      </button>
    </div>
  );
}
