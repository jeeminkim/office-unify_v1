-- Realized PnL tracking + financial goals (additive only)
-- NOTE: This app uses user_key(text) for single-user auth scope.
--
-- Safety note:
-- Some environments may already have financial_goals.id as integer (legacy),
-- while new environments may use uuid. This script auto-detects the id type
-- and creates FK columns with matching type to avoid FK 42804 errors.

CREATE TABLE IF NOT EXISTS financial_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key text NOT NULL,
  goal_name text NOT NULL,
  goal_type text NOT NULL,
  target_amount_krw numeric NOT NULL,
  current_allocated_krw numeric NOT NULL DEFAULT 0,
  target_date date NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'active',
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  goal_id_udt text;
  goal_id_sql_type text;
BEGIN
  SELECT c.udt_name
    INTO goal_id_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'financial_goals'
    AND c.column_name = 'id';

  goal_id_sql_type := CASE
    WHEN goal_id_udt = 'uuid' THEN 'uuid'
    WHEN goal_id_udt = 'int4' THEN 'integer'
    WHEN goal_id_udt = 'int8' THEN 'bigint'
    ELSE 'uuid'
  END;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS realized_profit_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_key text NOT NULL,
      market text NOT NULL,
      symbol text NOT NULL,
      name text,
      sell_date date NOT NULL DEFAULT current_date,
      sell_quantity numeric NOT NULL,
      avg_buy_price numeric,
      sell_price numeric NOT NULL,
      realized_pnl_krw numeric,
      realized_pnl_rate numeric,
      fee_krw numeric NOT NULL DEFAULT 0,
      tax_krw numeric NOT NULL DEFAULT 0,
      net_realized_pnl_krw numeric,
      trade_reason text,
      memo text,
      linked_goal_id %s NULL,
      source text NOT NULL DEFAULT ''portfolio_ledger'',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )',
    goal_id_sql_type
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS goal_allocations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_key text NOT NULL,
      goal_id %s NOT NULL,
      realized_event_id uuid NULL REFERENCES realized_profit_events(id) ON DELETE SET NULL,
      amount_krw numeric NOT NULL,
      allocation_date date NOT NULL DEFAULT current_date,
      allocation_type text NOT NULL,
      memo text,
      created_at timestamptz NOT NULL DEFAULT now()
    )',
    goal_id_sql_type
  );

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'realized_profit_events'
      AND constraint_name = 'realized_profit_events_linked_goal_id_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE realized_profit_events
      ADD CONSTRAINT realized_profit_events_linked_goal_id_fkey
      FOREIGN KEY (linked_goal_id) REFERENCES financial_goals(id) ON DELETE SET NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'goal_allocations'
      AND constraint_name = 'goal_allocations_goal_id_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE goal_allocations
      ADD CONSTRAINT goal_allocations_goal_id_fkey
      FOREIGN KEY (goal_id) REFERENCES financial_goals(id) ON DELETE CASCADE';
  END IF;
END $$;

-- Ensure required columns exist even when legacy tables already exist.
ALTER TABLE IF EXISTS financial_goals
  ADD COLUMN IF NOT EXISTS user_key text,
  ADD COLUMN IF NOT EXISTS goal_name text,
  ADD COLUMN IF NOT EXISTS goal_type text,
  ADD COLUMN IF NOT EXISTS target_amount_krw numeric,
  ADD COLUMN IF NOT EXISTS current_allocated_krw numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_date date,
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS memo text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS realized_profit_events
  ADD COLUMN IF NOT EXISTS user_key text,
  ADD COLUMN IF NOT EXISTS market text,
  ADD COLUMN IF NOT EXISTS symbol text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS sell_date date DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS sell_quantity numeric,
  ADD COLUMN IF NOT EXISTS avg_buy_price numeric,
  ADD COLUMN IF NOT EXISTS sell_price numeric,
  ADD COLUMN IF NOT EXISTS realized_pnl_krw numeric,
  ADD COLUMN IF NOT EXISTS realized_pnl_rate numeric,
  ADD COLUMN IF NOT EXISTS fee_krw numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_krw numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_realized_pnl_krw numeric,
  ADD COLUMN IF NOT EXISTS trade_reason text,
  ADD COLUMN IF NOT EXISTS memo text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'portfolio_ledger',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS goal_allocations
  ADD COLUMN IF NOT EXISTS user_key text,
  ADD COLUMN IF NOT EXISTS amount_krw numeric,
  ADD COLUMN IF NOT EXISTS allocation_date date DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS allocation_type text,
  ADD COLUMN IF NOT EXISTS memo text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_realized_profit_events_user_key_sell_date
  ON realized_profit_events(user_key, sell_date DESC);
CREATE INDEX IF NOT EXISTS idx_realized_profit_events_user_key_symbol
  ON realized_profit_events(user_key, symbol);
CREATE INDEX IF NOT EXISTS idx_financial_goals_user_key_status
  ON financial_goals(user_key, status);
CREATE INDEX IF NOT EXISTS idx_goal_allocations_user_key_goal_id
  ON goal_allocations(user_key, goal_id);

CREATE OR REPLACE FUNCTION set_updated_at_realized_profit_events()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_realized_profit_events ON realized_profit_events;
CREATE TRIGGER trg_set_updated_at_realized_profit_events
BEFORE UPDATE ON realized_profit_events
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_realized_profit_events();

CREATE OR REPLACE FUNCTION set_updated_at_financial_goals()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_financial_goals ON financial_goals;
CREATE TRIGGER trg_set_updated_at_financial_goals
BEFORE UPDATE ON financial_goals
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_financial_goals();
