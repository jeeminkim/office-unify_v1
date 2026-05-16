/**
 * 웹 페르소나 채팅(일별 세션 + 장기 기억) 최소 DTO.
 */

import type { PersonaStructuredOutput, PersonaStructuredOutputQualitySummary } from './personaStructuredOutput';

/** URL/설정에서 쓰는 슬러그, 예: `ray-dalio` */
export type PersonaWebKey = string & { readonly __brand: 'PersonaWebKey' };

export function toPersonaWebKey(raw: string): PersonaWebKey {
  return raw.trim().toLowerCase() as PersonaWebKey;
}

/** KST 기준 일 단위 세션 식별에 쓰는 날짜 문자열 */
export type DailySessionDateKst = string & { readonly __brand: 'DailySessionDateKst' };

export type PersonaChatMessageRole = 'user' | 'assistant';

export type PersonaChatMessageDto = {
  id: string;
  role: PersonaChatMessageRole;
  content: string;
  createdAt: string;
};

export type PersonaChatSessionDto = {
  sessionId: string;
  personaKey: PersonaWebKey;
  sessionDateKst: DailySessionDateKst;
  messages: PersonaChatMessageDto[];
};

/** GET /api/persona-chat/session */
export type PersonaChatSessionInitResponseBody = {
  session: PersonaChatSessionDto;
  /** 표시·프롬프트용 장기 요약(구조화 JSON이면 펼친 텍스트) */
  longTermMemorySummary: string | null;
  /** 직전 KST 일의 마지막 assistant 한 줄(선택, 프롬프트 힌트용) */
  previousDayAssistantHint: string | null;
  /** 서버 레지스트리에 등록된 페르소나 슬러그 */
  registeredPersonaKeys: string[];
};

/** POST /api/persona-chat/message */
export type PersonaChatMessageRequestBody = {
  /** 생략 시 서버 기본 페르소나 */
  personaKey?: string;
  content: string;
  /**
   * 클라이언트가 생성한 멱등 키(권장: UUID).
   * 성공 응답이 동일 프로세스 캐시에 있으면 LLM/DB를 다시 실행하지 않는다.
   */
  idempotencyKey?: string;
};

/** 투자위원회 토론(턴제) 한 발언자의 한 줄 */
export type CommitteeDiscussionLineDto = {
  slug: string;
  displayName: string;
  content: string;
  /** additive: 구조화 페르소나 산출물(LLM JSON 계약) */
  structuredOutput?: PersonaStructuredOutput;
  structuredParseWarnings?: string[];
};

/** POST /api/persona-chat/feedback — 장기 기억에 반영할 답변 평가 */
export type PersonaChatFeedbackRating = 'top' | 'ok' | 'weak';

export type PersonaChatFeedbackRequestBody = {
  personaKey: string;
  assistantMessageId: string;
  rating: PersonaChatFeedbackRating;
  note?: string;
};

export type PersonaChatFeedbackResponseBody = {
  ok: true;
  longTermMemorySummary: string | null;
};

/** POST /api/committee-discussion/round — 요청(확장) */
export type CommitteeDiscussionRoundRequestBody = {
  topic: string;
  roundNote?: string;
  priorTranscript?: CommitteeDiscussionLineDto[];
  /** 첫 라운드 생략 시 서버가 생성. 이후 라운드는 필수 */
  committeeTurnId?: string;
};

/** POST /api/committee-discussion/round — 응답 */
export type CommitteeDiscussionRoundResponseBody = {
  lines: CommitteeDiscussionLineDto[];
  committeeTurnId: string;
  /** additive: 라운드 전체 구조화 출력 집계 */
  personaStructuredOutputSummary?: PersonaStructuredOutputQualitySummary;
};

/** POST /api/committee/feedback — 위원회 토론 1회에 대한 피드백 */
export type CommitteeFeedbackRequestBody = {
  committeeTurnId: string;
  rating: PersonaChatFeedbackRating;
  note?: string;
};

export type CommitteeFeedbackResponseBody = {
  ok: true;
  longTermMemorySummary: string | null;
};

/** GET /api/committee/memory — committee-lt 요약 표시용 */
export type CommitteeMemoryResponseBody = {
  longTermMemorySummary: string | null;
};

export type PersonaChatMessageResponseBody = {
  userMessage: PersonaChatMessageDto;
  assistantMessage: PersonaChatMessageDto;
  longTermMemorySummary: string | null;
  /** 동일 idempotencyKey로 이미 처리된 요청에 대한 재전송 응답 */
  deduplicated?: boolean;
  /**
   * Private Banker 전용 — 서버가 응답 형식을 최소 보정했을 때만 짧은 안내(선택).
   * `/persona-chat` 응답에서는 생략된다.
   */
  pbFormatNote?: string;
  /**
   * 투자위원회 페르소나(persona-chat) — 형식 보정 시에만 짧은 안내(선택).
   */
  personaFormatNote?: string;
  /** OpenAI 예산/폴백 등으로 Gemini를 썼을 때 서버 안내(선택). */
  llmProviderNote?: string;
  /** 형식 계약 검증 메타 (PB/위원회 확장) */
  outputQuality?: {
    formatValid: boolean;
    missingSections: string[];
    normalized: boolean;
    warnings: string[];
  };
  /** 모델 경로/폴백 배지용 메타 */
  modelUsage?: {
    providerUsed: string;
    fallbackUsed: boolean;
  };
  /** additive: 파싱된 구조화 산출물 */
  personaStructuredOutput?: PersonaStructuredOutput | null;
  /** JSON 파싱 실패 시 원문 요약 보존 */
  personaStructuredFallbackSummary?: string;
  /** additive: 단일 메시지 응답 집계(성공 0~1) */
  personaStructuredOutputSummary?: PersonaStructuredOutputQualitySummary;
  /** 금지 문구·계약 위반 등 페르소나 경고 */
  personaWarnings?: string[];
  /** additive: 구조화 JSON 파싱 실패 여부(단일 메시지) */
  personaStructuredParseFailed?: boolean;
  /** additive: insufficient_data 등 폴백 산출물 적용 여부 */
  personaStructuredFallbackApplied?: boolean;
  /** additive: 금지 문구 sanitize 히트 수(요약과 동일 값일 수 있음) */
  personaStructuredBannedPhraseCount?: number;
};
