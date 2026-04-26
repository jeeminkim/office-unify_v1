import 'server-only';

export type ThesisHealth = {
  status: 'healthy' | 'watch' | 'weakening' | 'broken' | 'unknown';
  score: number;
  reasons: string[];
  confidence: 'low' | 'medium' | 'high';
};

type ThesisInput = {
  symbol: string;
  market: string;
  currentPrice?: number;
  pnlRate?: number;
  targetPrice?: number;
  stopPrice?: number;
  holdingMemo?: string | null;
  judgmentMemo?: string | null;
  trendSignals?: Array<{ summary?: string; confidence?: 'low' | 'medium' | 'high' }>;
  researchSignals?: Array<{ summary?: string; confidence?: 'low' | 'medium' | 'high' }>;
  pbSummary?: string;
  committeeSummary?: string;
  recentJournal?: Array<{ thesisSummary?: string; note?: string; side?: string }>;
};

const NEGATIVE_WORDS = ['delay', 'cut', 'risk', 'bear', 'downgrade', 'miss', '약화', '지연', '리스크', '부정', '악화'];
const POSITIVE_WORDS = ['upgrade', 'beat', 'momentum', 'improve', 'tailwind', '호조', '개선', '강화', '상향'];
const BROKEN_WORDS = ['thesis_broken', 'broken', 'invalid', '무효', '깨짐', '파기', '중단'];

function hasAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
}

function scoreTextSignals(
  text: string,
  score: { value: number; reasons: string[]; negativeHits: number; brokenHits: number },
): void {
  if (!text) return;
  if (hasAny(text, POSITIVE_WORDS)) {
    score.value += 8;
    score.reasons.push('긍정 시그널이 감지되었습니다.');
  }
  if (hasAny(text, NEGATIVE_WORDS)) {
    score.value -= 12;
    score.negativeHits += 1;
    score.reasons.push('부정 시그널이 감지되었습니다.');
  }
  if (hasAny(text, BROKEN_WORDS)) {
    score.value -= 22;
    score.brokenHits += 1;
    score.reasons.push('thesis 깨짐 관련 표현이 감지되었습니다.');
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function analyzeThesisHealth(input: ThesisInput): ThesisHealth {
  const score = { value: 60, reasons: [] as string[], negativeHits: 0, brokenHits: 0 };
  const memoText = [input.holdingMemo ?? '', input.judgmentMemo ?? ''].join(' ').trim();
  if (!memoText) {
    score.value -= 8;
    score.reasons.push('원장 메모가 부족해 thesis 근거가 약합니다.');
  }
  scoreTextSignals(memoText, score);

  const allSignalTexts = [
    ...(input.trendSignals ?? []).map((s) => s.summary ?? ''),
    ...(input.researchSignals ?? []).map((s) => s.summary ?? ''),
    input.pbSummary ?? '',
    input.committeeSummary ?? '',
    ...(input.recentJournal ?? []).map((j) => `${j.thesisSummary ?? ''} ${j.note ?? ''}`),
  ].filter(Boolean);
  allSignalTexts.forEach((t) => scoreTextSignals(String(t), score));

  if (input.currentPrice != null && input.stopPrice != null && input.stopPrice > 0 && input.currentPrice <= input.stopPrice) {
    score.value -= 35;
    score.brokenHits += 1;
    score.reasons.push('현재가가 손절/무효화 가격 이하입니다.');
  } else if (input.currentPrice != null && input.stopPrice != null && input.stopPrice > 0) {
    const dist = ((input.currentPrice - input.stopPrice) / input.stopPrice) * 100;
    if (dist <= 3) {
      score.value -= 12;
      score.reasons.push('현재가가 손절 조건에 근접했습니다.');
    }
  }

  if (input.pnlRate != null && input.pnlRate <= -15) {
    score.value -= 18;
    score.reasons.push('손실률이 -15% 이하입니다.');
  } else if (input.pnlRate != null && input.pnlRate <= -10) {
    score.value -= 10;
    score.reasons.push('손실률이 -10% 이하입니다.');
  }

  if (input.currentPrice != null && input.targetPrice != null && input.targetPrice > 0 && input.currentPrice >= input.targetPrice) {
    score.value += 6;
    score.reasons.push('목표가 도달 구간입니다(청산/재평가 필요).');
  }

  const finalScore = clamp(score.value, 0, 100);
  let status: ThesisHealth['status'] = 'unknown';
  if (finalScore >= 70 && score.negativeHits === 0) status = 'healthy';
  else if (finalScore >= 55) status = 'watch';
  else if (finalScore >= 35) status = 'weakening';
  else status = 'broken';
  if (score.brokenHits > 0 && finalScore < 50) status = 'broken';

  const confidence: ThesisHealth['confidence'] =
    allSignalTexts.length >= 4 ? 'high' : allSignalTexts.length >= 2 ? 'medium' : 'low';

  return {
    status,
    score: finalScore,
    reasons: Array.from(new Set(score.reasons)).slice(0, 6),
    confidence,
  };
}

