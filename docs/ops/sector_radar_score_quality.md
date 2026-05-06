# Sector Radar Score Quality & Explanation

## 목적

Sector Radar 점수는 **매수 추천이 아니라 섹터 관찰 신호**입니다. 표본 수·시세 커버리지가 낮을 때 높은 raw 점수가 과신되지 않도록 **보수 보정 점수(`adjustedScore`)**와 **해석 레이어(`scoreExplanation`)**를 두었습니다.

## rawScore vs adjustedScore

| 필드 | 의미 |
|------|------|
| `score`, `rawScore` | 기존 산식 그대로의 합산 점수(모멘텀·52주 위치·거래량·추세·품질 등). 하위 호환을 위해 `score` 유지. |
| `adjustedScore` | 표본 수 패널티 + 시세 성공률 패널티를 합산해 **클램프 0~100** 한 값. UI와 관심종목 큐의 섹터 점수는 보통 이 값을 우선 표시합니다. |

과열/위험 판단은 기존 `zone`(fear/greed/extreme_greed…)을 바꾸지 않고, 사용자 라벨 **`scoreExplanation.temperature`**(관망·중립·관심·과열·위험·NO_DATA)에서 보수적으로 안내합니다.

## 구성 요소(표준 섹터)

스코어링 내부 컴포넌트와 만점(카드 «점수 설명» 토글):

- 모멘텀: 최대 **25**
- 거래량: 최대 **30**
- 52주 위치(`drawdown` 필드명 유지): 최대 **15**
- 추세: 최대 **20**
- 품질(`risk`): 최대 **10**

코인(`crypto`)은 서브그룹 가중 스냅샷으로 별도 처리되며 breakdown은 null일 수 있습니다.

## 신뢰도(`SectorRadarConfidence`)

조건은 순차적으로 적용됩니다.

- **high:** 표본 ≥ 5, 시세 커버리지 ≥ 0.8, 시세 누락 ≤ 1
- **medium:** 표본 ≥ 4, 시세 커버리지 ≥ 0.6
- **low:** 표본 ≥ 3, 시세 커버리지 ≥ 0.4
- **very_low:** 표본 &lt; 3 **또는** 시세 커버리지 &lt; 0.4

## 패널티(adjustedScore에만 합산)

**표본 수**

- ≥ 5 → 0  
- 4 → -3  
- 3 → -5  
- 2 → -10  
- ≤ 1 → 데이터 라벨상 NO_DATA 처리 경향(품질 very_low)

**시세 성공률**

- ≥ 0.8 → 0  
- 0.6 ~ &lt; 0.8 → -5  
- 0.4 ~ &lt; 0.6 → -10  
- &lt; 0.4 → 동일 -10 + 신뢰도 very_low, 사용자 라벨 온도는 NO_DATA에 가깝게 표시

## 과열·위험 해석

- raw가 높고 52주 위치 점수가 높으면 사용자 라벨을 **과열**에 가깝게 올리고, 추격매수 주의·조정 대기 문구를 붙입니다.
- raw ≥ 85, 거래량 점수·52주 위치가 동시에 높으면 **`위험`** 온도로 분류할 수 있습니다.

## 운영 로그 (`web_ops_events`)

- **domain:** `sector_radar`
- **component:** `sector-radar-score-quality`
- **fingerprint:** `sector_radar:${userKey}:${sectorKey}:${code}`

**코드 상수** (`SECTOR_RADAR_SCORE_WARNING_CODES`)

- `sector_radar_score_low_confidence`
- `sector_radar_score_very_low_confidence`
- `sector_radar_score_quote_coverage_low`
- `sector_radar_score_sample_too_small`
- `sector_radar_score_overheated`
- `sector_radar_score_no_data`

정상 섹터 전체를 info로 찍지 않으며, 위 조건에 해당할 때만 warning 위주로 적재합니다. 로깅 실패는 API 응답에 영향 주지 않습니다.

## 수동 검증

1. `/sector-radar` 진입 후 카드 상단에 **신뢰도 한 줄 + 표본/시세 반영** 표시 확인  
2. **점수 설명** 토글로 raw/adjusted, 구성 요소 만점, 해석·리스크 확인  
3. 과열/위험 카드에서 추격매수 주의 문구 확인  
4. 시세가 거의 없는 섹터에서 NO_DATA·매우 낮은 신뢰도 확인  
5. `web_ops_events`에서 `sector_radar_score_*`가 과도하게 쌓이지 않는지(동일 fingerprint는 occurrence만 증가) 확인  

자세한 anchor 시트 운영은 [sector_radar_anchor_universe.md](./sector_radar_anchor_universe.md)를 참고합니다.

## 중복 로그 방지 / throttle 정책

- 전용 로거: `apps/web/lib/server/sectorRadarOpsLogger.ts`
- 공통 upsert 유틸: `apps/web/lib/server/upsertOpsEventByFingerprint.ts` (RPC 우선, 실패 시 fallback)
- 안정 fingerprint: `sector_radar:${userKey}:${normalizedSectorKey}:${code}`
- 동일 fingerprint는 신규 row를 만들지 않고 기존 row를 갱신(occurrence_count/last_seen_at/detail/message)
- warning 반복은 cooldown 적용
  - 기본: 30분 (`sector_radar_score_no_data`, `sector_radar_score_quote_coverage_low`, `sector_radar_score_very_low_confidence`, `sector_radar_score_sample_too_small`)
  - 관찰 경고(`sector_radar_score_overheated`): 24시간
