# Google Sheets — 포트폴리오 운영 대시보드 (보조 계층)

## 역할

- **Supabase `web_portfolio_holdings` / `web_portfolio_watchlist`가 항상 기준 원장(Source of Truth)** 입니다.
- Google 스프레드시트는 **사람이 보기 쉬운 대시보드·요약·입력 대기열** 용도로만 쓰입니다.
- 시트에서 셀을 수정한다고 **DB가 자동 반영되지 않습니다.** 반영은 앱의 **원장 SQL validate/apply** 또는 조일현 → 동일 흐름을 거칩니다.

## GOOGLEFINANCE (준실시간)

- 동기화 시 **시세·환율·손익**은 서버가 숫자를 채우지 않고, **`GOOGLEFINANCE` 수식**을 `USER_ENTERED`로 주입합니다.
- **지연**: 최대 약 **20분** 지연·누락·`#N/A`가 날 수 있습니다. **초단타·실시간 트레이딩 엔진이 아닙니다.**
- **환율(원화 환산)**: `GOOGLEFINANCE("CURRENCY:USDKRW","price")` US 보유/관심 행에 사용합니다. KR 행은 `fx_rate_to_krw = 1`로 둡니다.

## exchange_ticker 규칙 (수식)

- **KR**: `KRX:` + 6자리 숫자 티커(앞자리 0). 숫자가 아닌 티커·ETF 등은 `KRX:원문` — **KOSDAQ 전용 종목**은 시트에서 `KOSDAQ:티커` 등으로 수동 수정할 수 있습니다.
- **US**: 기본 **`NASDAQ:티커`**. **NYSE** 상장 종목은 시트에서 `NYSE:티커`로 바꾸세요.

## 탭 이름 (고정)

| 탭 | 내용 |
|----|------|
| `holdings_dashboard` | 원장 9열 + `exchange_ticker`~`price_status` 수식 |
| `watchlist_dashboard` | 원장 9열 + 시세·거리·지연 상태 수식 |
| `portfolio_summary` | `holdings_dashboard` 열 `N`(시가총액 원화)·`O`(손익 원화) 등을 **SUM/QUERY**로 집계 |
| `committee_input_summary` | 투자위원회용 문장 (`summary_line` 열) |
| `ledger_change_queue` | 조일현 JSON 대기열 (DB 아님) |

동기화 API는 **앞 4개 탭만** 덮어씁니다. `ledger_change_queue`는 API로 **한 줄 append**만 합니다.

## 환경 변수 (Vercel)

- `GOOGLE_SERVICE_ACCOUNT_JSON` — 서비스 계정 JSON **전체**
- `GOOGLE_SHEETS_SPREADSHEET_ID` — 스프레드시트 ID

스프레드시트 **공유**에 해당 서비스 계정 이메일(`client_email`)을 **편집자**로 추가합니다.

## API (로그인 세션 필요)

- `GET /api/integrations/google-sheets/preview` — DB 기준 그리드 JSON (시트 쓰기 없음)
- `POST /api/integrations/google-sheets/sync` — 위 4탭 덮어쓰기 (수식 포함)
- `POST /api/integrations/google-sheets/queue` — `jo_ledger_v1` → `ledger_change_queue` 한 줄

## 투자위원회

서버는 **`formatCommitteeInputSummaryForPrompt`**에 스프레드시트·GOOGLEFINANCE 안내와 원장 메타(원가 비중 등)를 함께 넣습니다. **실제 시가 비중·손익은 시트 `portfolio_summary`를 우선**합니다.
