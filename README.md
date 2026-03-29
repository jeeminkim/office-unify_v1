# ai_office

Discord + Node.js + TypeScript + Supabase based investment office bot.

## Run

1. Set environment variables in `.env`
2. Install dependencies
3. Build and run

```bash
npm install
npm run build
npm start
```

## PM2

```bash
pm2 start dist/index.js --name ai-office --interpreter node
pm2 logs ai-office
pm2 restart ai-office
pm2 stop ai-office
```

- **`pm2 stop ai-office`**: 프로세스를 멈춤(목록에는 남음). 다시 띄우려면 `pm2 start ai-office`.
- **`pm2 delete ai-office`**: PM2 목록에서 완전히 제거(필요할 때만).

### Node가 종료되지 않을 때 (Windows)

1. 먼저 **PM2**를 쓰는 경우: `pm2 stop ai-office` 후 `pm2 list`로 상태 확인.
2. 터미널에서 직접 띄운 경우: 해당 창에서 **`Ctrl+C`**.
3. 그래도 남아 있으면 PID 확인 후 **가능하면 정상 종료부터**:
   ```powershell
   Get-Process -Name node -ErrorAction SilentlyContinue
   taskkill /PID <PID>
   ```
4. 응답 없을 때만 **강제 종료** (마지막 수단):
   ```powershell
   taskkill /PID <PID> /F
   ```

## Supabase Schema Apply

1. Open Supabase SQL editor
2. Run `schema.sql`
3. Verify tables: `stocks`, `portfolio`, `expenses`, `cashflow`, `user_settings`, `chat_history`

## Operational Stability Patch Runbook

Apply the additional SQL for usage tracking and feedback integrity before running the latest runtime.

```sql
-- OpenAI usage tracking + trace extension
-- file: openai_budget_migration.sql

-- Feedback integrity (unique + mapping metadata)
-- file: feedback_integrity_migration.sql
```

Build and run:

```bash
npm run build
npm start
```

## Self-check Commands

Run these checks after deploy/restart:

```bash
# Operational schema type contract (chat_history.id = number)
npm run check:schema-contract

# Phase 1 layer exports (interaction / application / contracts / repositories smoke)
npm run check:phase1-structure

# Runtime E2E smoke against real Supabase (requires PHASE1_TEST_DISCORD_USER_ID or TEST_DISCORD_USER_ID)
npm run check:runtime-e2e

# Phase 2 decision engine (committee vote + risk veto + idempotency; apply docs/sql/append_phase2_decision_tables.sql then append_phase2_decision_tables_hardening.sql for full persistence)
npm run check:decision-engine

# OpenAI mixed provider + budget/fallback + claim pipeline
node dist/openai_phase1_self_check.js

# Discord response safety (chunking/route/degraded message)
node dist/discord_response_self_check.js

# UI/UX feedback flow stability (duplicate/idempotent/mapping fallback)
node dist/uiux_stability_self_check.js

# Quote error classification and breakdown aggregation checks
node dist/quote_logging_self_check.js

# Logger category sink + KST daily file routing checks
node dist/logging_self_check.js
```

Quick log checks:

```bash
# PM2 runtime
pm2 logs ai-office

# Category file logs (KST daily files)
# logs/openai/openai.log_YYYYMMDD
# logs/quote/quote.log_YYYYMMDD
# logs/interaction/interaction.log_YYYYMMDD
```

## Notes

- Portfolio identity key is `discord_user_id`
- Mode setting is persisted in `user_settings`
- Main panel state file is `state/discord-panel.json`

## Feedback buttons (Discord)

- **customId 형식**: `feedback:save:{chatHistoryId}:{analysisType}:{feedbackType}:{personaKey}`  
  (`TRUSTED` | `ADOPTED` | `BOOKMARKED` | `DISLIKED` 등 — `analysisTypes.ts`의 `FeedbackType`과 정합)
- **`analysis_type` 소스**: `analysisType`은 **버튼 customId 파싱값만** 사용한다. `chat_history.debate_type` 컬럼은 조회·저장 신뢰에 사용하지 않는다(운영 DB에 없을 수 있음).
- **처리 흐름**: 버튼 클릭 → `interactionCreate` → `safeDeferReply` → `saveAnalysisFeedbackHistory` → `ingestPersonaFeedback` → (가능 시) `claim_feedback` + `persona_memory` 갱신
- **전송 방식**: 피드백 버튼이 붙은 분석 메시지는 **Incoming Webhook이 아니라 봇 채널 메시지**(`channel.send`)로 보낸다. Webhook으로 붙인 컴포넌트는 interaction/소유권 측면에서 실패하거나 불안정할 수 있다.
- **중복**: 동일 조건 연타 시 `analysis_feedback_history` 또는 `claim_feedback` 단계에서 duplicate로 막히고, 사용자에게 구분 메시지가 간다.
- **운영 확인**: `FEEDBACK` 스코프 로그(`feedback button clicked`, `feedback history saved`, `feedback ingestion result`, `duplicate ignored`, `handler failed`) 및 Supabase에서 `analysis_feedback_history` / `claim_feedback` 행 확인 — `docs/OPERATIONS_RUNBOOK.md`, `docs/TEST_CHECKLIST.md` 참고

### Feedback → 의사결정 소프트 보정 (포트폴리오 5인 토론)

- **목적**: 저장된 피드백·claim 메타로 **claim 가중(소폭)** 및 CIO 종합 시 **우선순위/모니터링 서술**만 보정. **NO_DATA 게이트·시세/밸류에이션 가드·Phase2 veto·GO/HOLD 결론 자체를 뒤집지 않음.**
- **구현**: `persona_memory.confidence_calibration` 누적 → `buildFeedbackDecisionSignal`이 claim별 Δ를 **최대 +0.07 / 최소 −0.05**로 clamp → RAY/HINDENBURG의 downside-focused claim은 **baseline 이하 하향 금지**(safety floor).
- **관측**: `FEEDBACK_CALIBRATION` 로그 `applied`; CIO `analysis_generation_trace`에 `feedback_adjustment_meta` JSON(best-effort).
- **Discord**: 위원회 결정 요약 아래 **이탤릭 한 줄** 안내(과도한 개인화 문구 없음).

## Docs

- [System Architecture](docs/SYSTEM_ARCHITECTURE.md): 실행 흐름/모듈 구조/LLM fallback 구조
- [System Review](docs/SYSTEM_REVIEW.md): 현재 구조 평가와 리팩토링 필요성
- [Operations Runbook](docs/OPERATIONS_RUNBOOK.md): 운영/장애 대응 표준 절차
- [Environment](docs/ENVIRONMENT.md): 환경변수 기준/민감정보 원칙
- [Database Schema](docs/DATABASE_SCHEMA.md): 주요 테이블/관계/확인 필요 항목
- [Test Checklist](docs/TEST_CHECKLIST.md): 배포 전후 테스트 체크리스트
- [Roadmap](docs/ROADMAP.md): 단계별 목표/완료조건/리스크
- [Changelog](docs/CHANGELOG.md): 변경 이력 기록
- [Documentation Policy](docs/DOCUMENTATION_POLICY.md): 코드-문서 동시 갱신 강제 규칙

## Documentation Rule

- 코드 변경 전후로 관련 문서 영향 범위를 반드시 판단하고 함께 갱신합니다.
- `docs/CHANGELOG.md`는 의미 있는 코드 변경 시 항상 업데이트합니다.
- 문서 갱신 누락 시 작업 완료로 간주하지 않습니다.
