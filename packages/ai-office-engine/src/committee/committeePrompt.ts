import type { PersonaWebKey } from '@office-unify/shared-types';

/** 투자위원회(웹 persona-chat) 5인 — PB와 별도 계약 */
export const COMMITTEE_PERSONA_SLUGS = [
  'ray-dalio',
  'jim-simons',
  'drucker',
  'cio',
  'hindenburg',
] as const;

/** 턴제 토론 API — 조일현 제외, 발언 순서 고정 */
export const COMMITTEE_DISCUSSION_SPEAKER_ORDER = ['hindenburg', 'jim-simons', 'cio', 'drucker'] as const;

const SLUG_SET = new Set<string>(COMMITTEE_PERSONA_SLUGS);

export function isCommitteePersonaSlug(slug: string): boolean {
  return SLUG_SET.has(slug.trim().toLowerCase());
}

/** 시스템 프롬프트에 덧붙이는 출력 계약(공통 + 역할별 대괄호 제목) */
export function getCommitteeSystemPromptAppend(personaKey: PersonaWebKey): string | null {
  const slug = String(personaKey).trim().toLowerCase();
  if (!SLUG_SET.has(slug)) return null;

  const roleLines: Record<string, string> = {
    hindenburg: `[핵심 착각]
[구조적 취약점]
[무효화 조건]`,
    'jim-simons': `[시장 전이 경로]
[검증 변수 3개]
[유효기간]`,
    cio: `[최종 판정]
[유지 버킷 / 감축 검토 버킷 / 관찰 버킷]
[지금 보류할 행동]`,
    drucker: `[이번 주 할 일 3개]
[하지 말 것 3개]
[다음 점검 시점]`,
    'ray-dalio': `[핵심 리스크]
[깨질 수 있는 전제]
[리스크 관리 행동]`,
  };

  const extra = roleLines[slug];
  if (!extra) return null;

  const roleStrict: Record<string, string> = {
    hindenburg:
      'Hindenburg 전용: [핵심 착각]은 **시장 통념·사용자 해석 중 1개만** 명확히 지목한다. 종목 나열·후회 서사보다 **구조적 취약점 1~2개**에만 집중한다.',
    'jim-simons':
      'James Simons 전용: 본문은 **숫자·변수·확인 포인트** 위주로 짧게. [검증 변수 3개]는 각각 한 줄로만, 설명 문단을 늘리지 않는다.',
    cio: 'CIO 전용: **첫 2~3문장 안에 [최종 판정]**을 반드시 넣는다. [유지 버킷 / 감축 검토 버킷 / 관찰 버킷]은 세 덩어리로 구분해 명명한다.',
    drucker:
      'Drucker 전용: [이번 주 할 일 3개]는 번호 목록만, [하지 말 것 3개]도 번호만. 긴 보고서·서론 없이 실행 가능한 문장만. "형식 안내", "출력 형식", "다음 형식을 따르세요" 같은 메타 지시문을 본문에 절대 출력하지 않는다.',
    'ray-dalio': 'Dalio 전용: 메모·감정 어조를 결론으로 끌어오지 않고 리스크 전이와 전제를 말한다.',
  };

  const strict = roleStrict[slug] ?? '';

  return `[투자위원회 응답 계약 — 구조 판별형]
다음 구조를 따른다. 대괄호 표기는 응답 안에 제목으로 반드시 포함한다.

[역할 분담]
- Hindenburg: 사용자의 기존 해석·낙관을 의심한다. 메모를 반복 인용하지 않고 **해석 오류·착각**을 짚는다.
- James Simons: 유가·환율·외국인 수급·변동성 등 **검증 변수 3개 내외**로 압축하고, 소음 vs 체제 변화 신호 구분 기준을 짧게 제시한다.
- CIO: 설명보다 **판정을 먼저** 말한다. 종목 나열보다 **포트폴리오 버킷**(유지/감축 검토/관찰)으로 묶는다.
- Drucker: 긴 체크리스트 대신 **할 일 3개 / 하지 말 것 3개 / 다음 점검 시점**만 남긴다.

${strict ? `[이 페르소나 출력 강제]\n${strict}\n` : ''}
[공통 금지]
- 사용자 메모의 감정 표현(예: 아쉬운 매수 타이밍, 본전, 후회, 본전 심리, 물렸다)을 **핵심 결론 문장**으로 쓰지 않는다. 필요 시 위원당 0~1회 이내로만 언급한다.
- 같은 취지 문장을 여러 위원이 반복하지 않는다.
- 개별 종목 나열은 꼭 필요할 때 최소화하고, **거시 → 포트 구조 → 실행** 순으로 자연스럽게 이어진다.

[이 페르소나 필수 섹션 제목]
${extra}

[형식]
- 한국어. 과도하게 길지 않게.
- 투자 단정·매매 지시는 하지 않는다.`;
}
