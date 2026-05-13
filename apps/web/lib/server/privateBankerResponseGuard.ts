import type { PbWeeklyReviewQualityMeta, PbWeeklyReviewResponseGuardMeta } from '@office-unify/shared-types';

const REQUIRED_SECTION_MARKERS = [
  '[행동 분류]',
  '[정보 상태]',
  '[사용자 적합성 점검]',
  '[보유 집중도 점검]',
  '[지금 해야 할 행동]',
  '[하면 안 되는 행동]',
  '[관찰해야 할 신호]',
] as const;

/** 자동 주문·주문 실행 언급 주변에 있으면 지시 경고로 보지 않는 안전 문맥(고지·부정). */
const SAFE_POLICY_WINDOW =
  /(하지\s*않습니다|하지\s*않습|권유가\s*아닙니다|실행하지\s*않습니다|실행하지\s*않습|지시가\s*아닙니다|지시가\s*아닙|실행하지\s*않음|금지|무관|없습니다|없음|아닙니다)/;

function windowAround(text: string, start: number, end: number, before = 48, after = 72): string {
  const s = Math.max(0, start - before);
  const e = Math.min(text.length, end + after);
  return text.slice(s, e);
}

function looksLikeForbiddenBehaviorBullet(text: string, start: number): boolean {
  const head = text.slice(Math.max(0, start - 400), start);
  if (!/\[하면 안 되는 행동\]/.test(head)) return false;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', start);
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  if (/하세요|하십시오|설정\s*하|활성화|실행하세요/.test(line)) return false;
  const trimmed = line.trim();
  return /^[-*•]/.test(trimmed) || /^\d+\./.test(trimmed);
}

function collectMatches(re: RegExp, text: string): Array<{ start: number; end: number }> {
  const flags = re.global ? re.flags : `${re.flags}g`;
  const r = new RegExp(re.source, flags);
  const out: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) r.lastIndex += 1;
  }
  return out;
}

/** 지시형·위험 문맥만 policy 경고(안전 고지 “~하지 않습니다” 등은 제외). */
export function auditPrivateBankerStructuredResponse(text: string): PbWeeklyReviewResponseGuardMeta {
  const missingSections: string[] = [];
  for (const m of REQUIRED_SECTION_MARKERS) {
    if (!text.includes(m)) missingSections.push(m);
  }

  const policyPhraseWarnings: string[] = [];
  const seen = new Set<string>();

  const push = (code: string) => {
    if (seen.has(code)) return;
    seen.add(code);
    policyPhraseWarnings.push(code);
  };

  const imperativeAlways: Array<{ re: RegExp; code: string }> = [
    { re: /매수하세요/g, code: 'imperative_buy_instruction' },
    { re: /매도하세요/g, code: 'imperative_sell_instruction' },
    { re: /비중을\s*줄이세요/g, code: 'imperative_reduce_weight' },
    { re: /리밸런싱\s*하세요/g, code: 'imperative_rebalance' },
    { re: /리밸런싱하세요/g, code: 'imperative_rebalance' },
  ];

  for (const { re, code } of imperativeAlways) {
    if (re.test(text)) push(code);
  }

  const contextSensitive: Array<{ re: RegExp; code: string }> = [
    { re: /자동\s*주문/g, code: 'risky_auto_order_mention' },
    { re: /주문\s*실행/g, code: 'risky_order_execution_mention' },
  ];

  for (const { re, code } of contextSensitive) {
    for (const { start, end } of collectMatches(re, text)) {
      if (looksLikeForbiddenBehaviorBullet(text, start)) continue;
      const w = windowAround(text, start, end);
      if (!SAFE_POLICY_WINDOW.test(w)) push(code);
    }
  }

  return {
    missingSections,
    ...(policyPhraseWarnings.length ? { policyPhraseWarnings } : {}),
  };
}

/** Retro coach / weekly-style 응답에서 필수 섹션 없이 정책 위험 문구만 검사한다. */
export function auditRetroCoachPolicyWarnings(text: string): { policyPhraseWarnings?: string[] } {
  const policyPhraseWarnings: string[] = [];
  const seen = new Set<string>();
  const push = (code: string) => {
    if (seen.has(code)) return;
    seen.add(code);
    policyPhraseWarnings.push(code);
  };

  const imperativeAlways: Array<{ re: RegExp; code: string }> = [
    { re: /매수하세요/g, code: 'imperative_buy_instruction' },
    { re: /매도하세요/g, code: 'imperative_sell_instruction' },
    { re: /비중을\s*줄이세요/g, code: 'imperative_reduce_weight' },
    { re: /리밸런싱\s*하세요/g, code: 'imperative_rebalance' },
    { re: /리밸런싱하세요/g, code: 'imperative_rebalance' },
  ];
  for (const { re, code } of imperativeAlways) {
    if (re.test(text)) push(code);
  }

  const profitGuarantee = /수익\s*보장|무조건\s*수익|원금\s*보장|손실\s*없음|확실한\s*수익/i;
  if (profitGuarantee.test(text)) push('profit_guarantee_language');

  const contextSensitive: Array<{ re: RegExp; code: string }> = [
    { re: /자동\s*주문/g, code: 'risky_auto_order_mention' },
    { re: /주문\s*실행/g, code: 'risky_order_execution_mention' },
  ];
  for (const { re, code } of contextSensitive) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, 'g');
    while ((m = r.exec(text)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      const head = text.slice(Math.max(0, start - 400), start);
      if (/\[하면 안 되는 행동\]/.test(head)) {
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = text.indexOf('\n', start);
        const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
        if (/하세요|하십시오|설정\s*하|활성화|실행하세요/.test(line)) continue;
        const trimmed = line.trim();
        if (/^[-*•]/.test(trimmed) || /^\d+\./.test(trimmed)) continue;
      }
      const w = text.slice(Math.max(0, start - 48), Math.min(text.length, end + 72));
      if (!SAFE_POLICY_WINDOW.test(w)) push(code);
    }
  }

  return policyPhraseWarnings.length ? { policyPhraseWarnings } : {};
}

export function mergePbWeeklyReviewQualityMetaWithGuard(
  base: PbWeeklyReviewQualityMeta,
  guard: PbWeeklyReviewResponseGuardMeta,
): PbWeeklyReviewQualityMeta {
  return {
    ...base,
    privateBanker: {
      responseGuard: {
        missingSections: guard.missingSections,
        ...(guard.policyPhraseWarnings?.length ? { policyPhraseWarnings: guard.policyPhraseWarnings } : {}),
      },
    },
  };
}
