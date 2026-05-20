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
- [ ] `/daily-review` PB 초안 받기 → `POST /api/daily-review/notes/generate-pb` (DB write 0) → preview 표시 → confirm 후 `POST /notes` `generatedBy=pb`.
- [ ] PB 초안 실패 시 deterministic notes 유지 · 긴 응답 fallback · `/judgment-review` `pbDailyNoteCount`.
- [ ] SQL #23 적용 후: 「오늘 메모 저장」·중복 저장(`already_applied`)·Action Inbox dedupe·dismiss PATCH 동작.
- [ ] `/judgment-review`에 Daily Review Notes 데이터 소스·저장 건수 표시 · 테이블 없어도 preview 실패하지 않음.

## 2g. Long response fallback (EVO-026 · 2026-05-19)

- [ ] Research 리포트·PB 메시지·Trend markdown이 길 때 **핵심 요약 카드** 표시(원문은 복사·seed만, URL query 없음).
- [ ] Action Item 저장은 카드 **명시 버튼**만 — 카드 렌더만으로 POST 없음.
- [ ] **EVO-028** `/action-items`: `sourceLabel`(manual+`pb_response`/`trend_report`)·`sourceRefs`·`recommendedNextLinks` 표시 · 약한 detail은 「맥락 보강 필요」 배지 · `sourceRefs`는 추적용(자동 실행 아님).
- [ ] Trend: `finalizer.degraded`(provider) vs `longResponseFallback`(UI) 문구 구분.

## 2f. Personalization context layer (P1 · 2026-05-19)

- [ ] Committee round/closing · Persona chat · PB 메시지가 **매수/매도·자동 주문** 없이 동작(개인화 block은 확인·복기 관점).
- [ ] `GET /api/dashboard/today-brief` — `qualityMeta.todayCandidates.personalization` additive(점수 변화 없음).
- [ ] Research send-to-pb · PB weekly POST 응답에 `personalizationContextSummary`만(원문 daily note·계좌 정보 없음).
- [ ] `buildUserPersonalizationContext`는 read-only — GET today-brief·committee round에서 DB write 증가 없음.

## 2e. Command Center + Risk Review actions (P0 · 2026-05-19)

- [ ] 홈 최상단 **오늘의 운영 관제** strip: 데이터 blocker(SQL/Google Finance) 또는 오늘 우선 3건 표시.
- [ ] 리스크 점검 카드: **공시 확인** 링크(Research seed) · **외부 확인** Action Item 저장(명시 버튼만).
- [ ] 위원회 partial regenerate 미리보기: `actionHints` CTA(교체·복사·저장·Research 등).
- [ ] 위원회 로드맵: **Action Item으로 저장** 우선 · 「화면에서만 완료 표시」는 새로고침 시 사라짐.

## 2h. Dashboard Command Center Refactor (EVO-027 · 2026-05-20)

- [ ] Button Action Contract badges/hints distinguish navigation, read-only checks, confirmed writes, Action Inbox saves, note saves, feedback updates, local-only UI state, and external manual checks.
- [ ] Persona Coach hints render deterministic guidance on Command Center, Google Finance setup, risk review, Action Items, Daily/Judgment review, and Committee surfaces without saving data by themselves.
- [ ] `mark_reviewed` risk candidates move out of the main deck into reviewed-risk/monitoring copy; `hide_7d` suppresses as user-hidden; `keep_observing` remains visible with repeat-exposure diagnostics.

- [ ] `/` 상단 `CommandCenterSection`이 data blocker 1개와 오늘 확인할 운영 작업 최대 3개를 보여준다.
- [ ] `DataReadinessSection` 문구가 “데이터 상태 문제입니다. 투자 판단이 아닙니다.” 관점으로 표시된다.
- [ ] `ActionItemsSummarySection`은 open/in_progress top 3만 표시하고, 완료 처리는 `/action-items`에서만 가능하다.
- [ ] `qualityMeta.todayCandidates.personalization` 요약은 count만 표시하고 raw note/민감 정보/계좌 원문은 노출하지 않는다.
- [ ] `WatchlistRecommendationSection`은 render만으로 write하지 않고, 관심종목 후보 approve/reject는 명시 버튼 클릭에서만 기존 API를 호출한다.
- [ ] 관심종목 등록 후보는 승인 전 `web_portfolio_watchlist`에 등록되지 않으며, empty state가 표시된다.
- [ ] Dashboard 분리 후에도 Today Brief, 후보 덱, watchlist 추천, 투자자 프로필, PB weekly, Judgment Review, Sector Radar 카드가 사라지지 않는다.
- [ ] 자동매매·자동주문·자동 리밸런싱 기능이나 매수/매도 지시 표현이 추가되지 않았다.

