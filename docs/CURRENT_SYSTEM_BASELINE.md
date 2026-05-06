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
  - `qualityMeta.sectorRadar`와 운영 상태 분리
  - read-only summary 경로 write 제한
- Trend
  - OpenAI research layer + Gemini finalizer
  - finalizer timeout/retry/fallback
  - degraded structured memory 시 signal upsert skip
- Ops
  - `web_ops_events` fingerprint upsert RPC 우선
  - `opsLogBudget` 기반 write budget/cooldown/read-only 억제
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
