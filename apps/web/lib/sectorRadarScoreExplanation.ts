import type {
  SectorRadarConfidence,
  SectorRadarScoreBreakdown,
  SectorRadarScoreExplanation,
  SectorRadarScoreQuality,
  SectorRadarSummarySector,
  SectorRadarTemperature,
  SectorRadarZone,
} from "@/lib/sectorRadarContract";

export const SECTOR_RADAR_SCORE_WARNING_CODES = {
  SCORE_LOW_CONFIDENCE: "sector_radar_score_low_confidence",
  SCORE_VERY_LOW_CONFIDENCE: "sector_radar_score_very_low_confidence",
  SCORE_QUOTE_COVERAGE_LOW: "sector_radar_score_quote_coverage_low",
  SCORE_SAMPLE_TOO_SMALL: "sector_radar_score_sample_too_small",
  SCORE_OVERHEATED: "sector_radar_score_overheated",
  SCORE_NO_DATA: "sector_radar_score_no_data",
  SCORE_EXPLANATION_FAILED: "sector_radar_score_explanation_failed",
} as const;

export const SECTOR_TEMPERATURE_EXPLANATIONS: Record<
  SectorRadarTemperature,
  { summary: string; actionHint: string }
> = {
  NO_DATA: {
    summary: "시세 데이터가 부족해 점수를 계산하지 못했습니다.",
    actionHint: "시세 새로고침 후 다시 확인하세요.",
  },
  관망: {
    summary: "아직 뚜렷한 힘이 약한 구간입니다.",
    actionHint: "관심종목과 뉴스 흐름을 관찰하는 구간입니다.",
  },
  중립: {
    summary: "방향성이 강하지 않은 구간입니다.",
    actionHint: "종목별 선별 접근이 필요합니다.",
  },
  관심: {
    summary: "섹터 움직임이 개선되고 있습니다.",
    actionHint: "무리한 추격보다 눌림/확인 후 접근이 유리합니다.",
  },
  과열: {
    summary: "많이 오른 구간입니다.",
    actionHint: "신규 추격매수보다 분할 관찰과 조정 대기가 유리합니다.",
  },
  위험: {
    summary: "단기 과열 또는 변동성 확대 가능성이 큽니다.",
    actionHint: "신규 진입보다 리스크 관리와 관망이 우선입니다.",
  },
};

/** 카드에 표시할 구성요소 만점(표준 섹터 스코어링 기준). */
export const SECTOR_RADAR_COMPONENT_CAPS = {
  momentum: 25,
  volume: 30,
  week52: 15,
  trend: 20,
  quality: 10,
} as const;

export function computeQuoteCoverageRatio(quoteOkCount: number, sampleCount: number): number {
  if (sampleCount <= 0) return 0;
  return Math.min(1, Math.max(0, quoteOkCount / sampleCount));
}

/** 표본 수 패널티(합산, 음수). */
export function computeSampleCountPenalty(sampleCount: number): number {
  if (sampleCount >= 5) return 0;
  if (sampleCount === 4) return -3;
  if (sampleCount === 3) return -5;
  if (sampleCount === 2) return -10;
  return 0;
}

/** 시세 성공률 구간 패널티(합산, 음수). */
export function computeQuoteCoveragePenalty(quoteCoverageRatio: number): number {
  if (quoteCoverageRatio >= 0.8) return 0;
  if (quoteCoverageRatio >= 0.6) return -5;
  if (quoteCoverageRatio >= 0.4) return -10;
  return -10;
}

export function classifySectorRadarConfidence(input: {
  sampleCount: number;
  quoteCoverageRatio: number;
  quoteMissingCount: number;
}): SectorRadarConfidence {
  const { sampleCount, quoteCoverageRatio, quoteMissingCount } = input;
  if (sampleCount < 3 || quoteCoverageRatio < 0.4) return "very_low";
  if (
    sampleCount >= 5 &&
    quoteCoverageRatio >= 0.8 &&
    quoteMissingCount <= 1
  ) {
    return "high";
  }
  if (sampleCount >= 4 && quoteCoverageRatio >= 0.6) return "medium";
  if (sampleCount >= 3 && quoteCoverageRatio >= 0.4) return "low";
  return "very_low";
}

