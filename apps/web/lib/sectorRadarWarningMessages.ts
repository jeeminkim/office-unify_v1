/**
 * Sector Radar 경고: 서버는 `warnings`에 내부 코드(snake_case)를 넣고,
 * UI는 `displayWarnings` / `displayWarningDetails` 또는 이 모듈의 변환 함수로 한국어를 씁니다.
 */

import type { SectorRadarSummaryResponse, SectorRadarSummarySector } from '@/lib/sectorRadarContract';

export function looksLikeSectorRadarWarningCode(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/[\u3131-\uD79D]/.test(t)) return false;
  if (/\s/.test(t)) return false;
  return /^[a-z][a-z0-9_]*$/.test(t);
}

/** 카드 하단 등 짧은 문구 */
export function formatSectorRadarWarningShort(code: string): string {
  const t = code.trim();
  if (!t) return "";
  const key = looksLikeSectorRadarWarningCode(t) ? t.toLowerCase() : t;
  switch (key) {
    case "volume_avg_unavailable_neutral_volume_score":
      return "거래량 평균 부족 → 거래량 점수 중립 반영";
    case "price_unavailable":
      return "시세 없음 → 일부 점수 생략";
    case "change_pct_unavailable":
      return "등락률 없음 → 모멘텀 점수 제한";
    case "week52_unavailable":
    case "high52_low52_unavailable":
      return "52주 데이터 부족 → 위치 점수 제한";
    case "anchor_no_data":
      return "앵커 시세 비어 있음 → 확인 필요";
    case "googlefinance_pending":
      return "시트 계산 대기 → 잠시 후 재확인";
    case "watchlist_anchor_hint":
      return "관심 ETF 추가 시 앵커 반영";
    case "spreadsheet_id_missing":
      return "스프레드시트 미설정";
    case "sector_radar_sheet_read_failed":
      return "섹터 시트 읽기 실패";
    case "sector_radar_sheet_empty":
      return "섹터 시트 비어 있음";
    case "sector_radar_sheet_legacy_layout_detected_refresh_to_upgrade":
      return "구 시트 레이아웃 → 새로고침 권장";
    case "google_sheets_not_configured_sector_radar_degraded":
      return "Sheets 미설정 → 기능 축소";
    case "google_sheets_not_configured":
      return "Google Sheets 미설정";
    case "sector_radar_tab_missing_or_unreadable":
      return "섹터 탭 없음 또는 읽기 실패";
    case "watchlist_fetch_failed":
      return "관심종목 목록을 불러오지 못함";
    case "sector_radar_read_failed":
      return "섹터 레이더 데이터 읽기 실패";
    case "watchlist_quote_bundle_failed":
      return "관심종목 시세 묶음 로드 실패";
    case "quote_fetch_failed":
      return "시세 조회 실패 → 요약 축소";
    case "holdings_fetch_failed":
      return "보유 목록 로드 실패";
    case "trend_memory_table_unavailable":
      return "트렌드 메모리 테이블 없음";
    case "trend_memory_topics_unavailable":
      return "트렌드 토픽 요약 생략";
    case "trade_journal_entries_unavailable":
      return "저널 요약 생략";
    case "realized_profit_events_unavailable":
      return "실현손익 이벤트 생략";
    case "financial_goals_unavailable":
      return "재무 목표 데이터 생략";
    case "goal_allocations_unavailable":
      return "목표 배분 데이터 생략";
    case "holdings_no_data":
      return "보유 데이터 없음";
    case "committee_data_unavailable":
      return "위원회 데이터 생략";
    case "pb_data_unavailable":
      return "PB 데이터 생략";
    case "financial_goals_no_data":
      return "재무 목표 없음";
    case "sector_radar_dossier_attach_failed":
      return "섹터 레이더 요약을 불러오지 못함";
    case "etf_quote_coverage_low":
      return "테마 ETF 시세 누락 다수 → 점수 제한";
    case "etf_quote_missing":
      return "관련 ETF 일부 시세 미반영";
    case "etf_quote_stale":
      return "ETF 시세 갱신 지연";
    case "etf_quote_invalid":
      return "ETF 시세 값 이상";
    case "etf_quote_unknown_freshness":
      return "ETF 시세 신선도 확인 불가";
    case "etf_universe_seed_insufficient":
      return "테마 ETF 시드 부족";
    case "etf_universe_quote_degraded":
      return "ETF 시세 커버리지 저하";
    case "etf_candidate_excluded_by_quote_quality":
      return "시세 없는 ETF는 점수에서 제외";
    case "etf_candidate_shortage_after_theme_gate":
      return "테마 적합 ETF 부족";
    default:
      return looksLikeSectorRadarWarningCode(t) ? "일부 데이터 부족 → 점수 보수적 반영" : t;
  }
}

