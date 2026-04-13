-- Trend Analysis Center — Phase 4: SQL memory (3-table minimum)
-- Apply after core web tables exist. Safe to re-run (IF NOT EXISTS).
-- If not applied, /trend report generation still works; memory layer is skipped with meta/warnings.

-- 1) Report execution history
CREATE TABLE IF NOT EXISTS trend_report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('weekly', 'monthly')),
  horizon TEXT NOT NULL,
  geo TEXT NOT NULL,
  sector_focus JSONB NOT NULL DEFAULT '[]'::jsonb,
  focus TEXT NOT NULL,
  user_prompt TEXT,
  title TEXT,
  summary TEXT,
  report_markdown TEXT,
  confidence NUMERIC,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  freshness_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trend_report_runs_user_created
  ON trend_report_runs (user_key, created_at DESC);

COMMENT ON TABLE trend_report_runs IS 'Trend Analysis Center: one row per generated report (append-only history).';

-- 2) Structural memory topics (dedup per user_key + memory_key)
CREATE TABLE IF NOT EXISTS trend_memory_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  title TEXT NOT NULL,
  canonical_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  strength_score NUMERIC NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_count INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  last_report_run_id UUID REFERENCES trend_report_runs (id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_key, memory_key)
);

CREATE INDEX IF NOT EXISTS idx_trend_memory_topics_user_status_seen
  ON trend_memory_topics (user_key, status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_trend_memory_topics_user_key_lookup
  ON trend_memory_topics (user_key, memory_key);

COMMENT ON TABLE trend_memory_topics IS 'Trend memory: recurring structural themes (not full report text).';

-- 3) Signals appended per topic / report run
CREATE TABLE IF NOT EXISTS trend_memory_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES trend_memory_topics (id) ON DELETE CASCADE,
  report_run_id UUID REFERENCES trend_report_runs (id) ON DELETE SET NULL,
  signal_type TEXT NOT NULL,
  signal_label TEXT NOT NULL,
  evidence_summary TEXT,
  source_ref TEXT,
  source_url TEXT,
  confidence NUMERIC,
  direction TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_trend_memory_signals_topic_observed
  ON trend_memory_signals (topic_id, observed_at DESC);

COMMENT ON TABLE trend_memory_signals IS 'Trend memory: delta signals (new, reinforced, weakened, dormant, etc.).';
