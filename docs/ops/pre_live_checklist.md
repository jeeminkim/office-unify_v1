# 실사용 전 수동 확인 체크리스트 (Pre-live)

배포·실사용 전에 아래를 순서에 맞게 확인합니다. 이 앱은 **관찰·복기·데이터 점검**용이며 **자동매매·자동 주문·자동 리밸런싱**은 없습니다.

## 1. SQL 적용 확인

- [ ] [`docs/sql/APPLY_ORDER.md`](../sql/APPLY_ORDER.md)의 순서와 사전 점검을 따랐는지 확인합니다.
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

## 3. Today Brief / Today Candidates

- [ ] 후보 점수가 “항상 60”처럼 보이지 않는지(희소 데이터는 45–55대 등 분산).
- [ ] 응답에 `scoreBreakdown`(additive)이 있는지, 기존 `score` 필드가 유지되는지.
- [ ] `028300`(HLB 예시) 등 **기업 이벤트 리스크** 레지스트리가 켜진 종목은 **50점 이하·리스크 점검 톤**으로 보이는지.
- [ ] 미국 데이터가 부족할 때 `qualityMeta.todayCandidates.usCoverage.status === 'degraded'` 및 UI 안내가 보이는지.
- [ ] 같은 종목이 반복 노출되면 `repeatExposurePenalty`가 점수·설명에 반영되는지(운영 스냅샷/이벤트에 따라 다름).

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