export function buildSectorRadarScoreQuality(input: {
  sampleCount: number;
  quoteOkCount: number;
  quoteMissingCount: number;
}): SectorRadarScoreQuality {
  const { sampleCount, quoteOkCount, quoteMissingCount } = input;
  const quoteCoverageRatio = computeQuoteCoverageRatio(quoteOkCount, sampleCount);
  const samplePen = computeSampleCountPenalty(sampleCount);
  const quotePen = computeQuoteCoveragePenalty(quoteCoverageRatio);
  const confidencePenalty = samplePen + quotePen;
  const dataReliability = classifySectorRadarConfidence({
    sampleCount,
    quoteCoverageRatio,
    quoteMissingCount,
  });

  const warnings: string[] = [];
  if (sampleCount <= 2) {
    warnings.push("표본 수가 적어 점수 변동·왜곡 가능성이 큽니다.");
  }
  if (quoteCoverageRatio < 0.8) {
    warnings.push("일부 표본에서 시세가 누락되어 점수가 왜곡될 수 있습니다.");
  }
  if (quoteCoverageRatio < 0.4) {
    warnings.push("시세 커버리지가 낮아 관찰 신호로만 참고하세요.");
  }
  if (dataReliability === "very_low") {
    warnings.push("데이터 신뢰도가 매우 낮습니다.");
  } else if (dataReliability === "low") {
    warnings.push("데이터 신뢰도가 낮은 편입니다.");
  }

  return {
    sampleCount,
    quoteOkCount,
    quoteMissingCount,
    quoteCoverageRatio,
    dataReliability,
    confidencePenalty,
    warnings: Array.from(new Set(warnings)),
  };
}

function zoneBaseTemperature(zone: SectorRadarZone): SectorRadarTemperature {
  switch (zone) {
    case "extreme_fear":
    case "fear":
      return "관망";
    case "neutral":
      return "중립";
    case "greed":
      return "관심";
    case "extreme_greed":
      return "과열";
    default:
      return "NO_DATA";
  }
}

export function detectOverheatRisk(input: {
  rawScore: number | null;
  volume?: number;
  week52Position?: number;
}): { overheated: boolean; danger: boolean } {
  const { rawScore, volume, week52Position } = input;
  if (rawScore == null || !Number.isFinite(rawScore)) {
    return { overheated: false, danger: false };
  }
  const vol = volume ?? 0;
  const w52 = week52Position ?? 0;
  const danger =
    rawScore >= 85 &&
    vol >= 24 &&
    w52 >= 12;
  const overheated =
    danger ||
    (rawScore >= 80 && w52 >= 12) ||
    (rawScore >= 80 && vol >= 24);
  return { overheated, danger };
}

/**
 * 표본/시세 품질이 매우 낮을 때 사용자 라벨을 NO_DATA로 맞춥니다.
 * (기존 `zone` 필드는 호환을 위해 그대로 둡니다.)
 */
export function shouldLabelTemperatureNoData(input: {
  zone: SectorRadarZone;
  sampleCount: number;
  quoteCoverageRatio: number;
  quoteOkCount: number;
}): boolean {
  if (input.zone === "no_data") return true;
  if (input.sampleCount <= 1) return true;
  if (input.quoteOkCount === 0 && input.sampleCount > 0) return true;
  if (input.quoteCoverageRatio < 0.4 && input.sampleCount > 0) return true;
  return false;
}

export function resolveSectorRadarTemperature(input: {
  zone: SectorRadarZone;
  rawScore: number | null;
  breakdown: SectorRadarScoreBreakdown | null;
  quality: SectorRadarScoreQuality;
}): SectorRadarTemperature {
  const { zone, rawScore, breakdown, quality } = input;
  if (
    shouldLabelTemperatureNoData({
      zone,
      sampleCount: quality.sampleCount,
      quoteCoverageRatio: quality.quoteCoverageRatio,
      quoteOkCount: quality.quoteOkCount,
    })
  ) {
    return "NO_DATA";
  }

  const vol = breakdown?.volume ?? 0;
  const w52 = breakdown?.week52Position ?? 0;

  const risk = detectOverheatRisk({
    rawScore,
    volume: vol,
    week52Position: w52,
  });

  if (risk.danger) return "위험";

  let t = zoneBaseTemperature(zone);

  if (rawScore != null && Number.isFinite(rawScore)) {
    if (rawScore >= 80 && w52 >= 12) {
      t = "과열";
    }
    if ((zone === "greed" || zone === "neutral") && rawScore >= 80 && w52 >= 10) {
      t = "과열";
    }
  }

  if (risk.overheated && t === "관심") {
    t = "과열";
  }

  return t;
}