- cooldown 윈도우 내 반복은 DB write를 건너뛰고(`skippedByThrottle`) 응답/화면 상태는 유지

## read-only summary 로깅 정책

- `GET /api/sector-radar/summary`는 기본적으로 read-only 경로로 간주한다.
- 이 경로에서는 `sector_radar_score_no_data`, `sector_radar_score_quote_coverage_low`, `sector_radar_score_very_low_confidence`를 qualityMeta/화면에는 유지하되 DB write는 기본 생략한다.
- `POST /api/sector-radar/refresh` 같은 명시적 새로고침 이후 점검 흐름에서만 write를 허용한다.
- `qualityMeta.sectorRadar.opsLogging`에는 `attempted/written/skippedReadOnly/skippedCooldown/skippedBudgetExceeded`를 기록한다.
- 목적은 이슈 은닉이 아니라, read-only 조회 반복으로 인한 Supabase write transaction 급증을 줄이는 것이다.

## qualityMeta vs web_ops_events 분리

- `qualityMeta.sectorRadar`: 현재 요청의 상태/경고 표시(사용자 UI)
- `web_ops_events`: 누적 운영 추적(최초/재발/cooldown/refresh/critical 중심)
- 따라서 summary 호출마다 DB write를 강제하지 않는다.

## 조선/LNG/소재 ticker 보정

- `동성화인텍(033500)`은 KOSDAQ 종목으로 `googleTicker=KOSDAQ:033500`, `quoteSymbol=033500.KQ`를 우선 사용한다.
- 그 외 KOSPI 종목/ETF(`009540`, `042660`, `010140`, `466920`)는 `KRX:*` + `.KS` 조합을 유지한다.

## status 재발 처리 정책

- `open` / `investigating` / `backlog`: occurrence 누적 + last_seen_at/detail 갱신
- `resolved`: 재발 시 `open`으로 reopen 후 occurrence 누적
- `ignored`: 기본적으로 `ignored` 유지(필요 시 last_seen_at만 갱신하거나 throttle skip)

## warning 유형 정책

- 데이터 품질 warning(`no_data`, `quote_coverage_low`, `very_low_confidence`, `sample_too_small`)
  - 운영 이슈(`isOperationalError=true`), dedupe+throttle 적용
- 정상 관찰 warning(`overheated`)
  - 오류 아님(`isObservationWarning=true`, `isOperationalError=false`)
  - UI에는 표시 가능, DB 적재는 긴 throttle(24h)로 제한

## detail 구조(요약)

`detail`에는 원인 추적을 위해 아래를 포함합니다.

- `sampleCount`, `quoteOkCount`, `quoteMissingCount`, `quoteCoverageRatio`
- `anchorSymbols[]`(symbol/googleTicker/quoteSymbol/role/quoteStatus)
- `missingSymbols[]`, `missingReasons[]`
- `suggestedAction`, `isOperationalError`, `isObservationWarning`

## Ops Events 상세 UI

- `domain=sector_radar`이고 `detail.feature=sector_radar_score_quality`이면 상세 영역에서 표 형태를 우선 렌더링합니다.
- 카드 본문에 `표본 n개 · 시세 성공 n개 · 누락 n개` 요약을 표시합니다.
- 상세에서 `anchorSymbols`는 `종목명/symbol/quoteSymbol/googleTicker/role/quoteStatus` 표로 확인할 수 있습니다.
- 원본 JSON은 제거하지 않고 `원본 JSON 보기` 접기 영역으로 유지합니다.

## rawScore vs adjustedScore 해석

- `rawScore`: 기존 산식 점수(호환 필드 `score`와 동일 기준)
- `adjustedScore`: 표본 수/시세 커버리지 penalty를 합산한 보수 점수
- 카드 기본 점수는 `adjustedScore`를 우선 사용하고, 상세에서 raw/adjusted를 함께 보여줍니다.
- 높은 점수는 **매수 신호가 아니라 최근 강한 움직임**일 수 있으며, 과열/위험에서는 추격매수 주의 문구를 강제합니다.

## 운영 SQL

```sql
select
  code,
  severity,
  status,
  occurrence_count,
  first_seen_at,
  last_seen_at,
  message,
  detail
from public.web_ops_events
where domain = 'sector_radar'
order by last_seen_at desc
limit 50;
```

```sql
select
  fingerprint,
  code,
  count(*) as row_count,
  sum(coalesce(occurrence_count, 1)) as occurrence_total,
  max(last_seen_at) as last_seen_at
from public.web_ops_events
where domain = 'sector_radar'
group by fingerprint, code
having count(*) > 1
order by row_count desc, last_seen_at desc;
```

같은 fingerprint가 여러 row로 나오면 dedupe 정책이 제대로 적용되지 않은 것입니다.

RPC/인덱스 확인:

```sql
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'web_ops_events'
  and indexdef ilike '%fingerprint%';
```
