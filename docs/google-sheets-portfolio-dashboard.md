# Google Sheets — 포트폴리오 운영 대시보드 (보조 계층)

## 역할

- **Supabase `web_portfolio_holdings` / `web_portfolio_watchlist`가 항상 기준 원장(Source of Truth)** 입니다.
- Google 스프레드시트는 **사람이 보기 쉬운 대시보드·요약·입력 대기열** 용도로만 쓰입니다.
- 시트에서 셀을 수정한다고 **DB가 자동 반영되지 않습니다.** 반영은 앱의 **원장 SQL validate/apply** 또는 조일현 → 동일 흐름을 거칩니다.

## GOOGLEFINANCE (준실시간)

- 동기화 시 **시세·환율·손익**은 서버가 숫자를 채우지 않고, **`GOOGLEFINANCE` 수식**을 `USER_ENTERED`로 주입합니다.
- **지연**: 최대 약 **20분** 지연·누락·`#N/A`가 날 수 있습니다. **초단타·실시간 트레이딩 엔진이 아닙니다.**
- **환율(원화 환산)**: `GOOGLEFINANCE("CURRENCY:USDKRW","price")` US 보유/관심 행에 사용합니다. KR 행은 `fx_rate_to_krw = 1`로 둡니다.

## 리포트 목표가 (`research_price_targets`)

- **외부 리포트 목표가·내 부 메모**를 **수동으로** 적재하는 탭입니다. 동기화 API는 이 탭을 **덮어쓰지 않습니다.**
- **1행**에 `packages/ai-office-engine`의 `RESEARCH_PRICE_TARGETS_HEADER` 컬럼과 맞는 헤더를 두세요.
- `holdings_dashboard`의 `target_price_reports_avg`, `upside_pct_reports_avg`, `report_count` 등은 이 탭의 **동일 시장·심볼** 행을 `FILTER`/`AVERAGE`로 집계합니다.
- **리포트 평균 목표가는 운영 참고값**이며, 투자 판단의 유일한 근거나 확정 수익률이 아닙니다.

## exchange_ticker 규칙 (수식)

- **KR**: `KRX:` + 6자리 숫자 티커(앞자리 0). 숫자가 아닌 티커·ETF 등은 `KRX:원문` — **KOSDAQ 전용 종목**은 시트에서 `KOSDAQ:티커` 등으로 수동 수정할 수 있습니다.
- **US**: 기본 **`NASDAQ:티커`**. **NYSE** 상장 종목은 시트에서 `NYSE:티커`로 바꾸세요.

## 탭 이름 (고정)

| 탭 | 내용 |
|----|------|
| `holdings_dashboard` | 원장 9열 + 시세·손익·목표가 괴리·**리포트 평균 목표가·기대수익** 수식 |
| `watchlist_dashboard` | 원장 9열 + 시세·거리·지연 상태 + **리포트 평균 목표가 보조** |
| `portfolio_summary` | **포트폴리오 전체 기대수익률(수동/리포트/블렌드 가중)**·상위 심볼·컨센서스 누락 등 |
| `committee_input_summary` | 투자위원회용 문장 (`summary_line` 열) |
| `ledger_change_queue` | 조일현 JSON 대기열 (DB 아님) |
| `research_price_targets` | **수동 전용** — 리포트 목표가 적재 (API 미동기화) |
| `portfolio_quote_candidates` (기본명) | **ticker 추천 전용** — `POST /api/portfolio/ticker-resolver/refresh`가 후보별 `GOOGLEFINANCE` 수식을 append·update 하고, 서버가 read-back으로 검증한다. **DB 자동 반영 없음** — 적용은 사용자가 API/UI에서 승인할 때만 한다. 탭명은 `PORTFOLIO_TICKER_CANDIDATES_SHEET_NAME`으로 바꿀 수 있다. |