export function buildBreakdownFromSector(
  sector: Pick<SectorRadarSummarySector, "components" | "key">,
): SectorRadarScoreBreakdown | null {
  const c = sector.components;
  if (sector.key === "crypto") {
    return null;
  }
  if (
    c.momentum == null &&
    c.volume == null &&
    c.drawdown == null &&
    c.trend == null &&
    c.risk == null
  ) {
    return null;
  }
  return {
    momentum: c.momentum ?? 0,
    volume: c.volume ?? 0,
    week52Position: c.drawdown ?? 0,
    trend: c.trend ?? 0,
    quality: c.risk ?? 0,
  };
}

export function formatConfidenceSummaryLine(
  confidence: SectorRadarConfidence,
  sampleCount: number,
  quoteOkCount: number,
): string {
  const confKo =
    confidence === "high"
      ? "신뢰도 높음"
      : confidence === "medium"
        ? "신뢰도 보통"
        : confidence === "low"
          ? "신뢰도 낮음"
          : "신뢰도 매우 낮음";
  return `${confKo} · 표본 ${sampleCount}개 중 시세 ${quoteOkCount}개 반영`;
}

export function buildMainDrivers(input: {
  breakdown: SectorRadarScoreBreakdown | null;
  quoteCoverageRatio: number;
  isCrypto: boolean;
}): string[] {
  const out: string[] = [];
  const { breakdown, quoteCoverageRatio, isCrypto } = input;
  if (!isCrypto && breakdown) {
    if (breakdown.momentum >= 18) out.push("모멘텀이 강합니다.");
    if (breakdown.volume >= 18) out.push("거래량이 증가했습니다.");
    if (breakdown.week52Position >= 10) out.push("52주 위치가 높아 시장 관심이 집중되어 있습니다.");
    if (breakdown.trend >= 12) out.push("단기 추세 점수가 높습니다.");
    if (breakdown.quality >= 8) out.push("표본 데이터 품질 가점이 있습니다.");
  }
  if (quoteCoverageRatio >= 0.8) {
    out.push("표본 ETF 대부분에서 시세가 확인되었습니다.");
  }
  if (out.length === 0 && isCrypto) {
    out.push("코인 대표 앵커 가중 평균으로 섹터 관찰 점수를 요약했습니다.");
  }
  if (out.length === 0) {
    out.push("각 구성 요소가 중간 수준으로 보입니다.");
  }
  return Array.from(new Set(out)).slice(0, 6);
}

export function buildRiskNotes(input: {
  breakdown: SectorRadarScoreBreakdown | null;
  quality: SectorRadarScoreQuality;
  temperature: SectorRadarTemperature;
  linkedWatchlistCount: number;
  isCrypto: boolean;
}): string[] {
  const notes: string[] = [];
  const { breakdown, quality, temperature, linkedWatchlistCount, isCrypto } = input;

  if (!isCrypto && breakdown && breakdown.week52Position >= 12) {
    notes.push("52주 위치가 높아 추격매수 리스크가 있습니다.");
  }
  if (quality.sampleCount < 3) {
    notes.push("표본 수가 부족해 점수 신뢰도가 낮습니다.");
  }
  if (quality.quoteMissingCount > 0) {
    notes.push("시세가 일부 누락되어 점수가 왜곡될 수 있습니다.");
  }
  if (temperature === "위험" || temperature === "과열") {
    notes.push("단기 과열 가능성을 염두에 두세요.");
  }
  if (linkedWatchlistCount === 0) {
    notes.push("관련 관심종목이 적어 포트폴리오 연결성은 낮습니다.");
  }
  return Array.from(new Set(notes)).slice(0, 8);
}

