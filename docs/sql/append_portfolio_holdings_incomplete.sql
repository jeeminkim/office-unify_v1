-- Optional: web_portfolio_holdings incomplete 등록 (수량·평단 NULL 허용)
-- 운영 DB에 이미 해당 컬럼이 nullable이면 적용 불필요.
-- 앱은 incomplete 행을 평가·집중도·브리핑 P&L 집계에서 제외한다(null/0을 활성 보유로 간주하지 않음).

-- 예시 (실제 테이블명/제약은 배포 스키마에 맞게 조정):
-- ALTER TABLE web_portfolio_holdings
--   ALTER COLUMN qty DROP NOT NULL,
--   ALTER COLUMN avg_price DROP NOT NULL;

-- 코멘트만 추가하는 경우:
-- COMMENT ON COLUMN web_portfolio_holdings.qty IS 'NULL 또는 비양수면 간편 등록(incomplete); 평가 집계 제외';
-- COMMENT ON COLUMN web_portfolio_holdings.avg_price IS 'NULL 또는 비양수면 간편 등록(incomplete); 평가 집계 제외';
