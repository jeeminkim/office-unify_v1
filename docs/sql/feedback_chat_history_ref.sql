-- integer chat_history.id 와 레거시 UUID FK 불일치 시 "invalid input syntax for type uuid: \"21\"" 방지
-- 적용 후: 앱은 chat_history_ref 에 숫자 id 문자열을 저장하고 chat_history_id 는 null 로 둘 수 있음.

ALTER TABLE public.analysis_feedback_history
  ADD COLUMN IF NOT EXISTS chat_history_ref text null;

CREATE INDEX IF NOT EXISTS idx_analysis_feedback_chat_history_ref
  ON public.analysis_feedback_history(discord_user_id, chat_history_ref);

COMMENT ON COLUMN public.analysis_feedback_history.chat_history_ref IS
  '운영 chat_history.id (integer) 문자열 — UUID 타입 chat_history_id FK와 분리';
