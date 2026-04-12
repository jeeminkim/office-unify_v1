/**
 * 투자위원회(5인) 응답 — 최소 문자열 검증 + 안전한 후처리 보정.
 * PB(privateBankerResponseFormat)와 패턴은 비슷하되 규칙·섹션은 분리한다.
 */

import { PERSONA_CHAT_ASSISTANT_TARGET_MAX_CHARS } from '@office-unify/shared-types';
import { isCommitteePersonaSlug } from './committeePrompt';

const MAX_TOTAL_CHARS = PERSONA_CHAT_ASSISTANT_TARGET_MAX_CHARS + 400;

/** 앞쪽 대량 prepend 대신 끝에 한 줄 안내만 붙인다(공통 골격 위주 출력과 충돌 완화). */
const COMMITTEE_SOFT_REMEDIATION_SLUGS = new Set<string>([
  'ray-dalio',
  'jim-simons',
  'hindenburg',
  'drucker',
  'cio',
]);

function softRemediationFooter(slug: string): string {
  if (slug === 'ray-dalio') {
    return '[형식 안내] 가능하면 [핵심 리스크], [깨질 수 있는 전제], [리스크 관리 행동]을 소제목으로 넣어 주세요.';
  }
  if (slug === 'jim-simons') {
    return '[형식 안내] 가능하면 [시장 전이 경로], [검증 변수 3개], [유효기간]을 소제목으로 넣어 주세요.';
  }
  if (slug === 'hindenburg') {
    return '[형식 안내] 가능하면 [핵심 착각], [구조적 취약점], [무효화 조건]을 소제목으로 넣어 주세요.';
  }
  if (slug === 'drucker') {
    return '[형식 안내] 가능하면 [이번 주 할 일 3개], [하지 말 것 3개], [다음 점검 시점]을 소제목으로 넣어 주세요.';
  }
  if (slug === 'cio') {
    return '[형식 안내] 가능하면 [최종 판정], [유지 버킷 / 감축 검토 버킷 / 관찰 버킷], [지금 보류할 행동]을 소제목으로 넣어 주세요.';
  }
  return '';
}

