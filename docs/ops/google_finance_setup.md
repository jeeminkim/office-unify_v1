# Google Finance / Sheets 설정

## 인증

- **권장:** `GOOGLE_SERVICE_ACCOUNT_JSON` + `GOOGLE_SHEETS_SPREADSHEET_ID`
- JWT scope: `https://www.googleapis.com/auth/spreadsheets` (read+write)
- 서비스 계정 이메일을 스프레드시트 **Editor**로 공유해야 Repair·sync write가 동작합니다.
- **API key만**으로는 비공개 스프레드시트 write가 어렵습니다.

## Read-only 점검

- `GET /api/system/google-finance-setup` — anchor·탭·repair **plan** 포함, **write 0**
- Yahoo fallback only ≠ Sheets OK

## Repair Assistant (confirmed write only)

- **Operational UX (2026-05-20):** the setup screen now explains why the safe repair button is disabled. Unsafe overwrite-only plans show a preservation-policy reason, while low-risk blank anchor/formula fills remain confirmable. CLI copy and manual sample copy stay available in disabled states.

- UI **「Sheets 자동 보강/복구」** 섹션은 항상 표시(write 불가 시 disabled).
- `repairPlan`은 GET 응답에 포함되며 Sheets를 수정하지 않습니다.
- `POST /api/system/google-finance-setup/repair/apply` — **`confirm: true`일 때만** write
- 기본 `overwrite: false` — 값이 있는 셀은 건드리지 않음
- 1차 대상 탭: `portfolio_quotes` (헤더 + 샘플 GOOGLEFINANCE 수식)
- **`append_missing_anchor_rows`**: 기존 행은 유지하고 SPY/QQQ/TSLA 등 누락 anchor만 아래에 append
- 제외: `research_*`, `holdings_dashboard`, log/cache 탭

## Anchor read-back vs row OK

- `portfolio_quotes` **parsed rows OK**와 **Sheets anchor OK**는 별도 지표입니다.
- simplified layout(`symbol`, `google_ticker`, `price`, …)을 anchor source로 인정합니다.
- rows OK > 0인데 anchor OK = 0이면 **anchor symbol 매칭 실패** — 정규화·누락 행 append를 확인하세요.

## 수동 fallback

- 화면의 「portfolio_quotes 샘플 표 복사」로 A1 붙여넣기 가능
- Repair write 불가·unsafe plan일 때 수동 적용 권장

## Anchor Recovery Flow

- GET 응답 `anchorRecovery`: 복구 상태·진단·다음 행동·단계(repair → 대기 → refresh → 재확인 → Today Brief).
- **anchorMatched**: 시트 행이 registry anchor와 매칭된 수. **anchorOk**: price/status read-back이 OK인 수.
- apply 후 `postCheck`: parsedRowsOk / anchorMatched / anchorOk / recommendedNextAction.
- UI: 버튼 클릭 즉시 피드백·중복 클릭 방지·적용 후 60초 권장 대기(자동 refresh 없음).

## Today Brief gating

- Sheets anchor OK와 Today Candidate US 노출은 별도입니다.
- `usCandidateDiagnostics.googleFinanceAnchorSummary`·`gatingReason`으로 degraded 사유 구분.
- read-back OK인데 Brief가 `sheets_anchor_zero`이면 refresh 후 Brief 재실행.

## 점검 순서

1. 안전 보강 적용(confirm) → 1분 대기  
2. 시세 새로고침 → 상태 다시 확인  
3. Sheets anchor OK 증가 확인 → Today Brief 재실행  
4. anchor 0/18이면 Action Item으로 설정 점검 저장  
## Direct repair CLI

The app can repair the private Google Sheet through the configured service account. API keys alone cannot write to a private Sheet; `GOOGLE_SERVICE_ACCOUNT_JSON` and `GOOGLE_SHEETS_SPREADSHEET_ID` or `GOOGLE_SPREADSHEET_ID` must point to a service account that has Editor access to the spreadsheet.

```bash
npm run google-finance-repair --workspace=apps/web -- --dry-run
npm run google-finance-repair --workspace=apps/web -- --confirm
npm run google-finance-repair --workspace=apps/web -- --confirm --wait
```

- Dry-run is the default and performs no write.
- Confirmed write is limited to the `portfolio_quotes` tab and uses `overwrite=false` by default.
- Existing non-empty cells are preserved; missing headers, anchor rows, and blank GOOGLEFINANCE formula cells are the repair target.
- The minimum US anchor universe includes SPY, QQQ, DIA, IWM, SMH, SOXX, XLK, XLF, XLE, XLI, XLY, AAPL, MSFT, NVDA, TSLA, and NFLX.
- After repair, check `/ops/google-finance-setup`, refresh quotes, rerun Today Brief, and inspect `qualityMeta.todayCandidates.usCandidateDiagnostics.gatingReason`.
- This flow is unrelated to automatic trading, automatic orders, or automatic rebalancing.
