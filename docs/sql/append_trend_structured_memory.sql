-- Trend structured memory additive extension
-- Safe to re-run.

ALTER TABLE IF EXISTS public.trend_report_runs
ADD COLUMN IF NOT EXISTS time_window text,
ADD COLUMN IF NOT EXISTS source_quality_json jsonb,
ADD COLUMN IF NOT EXISTS ticker_validation_json jsonb,
ADD COLUMN IF NOT EXISTS score_json jsonb,
ADD COLUMN IF NOT EXISTS structured_memory_json jsonb,
ADD COLUMN IF NOT EXISTS warnings_json jsonb;

CREATE TABLE IF NOT EXISTS public.trend_memory_signals_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key text NOT NULL,
  topic_key text NOT NULL,
  signal_key text NOT NULL,
  signal_name text NOT NULL,
  signal_summary text NOT NULL,
  time_bucket text NOT NULL,
  direction text,
  confidence text,
  source_grade text,
  evidence_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  beneficiaries_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_watch_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_trend_memory_signals_user_topic_signal
  ON public.trend_memory_signals_v2(user_key, topic_key, signal_key);