/** tooltip·상세용 긴 문구 */
export function formatSectorRadarWarningDetail(code: string): string {
  const t = code.trim();
  if (!t) return "";
  const key = looksLikeSectorRadarWarningCode(t) ? t.toLowerCase() : t;
  switch (key) {
    case "volume_avg_unavailable_neutral_volume_score":
      return "최근 평균 거래량을 안정적으로 계산하지 못해 거래량 점수는 중립값으로 반영했습니다.";
    case "price_unavailable":
      return "시세 데이터가 비어 있어 일부 점수를 계산하지 못했습니다.";
    case "change_pct_unavailable":
      return "등락률 데이터가 비어 있어 모멘텀 점수가 제한됩니다.";
    case "week52_unavailable":
    case "high52_low52_unavailable":
      return "52주 고저점 데이터가 부족해 위치 점수가 제한됩니다.";
    case "anchor_no_data":
      return "대표 ETF 일부의 시세가 비어 있습니다.";
    case "googlefinance_pending":
      return "Google Sheets 계산이 아직 반영되지 않았습니다. 잠시 후 다시 확인하세요.";
    case "watchlist_anchor_hint":
      return "관심종목에 섹터 키워드가 맞는 ETF를 추가하면 관심 앵커로 반영됩니다.";
    case "spreadsheet_id_missing":
      return "스프레드시트 ID가 설정되지 않아 섹터 시트를 읽을 수 없습니다.";
    case "sector_radar_sheet_read_failed":
      return "섹터 레이더 시트를 읽는 중 오류가 났습니다. 권한·탭 이름을 확인하세요.";
    case "sector_radar_sheet_empty":
      return "섹터 레이더 시트에 데이터 행이 없습니다. 새로고침으로 행을 생성하세요.";
    case "sector_radar_sheet_legacy_layout_detected_refresh_to_upgrade":
      return "구버전 시트 레이아웃이 감지되었습니다. 데이터 새로고침으로 v2 레이아웃으로 올리세요.";
    case "google_sheets_not_configured_sector_radar_degraded":
      return "Google Sheets가 설정되지 않아 섹터 레이더가 축소 모드로 동작합니다.";
    case "google_sheets_not_configured":
      return "Google Sheets가 설정되지 않았습니다.";
    case "sector_radar_tab_missing_or_unreadable":
      return "섹터 레이더 탭을 찾지 못했거나 읽을 수 없습니다.";
    case "watchlist_fetch_failed":
      return "관심종목 목록을 불러오지 못했습니다.";
    case "sector_radar_read_failed":
      return "섹터 레이더 데이터를 읽지 못했습니다.";
    case "watchlist_quote_bundle_failed":
      return "관심종목 시세 묶음을 불러오지 못했습니다.";
    case "quote_fetch_failed":
      return "시세를 불러오지 못해 대시보드 일부 지표가 축소되었습니다.";
    case "holdings_fetch_failed":
      return "보유 목록을 불러오지 못했습니다.";
    case "trend_memory_table_unavailable":
      return "트렌드 메모리 테이블을 사용할 수 없어 해당 요약을 생략했습니다.";
    case "trend_memory_topics_unavailable":
      return "트렌드 토픽 요약을 가져오지 못했습니다.";
    case "trade_journal_entries_unavailable":
      return "트레이드 저널 항목을 불러오지 못했습니다.";
    case "realized_profit_events_unavailable":
      return "실현손익 이벤트를 불러오지 못했습니다.";
    case "financial_goals_unavailable":
      return "재무 목표 데이터를 불러오지 못했습니다.";
    case "goal_allocations_unavailable":
      return "목표 배분 데이터를 불러오지 못했습니다.";
    case "holdings_no_data":
      return "보유 데이터가 없습니다.";
    case "committee_data_unavailable":
      return "위원회 관련 데이터를 불러오지 못했습니다.";
    case "pb_data_unavailable":
      return "PB(프라이뱅커) 데이터를 불러오지 못했습니다.";
    case "financial_goals_no_data":
      return "등록된 재무 목표가 없습니다.";
    case "sector_radar_dossier_attach_failed":
      return "도사(dossier)에 섹터 레이더 요약을 붙이는 중 오류가 났습니다.";
    case "etf_quote_coverage_low":
      return "직접·인접 테마 ETF 중 시세가 비어 있는 비율이 높습니다. 새로고침 후에도 동일하면 티커·시트 매핑을 확인하세요.";
    case "etf_quote_missing":
      return "관련 ETF로 분류되었지만 시세가 비어 있어 점수 산정에서는 제외했습니다.";
    case "etf_quote_stale":
      return "시세는 있으나 갱신 시점이 오래되어 점수 산정에서 제외했습니다.";
    case "etf_quote_invalid":
      return "시세 값이 비정상(파싱 실패/0 또는 음수)으로 확인되어 점수 산정에서 제외했습니다.";
    case "etf_quote_unknown_freshness":
      return "시세 갱신 시점을 확인할 수 없어 관찰 ETF로 분류했습니다.";
    case "etf_universe_seed_insufficient":
      return "해당 테마의 ETF 시드가 아직 충분하지 않아 진단/후보 품질이 보수적으로 동작합니다.";
    case "etf_universe_quote_degraded":
      return "ETF 앵커 시세 커버리지가 전반적으로 낮아 qualityMeta에 저하 상태를 표시합니다. read-only 경로에서는 개별 web_ops_events를 늘리지 않습니다.";
    case "etf_candidate_excluded_by_quote_quality":
      return "테마 적합 ETF는 있으나 유효 시세가 없어 합성 점수에 포함하지 않았습니다.";
    case "etf_candidate_shortage_after_theme_gate":
      return "테마 적합성 검증 후 점수에 쓸 앵커가 거의 없습니다. 시트 시세·시드 티커를 점검하세요.";
    default:
      return looksLikeSectorRadarWarningCode(t) ? "일부 데이터가 부족해 점수는 보수적으로 계산했습니다." : t;
  }
}

