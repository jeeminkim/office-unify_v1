-- Phase 3: 현금흐름 정규화, 지출 할부 컬럼, 종목 등록 후보(pending) 테이블, portfolio/trade_history 메타 검증(레거시 호환)
-- 적용: Supabase SQL Editor에서 한 번에 실행. idempotent (IF NOT EXISTS / IF NOT EXISTS constraint name).

-- ─────────────────────────────────────────────────────────────
-- 1) expenses: 할부 (null-safe, 기존 행은 모두 NULL)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_installment BOOLEAN;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS installment_months INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS monthly_recognized_amount NUMERIC;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS installment_start_date DATE;

COMMENT ON COLUMN expenses.is_installment IS 'true: 할부 인식, false/NULL: 일시불';
COMMENT ON COLUMN expenses.installment_months IS '할부 개월 수; 일시불이면 NULL 또는 1';
COMMENT ON COLUMN expenses.monthly_recognized_amount IS '월 인식 금액(총액/개월)';
COMMENT ON COLUMN expenses.installment_start_date IS '할부 인식 시작일';

-- ─────────────────────────────────────────────────────────────
-- 2) cashflow: 레거시 flow_type → 표준 ENUM 문자열로 정규화 후 CHECK
-- ─────────────────────────────────────────────────────────────
UPDATE cashflow
SET flow_type = CASE lower(trim(flow_type))
  WHEN 'income' THEN 'OTHER_IN'
  WHEN 'fixed_expense' THEN 'CONSUMPTION'
  WHEN 'saving' THEN 'OTHER_OUT'
  WHEN 'investment' THEN 'OTHER_OUT'
  WHEN 'debt_payment' THEN 'LOAN_PRINCIPAL'
  WHEN 'other' THEN 'OTHER_OUT'
  ELSE trim(flow_type)
END
WHERE lower(trim(flow_type)) IN ('income', 'fixed_expense', 'saving', 'investment', 'debt_payment', 'other');

-- 기존 CHECK 이름 충돌 방지: 있으면 드롭 후 재생성
ALTER TABLE cashflow DROP CONSTRAINT IF EXISTS cashflow_flow_type_allowed;

-- NOT VALID: 기존 행에 남은 비표준 값이 있어도 마이그레이션은 통과. 신규 INSERT/UPDATE는 표준값만 허용.
ALTER TABLE cashflow
  ADD CONSTRAINT cashflow_flow_type_allowed
  CHECK (
    flow_type IN (
      'SALARY', 'BONUS', 'LOAN_IN', 'LOAN_PRINCIPAL', 'LOAN_INTEREST',
      'CONSUMPTION', 'OTHER_IN', 'OTHER_OUT'
    )
  )
  NOT VALID;

-- 기존 행까지 완전히 맞춘 뒤 운영에서: ALTER TABLE cashflow VALIDATE CONSTRAINT cashflow_flow_type_allowed;

-- ─────────────────────────────────────────────────────────────
-- 3) instrument_registration_candidates: 확인 전 pending만 저장
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instrument_registration_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id TEXT NOT NULL,
  raw_input TEXT NOT NULL,
  requested_market_hint TEXT,
  candidate_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  trade_qty NUMERIC,
  trade_price NUMERIC,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  pending_pick_index INTEGER,
  selected_symbol TEXT,
  selected_display_name TEXT,
  selected_market TEXT,
  selected_exchange TEXT,
  selected_quote_symbol TEXT,
  selected_currency TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_instr_reg_candidates_user_status
  ON instrument_registration_candidates (discord_user_id, status, created_at DESC);

COMMENT ON TABLE instrument_registration_candidates IS '종목 메타 확정 전 Discord 후보; portfolio/trade_history는 CONFIRMED 후에만 앱에서 반영';

-- ─────────────────────────────────────────────────────────────
-- 4) portfolio / trade_history: KR·US 메타 조합 (레거시 행 보호 → NOT VALID)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE portfolio DROP CONSTRAINT IF EXISTS chk_portfolio_kr_us_instrument_meta;

-- market/currency/symbol/quote가 모두 채워진 행만 KR·US 규칙을 강제한다(레거시 NULL 행은 허용).
ALTER TABLE portfolio
  ADD CONSTRAINT chk_portfolio_kr_us_instrument_meta
  CHECK (
    NOT (
      market IN ('KR', 'US')
      AND currency IS NOT NULL
      AND symbol IS NOT NULL
      AND btrim(symbol) <> ''
      AND quote_symbol IS NOT NULL
      AND btrim(quote_symbol) <> ''
    )
    OR (
      market = 'KR'
      AND currency = 'KRW'
      AND symbol ~ '^[0-9]{6}$'
      AND quote_symbol ~ '^[0-9]{6}\.(KS|KQ)$'
    )
    OR (
      market = 'US'
      AND currency = 'USD'
      AND symbol = quote_symbol
      AND symbol ~ '^[A-Z0-9.-]{1,20}$'
    )
  )
  NOT VALID;

ALTER TABLE trade_history DROP CONSTRAINT IF EXISTS chk_trade_history_kr_us_instrument_meta;

ALTER TABLE trade_history
  ADD CONSTRAINT chk_trade_history_kr_us_instrument_meta
  CHECK (
    NOT (
      market IN ('KR', 'US')
      AND currency IS NOT NULL
      AND symbol IS NOT NULL
      AND btrim(symbol) <> ''
      AND quote_symbol IS NOT NULL
      AND btrim(quote_symbol) <> ''
    )
    OR (
      market = 'KR'
      AND currency = 'KRW'
      AND symbol ~ '^[0-9]{6}$'
      AND quote_symbol ~ '^[0-9]{6}\.(KS|KQ)$'
    )
    OR (
      market = 'US'
      AND currency = 'USD'
      AND symbol = quote_symbol
      AND symbol ~ '^[A-Z0-9.-]{1,20}$'
    )
  )
  NOT VALID;

-- 레거시 데이터 정리 후 운영에서: ALTER TABLE portfolio VALIDATE CONSTRAINT chk_portfolio_kr_us_instrument_meta;