동기화 API는 **앞 4개 탭만** 덮어씁니다. `ledger_change_queue`는 API로 **한 줄 append**만 합니다. `portfolio_quote_candidates`는 ticker-resolver API가 별도로 관리한다.

## 환경 변수 (Vercel)

- `GOOGLE_SERVICE_ACCOUNT_JSON` — 서비스 계정 JSON **전체**
- `GOOGLE_SHEETS_SPREADSHEET_ID` — 스프레드시트 **문서 ID만** 입력 (전체 URL 금지)

스프레드시트 **공유**에 해당 서비스 계정 이메일(`client_email`)을 **편집자**로 추가합니다.

### 탭 자동 생성 / 장애 대응

- `portfolio_quotes`, `portfolio_quote_candidates` 탭이 없으면 앱이 요청 시 자동 생성합니다.
- A1 range는 `'sheet_name'!A1` 형태로 escape하여 특수문자/공백 탭 이름에서도 안전하게 처리합니다.
- 그래도 실패하면 다음 순서로 점검하세요.
  - 서비스 계정 편집 권한(403)
  - `GOOGLE_SHEETS_SPREADSHEET_ID`가 문서 ID인지(404)
  - 탭/범위 생성 오류(`Unable to parse range`)

## API (로그인 세션 필요)

- `GET /api/integrations/google-sheets/preview` — DB 기준 그리드 JSON (시트 쓰기 없음)
- `POST /api/integrations/google-sheets/sync` — 위 4탭 덮어쓰기 (수식 포함)
- `POST /api/integrations/google-sheets/queue` — `jo_ledger_v1` → `ledger_change_queue` 한 줄

## Quote recovery flow

- `/portfolio`는 경고만 표시하지 않고 복구 패널에서 다음 단계 버튼을 안내합니다.
  1) 미설정 ticker 감지
  2) `ticker-resolver/refresh`로 후보 수식 생성
  3) `ticker-resolver/status`로 후보 검증
  4) 사용자 승인 시 `apply` 또는 `apply-bulk` 저장
  5) `quotes/refresh` 후 30~90초 뒤 `quotes/status` 재확인
- **검증 전 기본 추천 (`default_unverified`)**: `portfolio_quote_candidates`가 아직 `pending`이면 Sheets read-back으로 `ok` 후보가 없을 수 있습니다. 이 경우에도 사용자가 「검증 전 기본 추천 적용」을 누르면 규칙 기반 기본 `google_ticker`(예: KR 숫자 → `KRX:000660`)만 DB에 저장할 수 있습니다. **자동 저장 없음** · 잘못될 수 있으므로 `/portfolio` 시세 표에서 수정 가능 · 저장 후 반드시 `quotes/refresh`와 `quotes/status`로 검증하세요.
- `quotes/refresh`는 **`google_ticker`가 있는 보유 종목만** `portfolio_quotes`에 행을 씁니다. DB에 ticker가 없으면 `missing_row`/미동기가 지속됩니다.
- `apply-bulk`도 자동 저장이 아니라 **사용자 승인 버튼 클릭**이 있어야만 실행됩니다.
- FX는 `CURRENCY:USDKRW`를 기본으로 점검하며 상태 API에서 `rawPrice/parsedPrice/status`를 별도 반환합니다.

## 투자위원회

서버는 **`formatCommitteeInputSummaryForPrompt`**에 스프레드시트·GOOGLEFINANCE 안내와 원장 메타(원가 비중 등)를 함께 넣습니다. **실제 시가 비중·손익·리포트 기대수익은 시트 `portfolio_summary` / `holdings_dashboard`를 우선**하며, 숫자는 **지연·수동 입력 품질**에 의존하므로 위원회가 절대적 사실로 단정하지 않습니다.

## Gemini

기대수익률·목표가 **숫자 자체는 시트 수식·집계**로 두고, Gemini는 **해석·문장 보조**에만 쓰는 것을 권장합니다.