/** @deprecated 호환용 — 상세 문구와 동일 */
export function formatSectorRadarWarning(code: string): string {
  return formatSectorRadarWarningDetail(code);
}

export type SectorRadarWarningDisplayPair = {
  raw: string;
  short: string;
  detail: string;
};

export function toSectorRadarWarningDisplayPairs(warnings: string[]): SectorRadarWarningDisplayPair[] {
  return (warnings ?? []).map((raw) => {
    const w = raw.trim();
    if (!w) return { raw: w, short: "", detail: "" };
    if (!looksLikeSectorRadarWarningCode(w)) {
      return { raw: w, short: w, detail: w };
    }
    return { raw: w, short: formatSectorRadarWarningShort(w), detail: formatSectorRadarWarningDetail(w) };
  });
}

function enrichSector(s: SectorRadarSummarySector): SectorRadarSummarySector {
  const pairs = toSectorRadarWarningDisplayPairs(s.warnings ?? []).filter((p) => p.short);
  return {
    ...s,
    displayWarnings: pairs.map((p) => p.short),
    displayWarningDetails: pairs.map((p) => p.detail),
  };
}

/** 요약 API 응답에 displayWarnings 계열 필드를 붙입니다. */
export function attachSectorRadarDisplayFields(body: SectorRadarSummaryResponse): SectorRadarSummaryResponse {
  const sectors = body.sectors.map(enrichSector);
  const topPairs = toSectorRadarWarningDisplayPairs(body.warnings ?? []).filter((p) => p.short);
  return {
    ...body,
    sectors,
    fearCandidatesTop3: body.fearCandidatesTop3.map(enrichSector),
    greedCandidatesTop3: body.greedCandidatesTop3.map(enrichSector),
    displayWarnings: topPairs.map((p) => p.short),
    displayWarningDetails: topPairs.map((p) => p.detail),
  };
}

/** 운영 UI용: raw snake_case가 섞여 있어도 한국어로만 반환 */
export function getVisibleSectorRadarWarningsForSector(sector: SectorRadarSummarySector): string[] {
  const base = sector.displayWarnings?.length
    ? sector.displayWarnings
    : (sector.warnings ?? []).map((w) => formatSectorRadarWarningShort(w));
  return base.map((line) => (looksLikeSectorRadarWarningCode(line) ? formatSectorRadarWarningShort(line) : line));
}

export function getVisibleSectorRadarWarningDetailsForSector(sector: SectorRadarSummarySector): string[] {
  const shorts = getVisibleSectorRadarWarningsForSector(sector);
  if (
    sector.displayWarningDetails?.length === shorts.length &&
    sector.displayWarnings?.length === shorts.length
  ) {
    return sector.displayWarningDetails;
  }
  return (sector.warnings ?? []).map((w) => formatSectorRadarWarningDetail(w));
}

export function getVisibleSectorRadarWarningsForSummary(summary: SectorRadarSummaryResponse): string[] {
  const base = summary.displayWarnings?.length
    ? summary.displayWarnings
    : (summary.warnings ?? []).map((w) => formatSectorRadarWarningShort(w));
  return base.map((line) => (looksLikeSectorRadarWarningCode(line) ? formatSectorRadarWarningShort(line) : line));
}

export function getVisibleSectorRadarWarningDetailsForSummary(summary: SectorRadarSummaryResponse): string[] {
  const shorts = getVisibleSectorRadarWarningsForSummary(summary);
  if (
    summary.displayWarningDetails?.length === shorts.length &&
    summary.displayWarnings?.length === shorts.length
  ) {
    return summary.displayWarningDetails;
  }
  return (summary.warnings ?? []).map((w) => formatSectorRadarWarningDetail(w));
}