/** 대괄호 라벨이 본문에 있는지(공백 허용) */
function hasLabeledSection(text: string, inner: string): boolean {
  const esc = inner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\[[^\\]]*${esc}[^\\]]*\\]`).test(text);
}

/** 공통 4요소를 느슨하게 확인 */
function hasCommonFourLoose(text: string): boolean {
  const t = text.slice(0, 1800);
  const hasConclusion = /결론|핵심\s*관점|핵심\s*포인트|판정|취약/i.test(t);
  const hasWhy = /왜|근거|이유|배경|전이/i.test(t);
  const hasRisk = /리스크|반대|하방|약점|우려|취약점/i.test(t);
  const hasAction = /행동|관찰|모니터|다음\s*단계|할\s*일|보류/i.test(t);
  return hasConclusion && hasWhy && hasRisk && hasAction;
}

const PERSONA_REQUIRED: Record<string, string[]> = {
  'ray-dalio': ['핵심 리스크', '깨질 수 있는 전제', '리스크 관리 행동'],
  'jim-simons': ['시장 전이 경로', '검증 변수 3개', '유효기간'],
  drucker: ['이번 주 할 일 3개', '하지 말 것 3개', '다음 점검 시점'],
  cio: ['최종 판정', '유지 버킷', '지금 보류할 행동'],
  hindenburg: ['핵심 착각', '구조적 취약점', '무효화 조건'],
};

function missingPersonaSections(slug: string, text: string): string[] {
  const keys = PERSONA_REQUIRED[slug];
  if (!keys) return [];
  return keys.filter((k) => !hasLabeledSection(text, k));
}

/** 사용자 메모 감정 표현이 과도하게 반복되면 한 줄 메타 안내(강한 리라이트 없음) */
function appendEchoGuardIfNeeded(slug: string, text: string): { text: string; applied: boolean } {
  if (!isCommitteePersonaSlug(slug)) return { text, applied: false };
  const patterns =
    /아쉬운\s*매수|본전|후회|감정\s*매매|타이밍|본전\s*심리|물렸|본전만|매수\s*타이밍/g;
  const matches = text.match(patterns);
  const n = matches?.length ?? 0;
  if (n < 2) return { text, applied: false };
  return {
    text: `${text.trim()}\n\n[작성 참고] 사용자 메모의 감정 표현이 반복됩니다. 공감은 하되, 핵심 결론은 포트 구조·비중·리스크 전이·실행 우선순위로 옮겨 주세요.`,
    applied: true,
  };
}

/** 티커 나열이 과다하면 버킷 표현 유도(소프트) */
function appendListingGuardIfNeeded(slug: string, text: string): { text: string; applied: boolean } {
  if (!isCommitteePersonaSlug(slug)) return { text, applied: false };
  const tickers = text.match(/\b[A-Z]{1,5}\b/g) ?? [];
  if (tickers.length <= 8) return { text, applied: false };
  return {
    text: `${text.trim()}\n\n[작성 참고] 티커·종목 나열이 많습니다. 대표 2~4개만 예시로 남기고 레버리지·고변동·이벤트 민감·섹터 편중 등 버킷으로 묶어 주세요.`,
    applied: true,
  };
}

/** 거시·구조·실행 층이 너무 약하면 한 줄 유도 */
function appendStructureHintIfNeeded(slug: string, text: string): { text: string; applied: boolean } {
  if (!isCommitteePersonaSlug(slug)) return { text, applied: false };
  const t = text.slice(0, 2600);
  const hasStructure = /포트폴리오|비중|섹터|버킷|노출|레버리지|고변동|집중|분산/i.test(t);
  const hasTransmission = /전이|유가|환율|금리|수급|변동성|지정학|거시|인플레|기대/i.test(t);
  const hasAction = /실행|우선순위|할\s*일|보류|다음\s*점검|하지\s*말/i.test(t);
  const score = [hasStructure, hasTransmission, hasAction].filter(Boolean).length;
  if (score >= 2) return { text, applied: false };
  return {
    text: `${text.trim()}\n\n[작성 참고] 거시(외부 변수)·포트 구조·실행 우선순위 중 최소 2가지 층이 드러나도록 한 문장씩 보강해 주세요.`,
    applied: true,
  };
}

/** 가드 체인 + 메타 태그(서버 디버그용, 과다 로그 금지) */
function applyCommitteeSoftGuards(slug: string, trimmed: string): { text: string; debugTags: string[] } {
  const tags: string[] = [];
  let t = trimmed;

  const echo = appendEchoGuardIfNeeded(slug, t);
  if (echo.applied) {
    t = echo.text;
    tags.push('echo-guard');
  }

  const listing = appendListingGuardIfNeeded(slug, t);
  if (listing.applied) {
    t = listing.text;
    tags.push('listing-guard');
  }

  const structure = appendStructureHintIfNeeded(slug, t);
  if (structure.applied) {
    t = structure.text;
    tags.push('structure-hint');
  }

  return { text: t, debugTags: tags };
}

export type CommitteeFormatRemediation = {
  text: string;
  note: string | null;
  /** 개발·스테이징에서만 의미 있는 가드 발동 태그(운영 로그 과다 방지) */
  debugTags?: string[];
};

export function remediateCommitteePersonaReply(slug: string, raw: string): CommitteeFormatRemediation {
  if (!isCommitteePersonaSlug(slug)) {
    return { text: raw.trim(), note: null };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      text: '[형식 보정] 응답이 비어 있습니다. 질문과 맥락을 다시 보내 주세요.',
      note: '빈 응답에 최소 안내만 추가했습니다.',
      debugTags: ['empty-raw'],
    };
  }

  const guarded = applyCommitteeSoftGuards(slug, trimmed);
  const withGuards = guarded.text;
  const guardNoteParts: string[] = [];
  if (guarded.debugTags.includes('echo-guard')) guardNoteParts.push('감정 표현 반복 완화');
  if (guarded.debugTags.includes('listing-guard')) guardNoteParts.push('종목 나열 완화');
  if (guarded.debugTags.includes('structure-hint')) guardNoteParts.push('거시·구조·실행 층 보강 안내');

  const missing = missingPersonaSections(slug, withGuards);
  const commonOk = hasCommonFourLoose(withGuards);

  if (missing.length === 0 && commonOk) {
    const noteFromGuards = guardNoteParts.length > 0 ? `${guardNoteParts.join('·')} 안내를 추가했습니다.` : null;
    return {
      text: withGuards,
      note: noteFromGuards,
      debugTags: guarded.debugTags.length ? guarded.debugTags : undefined,
    };
  }

  if (COMMITTEE_SOFT_REMEDIATION_SLUGS.has(slug)) {
    const footer = softRemediationFooter(slug);
    let out = withGuards;
    if ((missing.length > 0 || !commonOk) && footer) {
      out += `\n\n${footer}`;
    }
    if (out.length > MAX_TOTAL_CHARS) {
      out = `${withGuards.slice(0, MAX_TOTAL_CHARS - 120)}…\n[형식 안내]`;
    }
    return {
      text: out.trim(),
      note:
        missing.length > 0 || !commonOk
          ? `응답 형식 보정을 완화했습니다(위원회 필수 대괄호 생략 시).${guardNoteParts.length ? ` ${guardNoteParts.join('·')} 안내 포함.` : ''}`
          : guardNoteParts.length > 0
            ? `${guardNoteParts.join('·')} 안내를 추가했습니다.`
            : null,
      debugTags: [...guarded.debugTags, ...(missing.length > 0 ? ['missing-sections'] : []), ...(!commonOk ? ['weak-common-four'] : [])],
    };
  }

  const prepend: string[] = [];
  for (const label of missing) {
    prepend.push(
      `[${label} — 서버 형식 보정] 본문에서 해당 항목을 직접 요약하세요. 확인되지 않은 사실은 단정하지 마세요.`,
    );
  }

  let out = prepend.length ? `${prepend.join('\n')}\n\n${withGuards}` : withGuards;

  if (!commonOk) {
    out += `\n\n[형식 보정] 공통 골격(핵심 관점·근거·리스크·행동/관찰)이 드러나지 않았을 수 있습니다. 위 본문을 기준으로 각각 한 줄씩 스스로 점검하세요.`;
  }

  if (out.length > MAX_TOTAL_CHARS) {
    out = `${withGuards}\n\n[형식 보정] 일부 필수 대괄호 섹션이 누락되었을 수 있습니다. 본문과 투자위원회 계약을 우선하세요.`;
    if (out.length > MAX_TOTAL_CHARS) {
      out = `${withGuards.slice(0, MAX_TOTAL_CHARS - 80)}…\n[형식 보정]`;
    }
  }

  const note =
    missing.length > 0 || !commonOk
      ? `일부 필수 섹션이 서버에서 안전하게 보정되었습니다.${guardNoteParts.length ? ` ${guardNoteParts.join('·')} 안내 포함.` : ''}`
      : guardNoteParts.length > 0
        ? `${guardNoteParts.join('·')} 안내를 추가했습니다.`
        : null;

  return {
    text: out.trim(),
    note,
    debugTags: [...guarded.debugTags, ...(missing.length > 0 ? ['missing-sections'] : []), ...(!commonOk ? ['weak-common-four'] : [])],
  };
}
