-- Watchlist sector auto-match metadata (additive)
-- Safe to re-run.

ALTER TABLE IF EXISTS public.web_portfolio_watchlist
ADD COLUMN IF NOT EXISTS sector_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS sector_match_status text,
ADD COLUMN IF NOT EXISTS sector_match_confidence integer,
ADD COLUMN IF NOT EXISTS sector_match_source text,
ADD COLUMN IF NOT EXISTS sector_match_reason text,
ADD COLUMN IF NOT EXISTS sector_matched_at timestamptz,
ADD COLUMN IF NOT EXISTS sector_is_manual boolean NOT NULL DEFAULT false;
