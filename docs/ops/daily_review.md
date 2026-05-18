# Daily Operations Review

## 목적

매일 콘솔에서 나온 **후보·억제·미국 데이터·Action Items·운영 로그**와 **보유/관심종목 점검 메모**를 사용자가 확인·기록하는 화면입니다. raw ops 로그만 보여주지 않습니다.

## 경로

- UI: `/daily-review`
- API:
  - `GET /api/daily-review` — read-only 요약 + deterministic preview notes (write 0)
  - `GET /api/daily-review/notes` — 저장된 메모 조회 (read-only)
  - `POST /api/daily-review/notes` — **명시 저장만**
  - `PATCH /api/daily-review/notes/[id]` — dismissed/archived

## 저장 정책 (EVO-015 · 1차 shipped)

- **자동 저장 없음** — GET `/api/daily-review`·`/notes` 시 DB write 0
- deterministic 점검 메모는 `previewNotes`로만 표시 (**shipped**)
- 사용자가 「오늘 메모 저장」 클릭 시에만 `POST /notes` (저장 중 UI·중복 클릭 방지)
- idempotency: 서버 키 + DB unique index → `already_applied`
- dismissed: confirm + 선택 사유 · 매매/관심종목에 영향 없음
- **PB 일일 메모(LLM):** EVO-015-2 후속 · UI `disabled_todo`

## SQL

- `docs/sql/append_daily_review_notes.sql` — APPLY_ORDER §8 #23
- 미적용 시: preview 가능 · 저장 `table_missing` + actionHint

## Action Items / 30일 복기

- Action Item 저장 시 `buildDailyReviewNoteActionItemDetail`로 checklist·doNotDo 반영
- 30일 판단 품질 복기: `dataCoverage.dailyReviewNotes`, `metrics.dailyReviewNoteCount`

## 금지

- 매수/매도 지시 · 자동매매 · 자동 주문 · 자동 리밸런싱
- 금액/계좌/민감 메모 원문 저장
