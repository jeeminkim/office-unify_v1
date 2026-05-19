# 실사용 전 수동 확인 체크리스트 (Pre-live)

배포·실사용 전에 아래를 순서에 맞게 확인합니다. 이 앱은 **관찰·복기·데이터 점검**용이며 **자동매매·자동 주문·자동 리밸런싱**은 없습니다.

## 1. SQL 적용 확인

- [ ] [`docs/sql/APPLY_ORDER.md`](../sql/APPLY_ORDER.md)의 순서와 사전 점검을 따랐는지 확인합니다.
- [ ] 웹 **`/ops/sql-readiness`**(또는 `GET /api/system/sql-readiness`)에서 §8(17–20)·`web_ops_events`/RPC·core 항목이 **ready** 또는 의도한 **optional** 인지 확인합니다(SQL 자동 적용 없음, read-only 점검).
- [ ] 보유 종목 테이블(`web_portfolio_watchlist` 등)이 기대 스키마인지 확인합니다.
- [ ] 홀딩 API에서 `portfolio_holdings_table_missing` 또는 스키마 불일치 `actionHint`가 나오지 않는지 확인합니다.

## 2. pre-live-smoke

```bash
npm run pre-live-smoke --workspace=apps/web
```

- **dry-run**: HTTP 없이 안내만 출력됩니다.
- **라이브**: `PRE_LIVE_LIVE=1`, `PRE_LIVE_SMOKE_ORIGIN`, `PRE_LIVE_SMOKE_COOKIE` 설정 후 실행합니다.
- **PASS**: 실사용 전 기본 데이터 연결이 정상에 가깝습니다.
- **WARN**: 일부만 충족 — 앱은 degraded로 동작할 수 있으나 항목별 안내를 확인합니다.
- **FAIL**: 조치 필요 — 출력된 `actionHint`와 `docs/sql/APPLY_ORDER.md`를 우선 확인합니다.

## 2b. read-only GET (ops/DB write 없음)

- [ ] `GET /api/system/sql-readiness` · `GET /api/research-center/reports/diff` · `GET /api/watchlist/recommendations` · `GET /api/daily-review` · `GET /api/daily-review/notes` · `GET /api/judgment-review/monthly` 호출 시 **DB insert/update·ops upsert 없음**(단위 테스트 `readOnlyRouteAudit.test.ts`).
- [ ] 예외: `GET /api/dashboard/today-candidates/ops-summary`는 조회 실패 시에만 fingerprint upsert(문서화됨). `GET /api/sector-radar/summary`는 Supabase 미설정·예외 시에만 `logOpsEvent`.

## 2d. Daily Review Notes (EVO-015 · SQL #23)

- [ ] `append_daily_review_notes.sql` 미적용 시 `/daily-review` preview는 보이나 저장 시 `table_missing` + `/ops/sql-readiness` #23 안내.
- [ ] SQL #23 적용 후: 「오늘 메모 저장」·중복 저장(`already_applied`)·Action Inbox dedupe·dismiss PATCH 동작.
- [ ] `/judgment-review`에 Daily Review Notes 데이터 소스·저장 건수 표시 · 테이블 없어도 preview 실패하지 않음.

## 2c. Today Candidate feedback (EVO-011)

- [ ] `append_today_candidate_feedback.sql` 적용 · `/ops/sql-readiness`에서 `today_candidate_feedback` ready.
- [ ] HLB 등 리스크 점검 카드에서 「리스크 점검 완료」「7일간 낮은 우선순위」「계속 관찰」— **confirm 전** 네트워크 POST 없음.
- [ ] confirm 후 feedback 저장 · Today Brief 재조회 시 `userFeedbackState`·`feedbackSummary` 반영.
- [ ] hide_7d 후 다음 브리핑에서 우선순위 하향 또는 suppressed `user_hidden_7d`.
- [ ] keep_observing 후에도 반복 노출 진단(`exposureDiagnostics`) 유지.

## 3. Today Brief / Today Candidates

- [ ] `docs/sql/APPLY_ORDER.md` §8(17–20) 적용 후 impression·sector snapshot·research history·recommendation 테이블 존재 확인.
- [ ] Dashboard 「미국 후보 진단」「7일 노출 진단」「관심종목 등록 후보」접이식 섹션 동작(승인 전 watchlist 미등록).
- [ ] Sector Radar 「최근 스냅샷」read-only 조회(run/items).
- [ ] Research Center: 기존 리포트 재사용·forceRefresh·7일+ diff 표시.
- [ ] `npm run build --workspace=apps/web` · `npm run pre-live-smoke --workspace=apps/web` (dry-run 최소) 통과.
- [ ] **EVO-012** `/judgment-review` · `GET /api/judgment-review/monthly` read-only(저장 0) · 명시 POST save/action-items · Dashboard 30일 카드 · 매수/자동주문 문구 없음 (`docs/ops/judgment_review.md`).
- [ ] 후보 점수가 “항상 60”처럼 보이지 않는지(희소 데이터는 45–55대 등 분산).
- [ ] 응답에 `scoreBreakdown`(additive)이 있는지, 기존 `score` 필드가 유지되는지.
- [ ] `028300`(HLB 예시) 등 **기업 이벤트 리스크** 레지스트리가 켜진 종목은 **50점 이하·리스크 점검 톤**으로 보이는지.
- [ ] 미국 데이터가 부족할 때 `qualityMeta.todayCandidates.usCoverage.status === 'degraded'` 및 UI 안내가 보이는지.
- [ ] 같은 종목이 반복 노출되면 `repeatExposurePenalty`가 점수·설명에 반영되는지(운영 스냅샷/이벤트에 따라 다름).
- [ ] 후보 카드에 **후보 선정 근거**(왜 올라왔나요·부족 데이터·다음 확인)·**판단 품질** 문구가 보이고 매수 추천 톤이 없는지.
- [ ] `Trade Journal`로 「관찰 메모로 남기기」 링크 시 시드 배너가 뜨고 저장 노트에 접두가 붙는지.

