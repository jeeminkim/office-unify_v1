# OPERATIONS RUNBOOK

## 1. 실행 방법

### 로컬/서버 공통
```bash
npm install
npm run build
npm start
```

### PM2 사용
```bash
pm2 start dist/index.js --name ai-office --interpreter node
pm2 logs ai-office
pm2 restart ai-office
```

## 2. build / start / restart 표준 흐름
1. 환경변수 로딩 확인 (`.env` 존재, 키 누락 여부 점검)
2. `npm run build`
3. 프로세스 시작/재시작 (`npm start` 또는 `pm2 restart ai-office`)
4. 부팅 로그 확인 (`BOOT`, `ENV`, panel restore 로그)
5. Discord 패널 버튼 응답 확인

## 3. 로그 확인 방법

### 기본 런타임 로그
- `logs/office-runtime.log`
- `logs/office-error.log`
- `logs/office-health.json`

### 카테고리 로그(KST 일자 파일)
- `logs/openai/openai.log_YYYYMMDD`
- `logs/quote/quote.log_YYYYMMDD`
- `logs/interaction/interaction.log_YYYYMMDD`
- `logs/db/db.log_YYYYMMDD`
- `logs/portfolio/portfolio.log_YYYYMMDD`
- `logs/boot/boot.log_YYYYMMDD`
- `logs/llm/llm.log_YYYYMMDD`

### 빠른 확인 포인트
- LLM fallback: `LLM_PROVIDER` scope
- quote 장애: `QUOTE` scope (`classifiedReason`, `failureBreakdown`, `traceId`)
- interaction 오류: `INTERACTION`/`DISCORD` scope

## 4. 장애 대응 기본 절차
1. 장애 범주 분류
   - Discord 응답 지연/실패
   - Supabase 연결/쿼리 실패
   - LLM(OpenAI/Gemini) 실패
   - Quote 실패/valuation 왜곡
2. 최근 15분 로그 확인
3. fallback 동작 여부 확인
4. 재시작 필요 시 graceful restart
5. 재현 명령 및 영향 범위 기록
6. 임시조치 후 근본원인 분석 티켓 생성

## 5. Supabase 장애 점검 포인트
- 필수 env:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- health check:
  - `index.ts` 초기 DB check 로그 확인
- 증상별 포인트:
  - insert/select 에러 증가 시 권한/스키마 불일치 점검
  - `chat_history.id` 타입 이슈(운영 integer vs schema UUID) 영향 여부 점검

## 6. Discord bot 장애 점검 포인트
- 필수 env:
  - `DISCORD_TOKEN` 또는 `DISCORD_BOT_TOKEN`
- 인터랙션 오류:
  - `Unknown interaction`, `Invalid Form Body` 발생 여부
- 대응:
  - defer/route/chunking 경로 로그 확인
  - panel state(`state/discord-panel.json`) 손상 여부 점검

### 6.1 피드백 버튼(분석 응답 하단) 운영 검증
1. 분석 1회 실행 후 응답에 피드백 버튼이 보이는지 확인
2. 버튼 클릭 시 **에페메럴** 응답이 오고, 로그에 `FEEDBACK` / `feedback button clicked` 가 남는지 확인
3. Supabase `analysis_feedback_history`에 새 행(해당 `chat_history_id`, `analysis_type`, `feedback_type`, `persona_name`)이 생겼는지 확인
4. claim 매핑이 된 경우 `claim_feedback`에 반영됐는지 확인(unique `(discord_user_id, claim_id, feedback_type)`)
5. **동일 버튼을 짧은 간격으로 연타** → `duplicate ignored` 로그 및 사용자 메시지(이미 저장/이미 반영) 확인
6. 피드백이 붙은 메시지가 **webhook 전용이 아닌** 일반 채널 메시지인지 확인(버튼이 실제로 눌리는지 — `README.md` “Feedback buttons” 절 참고)
7. 로그에 `column chat_history.debate_type does not exist` 가 **더 이상 나오지 않는지** 확인(피드백 경로는 customId의 `analysisType`만 사용).

