-- EVO-063 Private Banker daily conversation templates.
-- Stores structured summaries only; do not store raw full conversation text here.
-- No trading/order/rebalancing automation is introduced by this table.

CREATE TABLE IF NOT EXISTS public.pb_daily_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key TEXT NOT NULL,
  user_message_id UUID NULL,
  assistant_message_id UUID NULL,
  template_type TEXT,
  user_intent TEXT,
  action_category TEXT,
  symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  themes JSONB NOT NULL DEFAULT '[]'::jsonb,
  emotional_state TEXT,
  confidence_level TEXT,
  thesis_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_checkpoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  memory_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pb_daily_conversations
  ADD COLUMN IF NOT EXISTS template_type TEXT,
  ADD COLUMN IF NOT EXISTS user_intent TEXT,
  ADD COLUMN IF NOT EXISTS action_category TEXT,
  ADD COLUMN IF NOT EXISTS symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS themes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS emotional_state TEXT,
  ADD COLUMN IF NOT EXISTS confidence_level TEXT,
  ADD COLUMN IF NOT EXISTS thesis_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS next_checkpoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS memory_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS user_message_id UUID NULL,
  ADD COLUMN IF NOT EXISTS assistant_message_id UUID NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_pb_daily_conversations_user_created
  ON public.pb_daily_conversations (user_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pb_daily_conversations_symbols_gin
  ON public.pb_daily_conversations USING gin (symbols);

CREATE INDEX IF NOT EXISTS idx_pb_daily_conversations_themes_gin
  ON public.pb_daily_conversations USING gin (themes);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pb_daily_conversations_template_type_check'
  ) THEN
    ALTER TABLE public.pb_daily_conversations
      ADD CONSTRAINT pb_daily_conversations_template_type_check
      CHECK (
        template_type IS NULL OR template_type IN (
          'daily_checkin',
          'buy_check',
          'sell_check',
          'anxiety_check',
          'compare_check',
          'research_check',
          'freeform'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pb_daily_conversations_action_category_check'
  ) THEN
    ALTER TABLE public.pb_daily_conversations
      ADD CONSTRAINT pb_daily_conversations_action_category_check
      CHECK (
        action_category IS NULL OR action_category IN (
          'buy',
          'add_buy',
          'sell',
          'trim',
          'hold',
          'watch',
          'research',
          'review',
          'compare',
          'no_action'
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_investment_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  importance TEXT NOT NULL DEFAULT 'medium',
  source TEXT NOT NULL DEFAULT 'pb_daily_conversation',
  source_conversation_id UUID NULL,
  related_symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_themes JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  promotion_score INTEGER NOT NULL DEFAULT 0,
  promotion_reason TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  last_reinforced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_investment_memory
  ADD COLUMN IF NOT EXISTS related_symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS related_themes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS promotion_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promotion_reason TEXT,
  ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_reinforced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_user_investment_memory_user_updated
  ON public.user_investment_memory (user_key, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_investment_memory_unique_type_key
  ON public.user_investment_memory (user_key, memory_type, memory_key);

-- Transition note:
-- Older installs may still have UNIQUE (user_key, memory_key). Do not drop it blindly in shared
-- production. If it blocks distinct memory_type rows with the same memory_key, run a separate
-- audited migration after checking duplicates and app compatibility.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_investment_memory_updated_at
ON public.user_investment_memory;

CREATE TRIGGER trg_user_investment_memory_updated_at
BEFORE UPDATE ON public.user_investment_memory
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pb_daily_conversations IS
  'PB daily template conversation summaries. Stores structured investment judgment summary, not raw full text.';

COMMENT ON TABLE public.user_investment_memory IS
  'Longer-lived user investment memory promoted from PB, Research, Committee, or Risk Review. Not a trading instruction store.';