## 3c. Navigation IA · Watchlist · Google Finance Setup

- [ ] 데스크톱 상단 nav 트리(투자 운영·포트폴리오·리서치·판단/복기·운영/설정) · 모바일 5탭+More 트리.
- [ ] `/portfolio` 「보유 현황」·`/portfolio-ledger` 「보유/거래 원장」 역할 설명 배너.
- [ ] `/watchlist` 섹터 미리보기(DB write 0)·ready_to_apply 적용(confirm)·already_matched 기본 적용 제외.
- [ ] `/watchlist` google_ticker/quote_symbol 필터·no_match Action Item.
- [ ] `/ops/google-finance-setup` Sheets read-back OK vs Fallback only 구분 · anchor 0 시 gating 문구.
- [ ] `/ops/google-finance-setup` sample formula 복사(SPY/QQQ/TSLA 등) · Action Item에 readback summary · `GET /api/system/google-finance-setup` read-only.
- [ ] 외부 보유 import·금융 로그인 UI **추가되지 않음**.

## 3b. US data setup · Action Step Runner · Long response fallback

- [ ] Dashboard 「미국 시장 데이터 점검」: anchor `0/18` 시 setupDiagnosis·설정 점검 접이식·복사·Action Item 저장(클릭 시만).
- [ ] PB 주간 점검 2000자 초과: 「응답이 길어 핵심만 표시」카드 · 요약/전문 복사 · 위원회/PB 이어가기(URL에 긴 원문 없음, sessionStorage).
- [ ] `/persona-chat` · `/committee-discussion`: `Message exceeds 2000 characters.`만 단독 노출되지 않음.
- [ ] HLB 리스크 카드: 개별 step Action Inbox 저장 · `/action-items`에서 step별 Research/PB/위원회 · **완료** 시 PATCH만 write.
- [ ] 매수 추천·자동 주문 문구 없음.

## 3a. Persona chat · NDJSON · 구조화 응답

- [ ] `/persona-chat` 스트림 완료(`done`)의 **`body.personaStructuredOutputSummary`**(또는 root **`structuredOutputSummary`**)가 존재하는지.
- [ ] 파싱 실패 시 **`parseFailed` / `personaStructuredParseFailed`** 및 확인·점검 톤 안내가 보이는지(중간 delta는 원문일 수 있음).
- [ ] 금지 표현(예: 자동 주문·자동 리밸런싱·지금 사라)이 **최종 저장 메시지**에 남지 않는지.

## 4. 한화오션 name-only resolve

- [ ] 원장 또는 관심 추가 흐름에서 **종목명만** 입력했을 때 resolve 후보에 `042660` 등이 뜨는지.
- [ ] `googleTicker` / `quoteSymbol`이 UI에 보이는지.
- [ ] ticker resolver에서 **ok** 상태 후보만 「적용」 가능한지.

## 5. Ticker timeout / partial

- [ ] `pending`이 제한 시간 이후 **timeout** 등으로 끝나고, 화면에 오래 남지 않는지.
- [ ] **timeout / failed** 행은 「적용」이 비활성화되는지.
- [ ] **partial**일 때 **ok** 행만 적용 가능한지.

## 6. Sector Radar — preview / apply

- [ ] **미리보기**는 DB write가 없음(응답 `previewReadOnly` 등).
- [ ] 미리보기 실패 시 **`actionHint`**로 안내되는지.
- [ ] **적용**에서만 원장 섹터 라벨이 갱신되는지.

## 7. 보유 incomplete / active

- [ ] incomplete 보유는 **평가금액·수익률·집중도** 집계에서 제외되는지.
- [ ] 수량·평단을 채워 active로 전환한 뒤 집계에 포함되는지.

## 8. 모바일

- [ ] 원장 **ticker 후보 카드**에서 googleTicker·quote·상태·버튼이 잘리지 않는지.
- [ ] `requestId`가 레이아웃을 깨지 않는지(축약·복사).
- [ ] Trade Journal 위저드에서 입력·버튼이 쓰기 괜찮은지.

## 9. 배포 전 금지·톤 확인

- [ ] 자동매매·자동 주문·자동 리밸런싱을 약속하는 문구가 없는지.
- [ ] “매수 추천”으로 오해될 수 있는 표현이 없는지 — **관찰·복기·데이터 상태** 톤 유지.

---

관련: [`docs/ops/today_candidates.md`](today_candidates.md), [`docs/sql/APPLY_ORDER.md`](../sql/APPLY_ORDER.md).