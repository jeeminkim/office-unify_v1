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

-- ============================
-- Personalization & Feedback
-- ============================

-- Chat history extended columns for summarization & feedback targeting
ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS debate_type TEXT;
ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS key_risks TEXT;
ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS key_actions TEXT;

-- User profile for personalization signals
CREATE TABLE IF NOT EXISTS user_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL UNIQUE,
    risk_tolerance TEXT,
    investment_style TEXT,
    preferred_sectors TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    behavior_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    preferred_personas TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    avoided_personas TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    favored_analysis_styles TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    personalization_notes TEXT,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_profile_discord_user_id ON user_profile(discord_user_id);

-- Feedback history capturing which opinions the user liked/adopted
CREATE TABLE IF NOT EXISTS analysis_feedback_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL,
    chat_history_id UUID,
    analysis_type TEXT NOT NULL,
    persona_name TEXT NOT NULL,
    opinion_summary TEXT,
    opinion_text TEXT,
    feedback_type TEXT NOT NULL,
    feedback_note TEXT,
    topic_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    applied_to_profile BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_feedback_chat_history FOREIGN KEY (chat_history_id) REFERENCES chat_history(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON analysis_feedback_history(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_chat_history ON analysis_feedback_history(chat_history_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON analysis_feedback_history(created_at DESC);

-- ============================
-- Accounts / Trade ledger / Snapshot history
-- ============================

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'TAXABLE' CHECK (account_type IN ('TAXABLE', 'RETIREMENT', 'PENSION', 'ISA', 'OTHER')),
    base_currency TEXT NOT NULL DEFAULT 'KRW',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (discord_user_id, account_name)
);
CREATE INDEX IF NOT EXISTS idx_accounts_discord ON accounts(discord_user_id);

CREATE TABLE IF NOT EXISTS trade_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    trade_type TEXT NOT NULL CHECK (trade_type IN ('BUY', 'SELL')),
    display_name TEXT,
    symbol TEXT NOT NULL,
    quote_symbol TEXT,
    market TEXT,
    currency TEXT,
    quantity NUMERIC NOT NULL,
    price_per_unit NUMERIC NOT NULL,
    total_amount NUMERIC,
    fee NUMERIC NOT NULL DEFAULT 0,
    trade_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    memo TEXT,
    realized_pnl_krw NUMERIC,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trade_user_date ON trade_history(discord_user_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_trade_account ON trade_history(account_id);

CREATE TABLE IF NOT EXISTS portfolio_snapshot_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    total_cost_basis_krw NUMERIC NOT NULL DEFAULT 0,
    total_market_value_krw NUMERIC NOT NULL DEFAULT 0,
    total_pnl_krw NUMERIC NOT NULL DEFAULT 0,
    total_return_pct NUMERIC NOT NULL DEFAULT 0,
    position_count INT NOT NULL DEFAULT 0,
    cash_estimate_krw NUMERIC,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_snapshot_user_day_agg
    ON portfolio_snapshot_history(discord_user_id, snapshot_date)
    WHERE account_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_snapshot_user_account_day
    ON portfolio_snapshot_history(discord_user_id, account_id, snapshot_date)
    WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_snapshot_user ON portfolio_snapshot_history(discord_user_id, snapshot_date DESC);

-- Link holdings to account
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;

/*
  === Migration order (accounts / portfolio / snapshot) — apply in this order ===
  1) CREATE accounts (above)
  2) 일반계좌 per discord_user_id (INSERT below uses account_name = '일반계좌')
  3) ALTER portfolio ADD account_id
  4) Backfill portfolio.account_id → 일반계좌
  5) DROP uq_portfolio_user_symbol
  6) CREATE uq_portfolio_user_account_symbol

  Intermediate checks (run between steps if needed):
  - SELECT count(*) FROM portfolio WHERE account_id IS NULL;
  - SELECT discord_user_id, account_name FROM accounts WHERE account_name IN ('기본','일반계좌');

  Rollback / retry:
  - If step 6 fails: fix duplicate (discord_user_id, account_id, symbol) rows, then retry CREATE UNIQUE INDEX.
  - If step 5 already ran: restore from backup or recreate uq_portfolio_user_symbol only if account_id is null for all rows (legacy).
  - Rename legacy rows: UPDATE accounts SET account_name = '일반계좌' WHERE account_name = '기본';
*/

UPDATE accounts SET account_name = '일반계좌' WHERE account_name = '기본';

-- Default account per user + backfill portfolio.account_id (일반계좌 = main taxable account)
INSERT INTO accounts (discord_user_id, account_name, account_type, base_currency, is_active)
SELECT DISTINCT p.discord_user_id, '일반계좌', 'TAXABLE', 'KRW', TRUE
FROM portfolio p
WHERE p.discord_user_id IS NOT NULL
ON CONFLICT (discord_user_id, account_name) DO NOTHING;

UPDATE portfolio p
SET account_id = a.id
FROM accounts a
WHERE p.account_id IS NULL
  AND p.discord_user_id IS NOT NULL
  AND a.discord_user_id = p.discord_user_id
  AND a.account_name = '일반계좌';

-- Replace unique (user, symbol) with (user, account, symbol)
DROP INDEX IF EXISTS uq_portfolio_user_symbol;
CREATE UNIQUE INDEX IF NOT EXISTS uq_portfolio_user_account_symbol ON portfolio(discord_user_id, account_id, symbol);

-- purchase_currency: cost-basis unit for avg_purchase_price (KRW/주 or USD/주). Independent from live quote currency for US.
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS purchase_currency TEXT NOT NULL DEFAULT 'KRW';
ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS purchase_currency TEXT NOT NULL DEFAULT 'KRW';

UPDATE portfolio p
SET purchase_currency = CASE
  WHEN COALESCE(p.market, 'KR') = 'US' AND UPPER(COALESCE(p.currency, '')) = 'USD' THEN 'USD'
  WHEN COALESCE(p.market, 'KR') = 'US' THEN 'KRW'
  ELSE 'KRW'
END;

UPDATE trade_history t
SET purchase_currency = CASE
  WHEN COALESCE(t.market, 'KR') = 'US' AND UPPER(COALESCE(t.currency, '')) = 'USD' THEN 'USD'
  WHEN COALESCE(t.market, 'KR') = 'US' THEN 'KRW'
  ELSE 'KRW'
END;

/*
  === DB verification (post-deploy) ===
  A) Schema: SELECT table_name FROM information_schema.tables WHERE table_name IN ('accounts','trade_history','portfolio_snapshot_history');
  B) Columns: portfolio.account_id, portfolio.purchase_currency, trade_history.purchase_currency
  C) Indexes: uq_portfolio_user_account_symbol, uq_snapshot_user_day_agg, uq_snapshot_user_account_day
  D) Backfill: SELECT count(*) FROM portfolio WHERE account_id IS NULL;
*/
