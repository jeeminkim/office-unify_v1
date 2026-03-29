# TEST CHECKLIST

## MUST CHECK vs OPTIONAL CHECK

- **MUST CHECK**: 배포·운영 안정화에 직접 필요한 최소 검증 (`build`, 스키마 계약, Phase1 구조 스모크, **실DB 런타임 E2E 스모크**, 아래 Phase1 DB·학습 루프 핵심 항목).
- **OPTIONAL CHECK**: 회귀·품질·주변 도구(self-check 바이너리 전부, quote/valuation 심층, 수동 UX 전 범위 등).

## 0. 자동 점검 (로컬/CI)
- [ ] `npm run build`
- [ ] `npm run check:schema-contract`
- [ ] `npm run check:phase1-structure` (Supabase URL 미설정 시 dummy env로 모듈 로드만 검증)
- [ ] `npm run check:runtime-e2e` (실제 Supabase + 테스트 Discord 사용자 ID; 분석·claim·trace·피드백·메모리·fallback 로그 스모크)
- [ ] `npm run check:decision-engine` (Phase 2 위원회 투표 + veto + unique 위반 처리 스모크; **기본 Phase 2 테이블 적용 후** `docs/sql/append_phase2_decision_tables_hardening.sql` 실행 시 persistence·duplicate 검증까지 가능)

## 1. 기본 기능 테스트
- [ ] 봇 기동 후 메인 패널 렌더링 (`panel:main:*`)
- [ ] 포트폴리오 보기(일반계좌) 정상 응답
- [ ] 전체 자산 보기 정상 응답
- [ ] 지출/현금흐름 입력 및 조회 정상 동작
- [ ] AI 토론/트렌드 응답 송신 성공
- [ ] 데이터 센터 버튼 및 하위 액션 응답 성공

## 2. Phase 1 테스트 체크리스트
- [ ] 분석 실행 후 `analysis_generation_trace` 저장 확인
- [ ] 분석 실행 후 `analysis_claims` 저장 확인
- [ ] 피드백 버튼 클릭 후 `analysis_feedback_history` 저장 확인
- [ ] claim 매핑 성공 시 `claim_feedback` 저장 확인
- [ ] `persona_memory` refresh 결과 반영 확인
- [ ] 중복 피드백 클릭 시 idempotent 처리 확인

## 3. 분석 1회 실행 시 확인 항목
- [ ] 사용자 메시지 -> 상태 메시지 -> 최종 응답 순서 유지
- [ ] Discord 2000자 제한 초과 시 chunk 전송
- [ ] interaction timeout/unknown interaction 미발생
- [ ] 응답별 피드백 버튼 노출 및 안내 문구 확인

## 4. claim 저장 확인 항목
- [ ] `analysis_claims.claim_order` 순서 정상
- [ ] `claim_type`, `evidence_scope` 채워짐
- [ ] `chat_history_id` 연계 상태 확인 (null 허용 경로 포함)

## 5. feedback 저장 확인 항목
- [ ] 버튼 `customId`가 `feedback:save:{chatHistoryId}:{analysisType}:{feedbackType}:{personaKey}` 형태인지 확인 (`index.ts`)
- [ ] 클릭 시 `interactionCreate` → `FEEDBACK` 로그(`feedback button clicked` → `feedback history saved` → `feedback ingestion result`) 순으로 남는지 확인
- [ ] `analysis_feedback_history`에 persona/analysis_type/opinion 저장
- [ ] `mapped_claim_id`, `mapping_method`, `mapping_score` 저장 확인(매핑 성공 시)
- [ ] `claim_feedback` unique 제약으로 중복 방어 확인
- [ ] 동일 버튼 연타 시 duplicate UX + `duplicate ignored` 로그
- [ ] 피드백이 붙은 분석 메시지가 **봇 채널 메시지**로 전송됨(webhook만 사용 시 버튼이 동작하지 않을 수 있음 — `broadcastAgentResponse` 참고)
- [ ] 피드백 저장 시 `chat_history.debate_type` 오류 없음(`analysis_type`은 customId 기준)

## 5b. 피드백 소프트 보정 (포트폴리오 토론)
- [ ] `FEEDBACK_CALIBRATION` / `applied` 로그 및 `safetyFloorTriggered` 동작(RAY/HINDENBURG downside)
- [ ] `persona_memory.confidence_calibration` 필드 누적(피드백·claim_feedback 반영 후)
- [ ] CIO trace `feedback_adjustment_meta` (best-effort)
- [ ] 결론(GO/HOLD 등)이 아닌 **서술/우선순위 힌트** 수준만 변경되는지(게이트·veto 미완화)

## 6. persona_memory load 확인 항목
- [ ] 해당 persona row 미존재 시 empty memory fallback
- [ ] feedback 반영 후 `memory_version` 증가
- [ ] `accepted_patterns`, `rejected_patterns`, `style_bias` 갱신

## 7. fallback 확인 항목

### LLM fallback
- [ ] OpenAI API key 없음 -> Gemini fallback
- [ ] budget/call guard 초과 -> Gemini fallback
- [ ] OpenAI 호출 실패 -> Gemini fallback

### Quote/valuation fallback
- [ ] US live_usd 경로: `fx_rate_to_krw` 적용
- [ ] US fallback_krw/snapshot_krw 경로: `fx_rate_to_krw` 재곱 미적용
- [ ] 비정상 valuation guard 경고 로그 확인
- [ ] snapshot sanity guard 로그 확인

## 8. 회귀 테스트 핵심 항목
- [ ] NOW/CONL 등 US quote 실패 시 포트폴리오 비중 왜곡 재발 없음
- [ ] 위원회 소개 문구에 JYP 없음
- [ ] THIEL/HOT_TREND provider 정책(OpenAI 우선 + fallback) 유지
- [ ] 데이터센터 버튼/액션 유지

## 9. 배포 전 체크리스트
- [ ] `npm run build`
- [ ] self-check 실행
  - [ ] `node dist/openai_phase1_self_check.js`
  - [ ] `node dist/discord_response_self_check.js`
  - [ ] `node dist/uiux_stability_self_check.js`
  - [ ] `node dist/quote_logging_self_check.js`
  - [ ] `node dist/logging_self_check.js`
  - [ ] `node dist/uiux_provider_valuation_self_check.js`
- [ ] 문서 갱신(`CHANGELOG.md` 포함) 완료

## 10. 배포 후 smoke test
- [ ] 메인 패널에서 6개 메뉴 버튼 동작 확인
- [ ] 포트폴리오 조회 1회 + AI 토론 1회 + 트렌드 1회 + 데이터센터 1회
- [ ] 오류 로그 급증 여부 확인 (`office-error.log`)
- [ ] 카테고리 로그 파일 생성 확인

## 11. 확인 필요
- 운영 DB 타입 차이(`chat_history.id`)가 테스트 스크립트와 충돌 없는지 환경별 확인 필요