## 2c. Today Candidate feedback (EVO-011)

- [ ] `append_today_candidate_feedback.sql` 적용 · `/ops/sql-readiness`에서 `today_candidate_feedback` ready.
- [ ] HLB 등 리스크 점검 카드에서 「리스크 점검 완료」「7일간 낮은 우선순위」「계속 관찰」— **confirm 전** 네트워크 POST 없음.
- [ ] confirm 후 feedback 저장 · Today Brief 재조회 시 `userFeedbackState`·`feedbackSummary` 반영.
- [ ] hide_7d 후 다음 브리핑에서 우선순위 하향 또는 suppressed `user_hidden_7d`.
- [ ] keep_observing 후에도 반복 노출 진단(`exposureDiagnostics`) 유지.

## 3. Today Brief / Today Candidates

- [ ] `todayBriefRouteRequest` helper는 request/query parsing만 수행하고 DB 접근·ops write를 하지 않는다.
- [ ] `todayBriefResponseService`는 아직 skeleton이며, `buildTodayBriefResponse` 전체 연결은 다음 라운드 전 contract 테스트 통과 후 진행한다.
- [ ] Today Brief contract regression: top-level fields, `candidates`, `primaryCandidateDeck`, `qualityMeta.todayCandidates.personalization`, US diagnostics, feedback, concentration, theme connection key가 유지된다.
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
- [ ] `/ops/google-finance-setup` 1순위 탭 `portfolio_quotes` vs 보조 탭(US_Anchor·시세·Quotes) 구분 · 탭별 found/missing 표시.
- [ ] `portfolio_quotes 샘플 표 복사` → Sheets A1 붙여넣기 · prefix 수식(NYSEARCA/NASDAQ) · Fallback only ≠ OK.
- [ ] Repair UI 항상 표시 · GET write 0 · 「안전 보강 적용」 confirm 후만 · append_missing_anchor_rows.
- [ ] `anchorOk > 0`이면 Google Finance 복구 완료 상태로 보이고, 「안전 보강 적용」이 primary CTA로 보이지 않으며 Today Brief/US gating/시세 새로고침 CTA가 보이는지.
- [ ] Anchor Recovery 단계·버튼 피드백·중복 클릭 방지 · apply 후 postCheck·60초 대기 안내.
- [ ] parsed rows OK vs Sheets anchor OK 분리 표시 · mismatch 시 anchor 매칭 점검.
- [ ] 행동 순서: 샘플 표 또는 Repair apply → price 확인 → 시세 새로고침 → 상태 확인 → Today Brief · API는 접기 영역.
- [ ] 외부 보유 import·금융 로그인 UI **추가되지 않음**.

### 3c-1. Google Finance direct repair CLI

- [ ] Dry-run: `npm run google-finance-repair --workspace=apps/web -- --dry-run` reports the plan and performs write 0.
- [ ] Confirmed path is used only intentionally: `npm run google-finance-repair --workspace=apps/web -- --confirm --wait`.
- [ ] `portfolio_quotes` repair preserves non-empty cells, appends missing US anchors, and shows formula pending vs anchor OK separately.
- [ ] API key only is not treated as Sheet write capable; service account JSON + spreadsheet Editor access are required.

## 3b. US data setup · Action Step Runner · Long response fallback

- [ ] Dashboard 「미국 시장 데이터 점검」: anchor `0/18` 시 setupDiagnosis·설정 점검 접이식·복사·Action Item 저장(클릭 시만).
- [ ] PB 주간 점검 2000자 초과: 「응답이 길어 핵심만 표시」카드 · 요약/전문 복사 · 위원회/PB 이어가기(URL에 긴 원문 없음, sessionStorage).
- [ ] `/persona-chat` · `/committee-discussion`: `Message exceeds 2000 characters.`만 단독 노출되지 않음.
- [ ] `/committee-discussion`: partial 발언에 「이 발언 다시 생성」·미리보기·「이 발언으로 교체」(DB 자동 저장 없음).
- [ ] `/committee-discussion`: closing 후 「토론 후 내가 할 수 있는 일」·fallback 작업·Action Item 저장(detail_json).
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