### 6.2 피드백 소프트 보정(포트폴리오 토론)
1. 포트폴리오 토론 완료 후 로그에 `FEEDBACK_CALIBRATION` / `applied`가 **페르소나당** 남는지 확인(`claimCount`, `avgBaseScore`, `avgAdjustedScore`, `safetyFloorTriggered`).
2. Supabase `persona_memory.confidence_calibration` JSON에 선호 claim_type / evidence_scope 키가 누적되는지(피드백·claim_feedback 반영 후 `refreshPersonaMemoryFromFeedback` 경로).
3. CIO 행 `analysis_generation_trace`에서 `memory_snapshot.feedback_adjustment_meta` 존재 여부(스키마 확장 없이 JSON 내부 필드).
4. **비기능 요구**: NO_DATA로 차단된 세션에서 보정이 게이트를 우회하지 않는지(동일 조건 재현 시 여전히 차단).
5. 위원회 결정 요약 메시지에 **이탤릭 한 줄** 피드백 안내가 붙는지(과도한 문구 없음).

## 7. OpenAI/Gemini 장애 및 fallback 점검
- 확인 순서
  1. `OPENAI_API_KEY` 존재
  2. budget guard 값 확인 (`OPENAI_MONTHLY_MAX_CALLS`, `OPENAI_MONTHLY_BUDGET_USD`)
  3. `OPENAI_BUDGET_ENFORCEMENT`, `OPENAI_FALLBACK_TO_GEMINI` 상태 확인
  4. `LLM_PROVIDER` 로그에서 fallback reason 확인
- 현재 OpenAI 우선 페르소나:
  - HINDENBURG, SIMONS, THIEL, HOT_TREND

## 8. 배포 전 체크리스트

### 필수
- `npm run build` 성공
- `npm run check:schema-contract`
- `npm run check:phase1-structure`
- `npm run check:runtime-e2e` (실제 `SUPABASE_*` + `PHASE1_TEST_DISCORD_USER_ID` 또는 `TEST_DISCORD_USER_ID` 필요)
- `docs/TEST_CHECKLIST.md`의 **MUST CHECK** 섹션 확인

### 확장 (회귀·품질)
- Phase 2 결정 엔진 스모크: `npm run check:decision-engine` (기본 Phase 2 DDL 적용 후 hardening SQL `docs/sql/append_phase2_decision_tables_hardening.sql` 반영 권장 — 그렇지 않으면 스키마 캐시 오류로 저장만 실패할 수 있음)
- self-check 실행
  - `node dist/openai_phase1_self_check.js`
  - `node dist/discord_response_self_check.js`
  - `node dist/uiux_stability_self_check.js`
  - `node dist/quote_logging_self_check.js`
  - `node dist/logging_self_check.js`
  - `node dist/uiux_provider_valuation_self_check.js`
- 문서 갱신 확인
  - 최소 `docs/CHANGELOG.md` 갱신

## 9. 배포 후 체크리스트
- 부팅 후 5분 내 오류 로그 급증 여부
- 메인 패널 버튼 응답 테스트(포트폴리오/AI/트렌드/데이터센터)
- 금융 토론 1회, 트렌드 1회, 데이터센터 1회 실행
- quote 실패 종목 존재 시 valuation 경로 로그 확인

## 10. rollback 기본 절차
1. 장애 유발 변경 범위 식별(최근 수정 파일)
2. 직전 안정 커밋으로 복귀 배포
3. PM2 재시작
4. 핵심 기능 smoke test
5. rollback 사유/영향/후속조치 문서화

## 11. 확인 필요
- 운영환경에서 실제 프로세스 관리 표준(PM2 외 systemd/docker 등) 확정 필요
- 운영 DB migration 적용 이력 정합성(특히 chat_history / analysis_generation_trace 계열) 재확인 필요
