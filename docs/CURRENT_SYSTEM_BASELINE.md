# Current System Baseline

## 핵심 원칙

- 자동 매매/자동 주문/원장 자동 반영 없음
- Supabase 원장이 기준(Source of Truth)
- Google Sheets는 read-back/운영 보조 계층
- LLM 결과는 판단 보조이며 확정 수익률을 보장하지 않음
- `qualityMeta`(화면 상태)와 `web_ops_events`(운영 누적) 역할 분리

## 주요 화면

- `/`
- `/portfolio`
- `/portfolio-ledger`
- `/sector-radar`
- `/trend`
- `/research-center`
- `/committee-discussion`
- `/trade-journal`
- `/ops-events`

## 현재 핵심 기능

- Today Candidates
  - `today-brief` optional `candidates`(`userContext`/`usMarketKr`)
  - `isBuyRecommendation=false`, 관찰 우선순위 중심 UX
  - `dataQuality.summary/reasonItems/primaryRisk`(additive)
  - add-candidate + best-effort postprocess
- Sector Radar
  - `rawScore`/`adjustedScore`/`scoreExplanation`
  - ETF `theme eligibility` 우선 게이트(strict/adjacent/exclude/unknown)
  - ETF 표시 그룹 `scored`/`watch_only`/`excluded`
  - AI/전력 인프라와 조선 테마 분리(조선 ETF hard exclude)
  - 미디어/콘텐츠 ETF universe 확장(웹툰/드라마/K콘텐츠/K-POP/K컬처)
  - ETF quote alias/resolver 기반(`quoteAlias`)으로 특수 코드 대응 준비
  - quote key 우선순위: `seed.googleTicker`(운영 확정 override) → alias → fallback
  - quote 품질 상태 분리(`missing`/`stale`/`invalid`/`unknown`) + 점수 반영 제한
  - gate mode(`off`/`diagnostic_only`/`enforced`)로 단계적 확장
  - quote empty ETF 점수 산정 제한 + `qualityMeta` 경고 코드
  - `qualityMeta.sectorRadar.etfQualityDiagnostics`로 운영 진단(additive)
  - `qualityMeta.sectorRadar`와 운영 상태 분리
  - read-only summary 경로 write 제한
- Trend
  - OpenAI research layer + Gemini finalizer
  - finalizer timeout/retry/fallback
  - degraded structured memory 시 signal upsert skip
- Ops
  - `web_ops_events` fingerprint upsert RPC 우선
  - `opsLogBudget` 기반 write budget/cooldown/read-only 억제
  - read-only 요약 경로: 개별 warning write 억제, 심각 저하는 **화이트리스트 eventCode + isCritical + cooldown/budget/fingerprint**로 aggregate/US no_data만 제한 기록
  - `qualityMeta`는 화면 상태, `web_ops_events`는 제한적 운영 누적
- Portfolio Quote Recovery
  - quotes/ticker/sector-radar 각각 전용 refresh API
  - read-back 지연/빈값을 NO_DATA 경고로 표시

## SQL 미적용 시 degrade 정책

- SQL이 미적용이어도 가능한 경로는 본문/핵심 응답을 유지한다.
- 미적용 영향은 warnings/qualityMeta/ops에 표시한다.
- RPC/테이블 부재는 기능 전체 중단보다 best-effort degrade를 우선한다.

## 운영 확인 순서

1. `/system-status`
2. `/ops-events`
3. Google Sheets status (`/api/portfolio/quotes/status`, ticker/sector status)
4. Sector Radar status (`/api/sector-radar/status`)
5. Today Candidates ops summary (`/api/dashboard/today-candidates/ops-summary`)
