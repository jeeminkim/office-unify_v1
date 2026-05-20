# Office Unify

Office Unify는 개인 투자 운영을 위한 Next.js 기반 콘솔입니다. 목표는 종목 추천 엔진을 만드는 것이 아니라, 포트폴리오 상태, Today Brief, 리서치, PB 대화, Action Items, Watchlist, 판단 복기를 한 화면 흐름 안에서 연결해 “오늘 무엇을 확인해야 하는지”를 분명하게 만드는 것입니다.

## Product Principles

- 자동매매, 자동주문, 자동 리밸런싱을 하지 않습니다.
- 매수/매도 지시가 아니라 관찰, 확인, 복기, 데이터 점검을 돕습니다.
- 기존 API 필드는 가능한 유지하고 변경은 additive로 진행합니다.
- GET/read-only 경로는 write를 하지 않는 것을 원칙으로 합니다.
- SQL은 명시 문서에 따라 수동 적용하며 앱이 자동 적용하지 않습니다.
- AI 출력은 원문 노출보다 검증 가능한 구조, fallback, Action Item 연결을 우선합니다.

## Current Focus

### Personal Investment OS

`apps/web`의 홈 Dashboard는 “링크 모음”이 아니라 투자 운영 관제탑을 지향합니다.

- `CommandCenterSection`: 데이터 blocker 1개와 오늘 확인할 운영 작업 최대 3개
- `TodayBriefSection`: 오늘의 3줄 브리핑과 낮은 신뢰도 후보 토글
- `TodayCandidatesSection`: 관찰 후보 덱 wrapper
- `DataReadinessSection`: SQL, Google Finance, quote, ops 상태를 투자 판단과 분리
- `ActionItemsSummarySection`: open Action Item top 3와 source link
- `JudgmentReviewSummarySection`: 30일 판단 품질 복기 preview
- `WatchlistRecommendationSection`: 승인 대기 중인 관심종목 후보 관리

Watchlist 추천 후보는 승인 전 `web_portfolio_watchlist`에 등록되지 않습니다. approve/reject는 명시 버튼으로만 실행되며, Research/Watchlist 링크 이동은 write가 아닙니다.

### Action Item Hub

Action Item은 `sourceRefs`, `sourceSummary`, `checklist`, `doNotDo`, `recommendedNextLinks`, `actionSteps`를 중심으로 PB, Research, Committee, Trend, Watchlist 흐름을 이어주는 중앙 작업 큐입니다. 홈에서는 요약만 보여주고 완료 처리는 `/action-items`에서 합니다.

### Research / PB / Persona

Research Center, Private Banker, Persona Chat은 긴 응답 fallback, 구조화 출력, 후속 작업 seed를 사용합니다. 투자 판단을 자동 실행하지 않고, 확인할 질문과 근거를 남기는 데 초점을 둡니다.

## Monorepo Structure

- `apps/web`: Next.js App Router 웹앱
- `packages/ai-office-engine`: AI orchestration, prompt, report generation
- `packages/supabase-access`: Supabase repository/access helpers
- `packages/shared-types`: shared DTO and contract types
- `packages/shared-utils`: shared utility code
- `docs`: architecture, SQL, ops, changelog, product evolution docs

## Local Setup

### Requirements

- Node.js 20+
- npm workspaces

### Install

```bash
npm install
```

### Environment

Create `apps/web/.env.local` with the values needed for your environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=
```

Do not expose service keys or model API keys with `NEXT_PUBLIC_`.

### Run

```bash
npm run dev
```

Default local URL: `http://localhost:3000`

## Validation Commands

Run from the repository root:

```bash
npm run lint --workspace=apps/web
npm run typecheck --workspace=apps/web
npm run test --workspace=apps/web -- --run
npm run build --workspace=apps/web
npm run pre-live-smoke --workspace=apps/web
```

`pre-live-smoke` runs in dry-run mode by default and does not call live HTTP endpoints. For live smoke, provide an origin and session cookie as described by the script output.

## Architecture Notes

### Thin Route Direction

API route files should stay close to request/response orchestration. Reusable parsing, normalization, idempotency preparation, policy, and business logic should live under `apps/web/lib/server/*` or package-level modules.

Recent examples:

- `personaChatRouteRequest`: shared request preparation for `/api/persona-chat/message` and `/api/persona-chat/message/stream`
- `researchCenterGenerateRequest`: input parsing and desk normalization for `/api/research-center/generate`
- dashboard sections under `apps/web/app/components/dashboard/*`

### Domain Boundaries

- `/api/portfolio/watchlist/*`: portfolio/watchlist management and portfolio-adjacent write flows
- `/api/watchlist/recommendations/*`: recommendation candidate lifecycle
- `/research-center`: report generation and follow-up research
- `/private-banker`: PB-style advisory conversation, no automatic portfolio modification
- `/persona-chat`: persona discussion and structured output

When adding a feature, prefer an existing domain boundary over creating a parallel route tree.

## SQL and Data

SQL files live in `docs/sql`. Apply them manually in the documented order. Use:

- `docs/sql/APPLY_ORDER.md`
- `docs/CURRENT_SYSTEM_BASELINE.md`
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/ops/pre_live_checklist.md`

Missing optional SQL should degrade gracefully where possible and show action hints instead of silently failing.

## Documentation Map

- `docs/CHANGELOG.md`: shipped and uncommitted changes
- `docs/CURRENT_SYSTEM_BASELINE.md`: current operating baseline
- `docs/SYSTEM_ARCHITECTURE.md`: architecture and API map
- `docs/evolution/ROADMAP_BACKLOG.md`: product evolution backlog
- `docs/ops/personal_investment_os_audit.md`: Personal Investment OS audit and refactor notes
- `docs/ops/pre_live_checklist.md`: pre-live validation checklist
- `apps/web/README.md`: web app details

## Maintenance Rules

- Keep route files thin.
- Split very large client components by render section before moving business logic.
- Add smoke/contract tests for every extracted helper when behavior matters.
- Do not commit generated or unrelated changes without an explicit request.
- Preserve user/worktree changes you did not make.