export function computeAdjustedScore(rawScore: number | null, quality: SectorRadarScoreQuality): number | null {
  if (rawScore == null || !Number.isFinite(rawScore)) return null;
  const adj = Math.round(rawScore + quality.confidencePenalty);
  return Math.min(100, Math.max(0, adj));
}

export function buildSectorRadarExplanation(input: {
  rawScore: number | null;
  adjustedScore: number | null;
  breakdown?: SectorRadarScoreBreakdown | null;
  quality: SectorRadarScoreQuality;
  linkedWatchlistCount: number;
  zone: SectorRadarZone;
  sectorName: string;
  sectorKey: string;
}): SectorRadarScoreExplanation {
  const breakdown = input.breakdown ?? null;
  const isCrypto = input.sectorKey === "crypto";

  const temperature = resolveSectorRadarTemperature({
    zone: input.zone,
    rawScore: input.rawScore,
    breakdown,
    quality: input.quality,
  });

  const base = SECTOR_TEMPERATURE_EXPLANATIONS[temperature];
  let conservativeActionHint = base.actionHint;
  let summary = base.summary;

  if (temperature === "과열" || temperature === "위험") {
    conservativeActionHint =
      "신규 추격매수보다 분할 관찰·조정 대기에 유리합니다. 이 신호는 매수 추천이 아닙니다.";
  }

  const mainDrivers = buildMainDrivers({
    breakdown,
    quoteCoverageRatio: input.quality.quoteCoverageRatio,
    isCrypto,
  });

  const riskNotes = buildRiskNotes({
    breakdown,
    quality: input.quality,
    temperature,
    linkedWatchlistCount: input.linkedWatchlistCount,
    isCrypto,
  });

  const wlNote =
    input.linkedWatchlistCount > 0
      ? "내 관심종목과 연결된 섹터이므로 관찰 우선순위를 높게 둘 수 있습니다."
      : "이 섹터와 연결된 관심종목은 아직 없습니다. 점수는 시장 표본 기준입니다.";

  const interpretationParts = [
    `이 점수는 대표 ETF/종목 표본 ${input.quality.sampleCount}개 중 ${input.quality.quoteOkCount}개의 시세를 바탕으로 계산했습니다.`,
    `높은 점수는 “좋은 매수 신호”가 아니라 최근 섹터가 강하게 움직였음을 뜻할 수 있습니다.`,
    ...mainDrivers.slice(0, 2),
    wlNote,
  ];

  if (temperature === "NO_DATA") {
    summary = SECTOR_TEMPERATURE_EXPLANATIONS.NO_DATA.summary;
    conservativeActionHint = SECTOR_TEMPERATURE_EXPLANATIONS.NO_DATA.actionHint;
  }

  const interpretation = interpretationParts.join(" ");

  return {
    rawScore: input.rawScore,
    adjustedScore: input.adjustedScore,
    temperature,
    confidence: input.quality.dataReliability,
    breakdown,
    quality: input.quality,
    summary,
    interpretation,
    conservativeActionHint,
    mainDrivers,
    riskNotes,
  };
}

export function sectorRadarOpsCodesForQuality(input: {
  quality: SectorRadarScoreQuality;
  temperature: SectorRadarTemperature;
}): string[] {
  const codes: string[] = [];
  const q = input.quality;
  if (q.dataReliability === "low") codes.push(SECTOR_RADAR_SCORE_WARNING_CODES.SCORE_LOW_CONFIDENCE);
  if (q.dataReliability === "very_low") codes.push(SECTOR_RADAR_SCORE_WARNING_CODES.SCORE_VERY_LOW_CONFIDENCE);
  if (q.quoteCoverageRatio < 0.6) codes.push(SECTOR_RADAR_SCORE_WARNING_CODES.SCORE_QUOTE_COVERAGE_LOW);
  if (q.sampleCount < 3) codes.push(SECTOR_RADAR_SCORE_WARNING_CODES.SCORE_SAMPLE_TOO_SMALL);
  if (input.temperature === "과열" || input.temperature === "위험") {
    codes.push(SECTOR_RADAR_SCORE_WARNING_CODES.SCORE_OVERHEATED);
  }
  if (input.temperature === "NO_DATA") codes.push(SECTOR_RADAR_SCORE_WARNING_CODES.SCORE_NO_DATA);
  return Array.from(new Set(codes));
}
