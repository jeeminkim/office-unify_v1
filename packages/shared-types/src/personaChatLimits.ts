/**
 * 웹 페르소나 채팅 길이 정책 — UI·서버·LLM 유도에서 동일 상수를 참조한다.
 */

/** 사용자 입력 최대 길이(자) */
export const PERSONA_CHAT_USER_MESSAGE_MAX_CHARS = 2000;

/**
 * 투자위원회 토론 API — 서버가 합성하는 user 메시지(주제+기록) 상한.
 * 일반 persona-chat 입력(`PERSONA_CHAT_USER_MESSAGE_MAX_CHARS`)과 별도다.
 */
export const COMMITTEE_DISCUSSION_USER_CONTENT_MAX_CHARS = 28_000;

/** PB 주간 점검 등 서버 합성 프롬프트 상한(자) */
export const PERSONA_CHAT_SERVER_SYNTHESIZED_MAX_CHARS = 28_000;

/** UI에 먼저 보여 줄 assistant/preview 요약 상한(자) */
export const LONG_RESPONSE_DISPLAY_LIMIT_CHARS = 2000;

/** assistant 응답 목표 상한(자) — generationConfig와 시스템 지시에 맞춤 */
export const PERSONA_CHAT_ASSISTANT_TARGET_MAX_CHARS = 2000;

/** 스트리밍 UI에서 한 번에 덧붙여 보여 줄 대략적인 문자 단위(긴 답 가독성) */
export const PERSONA_CHAT_STREAM_FLUSH_CHARS = 2000;

/** 장기 기억 스니펫 한 건 최대(자) — 원문 누적 방지 */
export const PERSONA_CHAT_MEMORY_SNIPPET_MAX_CHARS = 500;

/** 스니펫 목표 하한(자) — 너무 짧은 한 줄만 쌓이는 것 완화(선택적 절단 시) */
export const PERSONA_CHAT_MEMORY_SNIPPET_TARGET_MIN_CHARS = 200;

/** 피드백과 함께 저장하는 사용자 메모 최대 길이(자) */
export const PERSONA_CHAT_FEEDBACK_NOTE_MAX_CHARS = 400;
