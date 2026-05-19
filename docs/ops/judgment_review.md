# 30일 판단 품질 복기 (EVO-012)

## 목적

지난 30일 동안의 **판단 과정**을 모아 반복 실수·놓친 리스크·행동 개선 규칙을 복기합니다.

- 수익률 순위·종목 추천·자동매매가 **아닙니다**.
- 매수/매도 지시 문구를 생성하지 않습니다.

## 데이터 소스

| 소스 | 테이블/API |
|------|------------|
| Today Candidate | `today_candidate_impressions`, feedback |
| Action Items | `web_action_items` |
| Trade Journal | `trade_journal_entries` |
| Decision Retrospective | `web_decision_retrospectives` |
| Research | `research_report_runs`, `research_report_diffs` |
| Sector Radar | `sector_radar_runs` (선택) |
| Watchlist | `watchlist_recommendation_candidates` |
| Daily Review Notes | `web_daily_review_notes` (`generated_by`: deterministic / **pb** / user) |

신규 SQL 없음 — `web_decision_retrospectives`에 `source_type = monthly_judgment_review`로 저장.

## API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/judgment-review/monthly` | 읽기 전용 미리보기 (DB write 없음) |
| POST | `/api/judgment-review/monthly/save` | 사용자 명시 저장 → 복기 row |
| POST | `/api/judgment-review/monthly/action-items` | `confirm:true` 후 규칙 → Action Items |

## Metrics (additive)

- `dailyReviewNoteCount` / `savedDailyNoteCount` / `dismissedDailyNoteCount`
- `pbDailyNoteCount` — `generated_by = pb` 저장 건수
- `deterministicDailyNoteCount` — deterministic 저장 건수

## UI

- `/judgment-review` — 전체 리포트
- Dashboard — 요약 카드 + 「자세히 보기」

## SQL readiness

`/ops/sql-readiness` — 「30일 판단 품질 복기 prerequisites」 그룹. 테이블 missing 시 `status: partial` / `insufficient_data`.

## 한계

- 데이터가 적으면 `partial` / `insufficient_data`.
- 패턴 탐지는 휴리스틱(가능성·점검 필요 톤).
- 수익률과 직접 인과관계를 주장하지 않음.
