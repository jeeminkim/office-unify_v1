CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- Portfolio master
CREATE TABLE IF NOT EXISTS stocks (
    symbol TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sector TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Current holdings (single row per user+symbol)
CREATE TABLE IF NOT EXISTS portfolio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL,
    symbol TEXT NOT NULL REFERENCES stocks(symbol) ON DELETE RESTRICT,
    quantity NUMERIC NOT NULL DEFAULT 0,
    avg_purchase_price NUMERIC NOT NULL DEFAULT 0,
    current_price NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (discord_user_id, symbol)
);
CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio(discord_user_id);
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS market TEXT;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS quote_symbol TEXT;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS exchange TEXT;
UPDATE portfolio
SET market = COALESCE(market, 'KR'),
    currency = COALESCE(currency, 'KRW')
WHERE market IS NULL OR currency IS NULL;

-- Migration safety for existing tables
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS discord_user_id TEXT;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE portfolio SET discord_user_id = user_id WHERE discord_user_id IS NULL AND user_id IS NOT NULL;
-- If legacy schema still enforces user_id NOT NULL, relax it for discord_user_id based writes.
ALTER TABLE portfolio ALTER COLUMN user_id DROP NOT NULL;
-- Deduplicate legacy rows before enforcing unique(user,symbol)
WITH ranked AS (
  SELECT
    id,
    discord_user_id,
    symbol,
    quantity,
    avg_purchase_price,
    ROW_NUMBER() OVER (PARTITION BY discord_user_id, symbol ORDER BY updated_at DESC NULLS LAST, id) AS rn
  FROM portfolio
),
merged AS (
  SELECT
    discord_user_id,
    symbol,
    SUM(quantity) AS total_qty,
    CASE WHEN SUM(quantity) > 0
      THEN SUM(quantity * avg_purchase_price) / SUM(quantity)
      ELSE 0
    END AS weighted_avg
  FROM portfolio
  GROUP BY discord_user_id, symbol
)
UPDATE portfolio p
SET
  quantity = m.total_qty,
  avg_purchase_price = m.weighted_avg,
  updated_at = now()
FROM ranked r
JOIN merged m
  ON m.discord_user_id = r.discord_user_id
 AND m.symbol = r.symbol
WHERE p.id = r.id
  AND r.rn = 1;

DELETE FROM portfolio p
USING (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (PARTITION BY discord_user_id, symbol ORDER BY updated_at DESC NULLS LAST, id) AS rn
    FROM portfolio
  ) t
  WHERE t.rn > 1
) d
WHERE p.id = d.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_portfolio_user_symbol ON portfolio(discord_user_id, symbol);

-- Spending records
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    expense_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(discord_user_id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS discord_user_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_date TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE expenses SET discord_user_id = user_id WHERE discord_user_id IS NULL AND user_id IS NOT NULL;

-- Cashflow records
CREATE TABLE IF NOT EXISTS cashflow (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL,
    flow_type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    description TEXT,
    flow_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cashflow_user ON cashflow(discord_user_id);
ALTER TABLE cashflow ADD COLUMN IF NOT EXISTS discord_user_id TEXT;
UPDATE cashflow SET discord_user_id = user_id WHERE discord_user_id IS NULL AND user_id IS NOT NULL;

-- User mode settings
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL UNIQUE,
    mode TEXT NOT NULL DEFAULT 'BALANCED' CHECK (mode IN ('SAFE', 'BALANCED', 'AGGRESSIVE')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional hardening after null checks:
-- ALTER TABLE portfolio ALTER COLUMN discord_user_id SET NOT NULL;
-- ALTER TABLE expenses ALTER COLUMN discord_user_id SET NOT NULL;
-- ALTER TABLE cashflow ALTER COLUMN discord_user_id SET NOT NULL;

-- AI conversation history
CREATE TABLE IF NOT EXISTS chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    user_query TEXT NOT NULL,
    ray_advice TEXT,
    jyp_insight TEXT,
    simons_opportunity TEXT,
    drucker_decision TEXT,
    cio_decision TEXT,
    jyp_weekly_report TEXT,
    embedding VECTOR(768),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_history_embedding ON chat_history USING hnsw (embedding vector_cosine_ops);
