# 포트폴리오·계좌·스냅샷 안정화 (정책·검증)

## 1. 마이그레이션 순서 (`schema.sql` 하단 주석과 동일)

1. `accounts` 생성  
2. 기존 `기본` 계좌명 → `일반계좌`로 rename (`UPDATE accounts …`)  
3. `portfolio.account_id` 추가  
4. `일반계좌` 행 생성 후 `portfolio.account_id` 백필  
5. `uq_portfolio_user_symbol` 제거  
6. `uq_portfolio_user_account_symbol` 생성  
7. `portfolio.purchase_currency`, `trade_history.purchase_currency` 추가 및 백필  

## 2. 스키마 존재 확인 SQL (A)

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('accounts','trade_history','portfolio_snapshot_history');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'portfolio' AND column_name IN ('account_id','purchase_currency');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'trade_history' AND column_name = 'purchase_currency';

SELECT indexname FROM pg_indexes WHERE tablename = 'portfolio'
  AND indexname = 'uq_portfolio_user_account_symbol';

SELECT indexname FROM pg_indexes WHERE tablename = 'portfolio_snapshot_history';
```

## 3. 백필 검증 SQL (B)

```sql
SELECT count(*) AS portfolio_null_account FROM portfolio WHERE account_id IS NULL;

SELECT discord_user_id, account_name FROM accounts WHERE account_name = '일반계좌';

SELECT count(*) FROM portfolio p
JOIN accounts a ON a.id = p.account_id AND a.account_name = '일반계좌';

SELECT count(*) FROM trade_history WHERE purchase_currency IS NULL;
```

## 4. 런타임 검증 시나리오 (C)

- 일반계좌에서 동일 종목 추가 매수 → 평단 가중평균·`purchase_currency` 유지  
- 일반계좌 부분 매도 → `TRADE realized pnl policy applied` / `TRADE realized pnl updated` 로그, `realized_pnl_krw` 확인  
- 퇴직연금 등 다른 계좌에 동일 심볼 등록 → 계좌별 조회는 합치지 않음 (`scope: 'DEFAULT'`는 일반계좌만)  
- `🌐 전체 자산 보기` → `scope: 'ALL'`로만 합산, 일일 스냅샷은 `account_id IS NULL` + aggregate  
- Discord: `📒 포트폴리오 보기` = 일반계좌만 · `🌐 전체 자산 보기` = 합산 · 퇴직연금/계좌별/계좌 관리는 **더보기** 서브 패널 (`panelManager.ts` / `portfolioUx.ts`)  
- 같은 날 스냅샷 두 번 저장 → `SNAPSHOT duplicate daily snapshot skipped`  
- 미국주식: 응답에 USD 현재가·평가(USD)·환율·KRW 평가·원가(KRW)·손익(KRW) 표시  

## 5. 회귀 위험 포인트 (D)

- 계좌 미지정이 전체 합산으로 처리되는 경우 → **기본은 `scope: 'DEFAULT'`(일반계좌만)**  
- 일반/퇴직연금 동일 심볼이 한 줄로 섞이는 경우 → **계좌별은 `account_id`로 분리, 합산은 `scope: 'ALL'`만**  
- 실현손익이 FIFO처럼 동작하는 경우 → **WAC만 사용 (`recordSellTrade` 주석·로그)**  
- 미국주식 원가 통화와 현재가(USD) 혼동 → **`purchase_currency` vs 시세 USD 분리**  
- `purchase_currency` 누락 시 잘못된 추론 → **컬럼 백필 + `resolvePurchaseCurrency`**

## 6. Discord UI와 백엔드 정책 일치 (점검 결과)

| UI 문구 / 버튼 | 백엔드 |
|----------------|--------|
| 📒 포트폴리오 보기 | `buildPortfolioSnapshot(..., { scope: 'DEFAULT' })` → 일반계좌만 |
| 🌐 전체 자산 보기 | `scope: 'ALL'` + 스냅샷 aggregate (`account_id` null) |
| 🧾 퇴직연금 보기 | `findFirstRetirementAccount` → `scope: 'ACCOUNT'` |
| 🗂 계좌별 보기 | Select → `scope: 'ACCOUNT'` + 선택 `account_id` |
| ➕ 종목 추가 | `recordBuyTrade` 계좌 미지정 → 일반계좌 |
| ➕ 다른 계좌에 매수 | Select 후 `accountId` 지정 매수 |
| 스냅샷 footer | `buildPortfolioDiscordMessage` — 저장됨 / 이미 존재 한 줄 |

### UI 로그 (검증용)

`UI portfolio panel rendered`, `UI default account view selected`, `UI aggregate asset view selected`, `UI retirement account view selected`, `UI account-specific view selected`, `UI trade modal opened`, `UI advanced account selector used`, `UI snapshot status shown`
