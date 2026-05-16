# 로드맵 백로그 (scratchpad)

날짜순 또는 우선순위순으로 유지한다. 상세는 `IDEA_TEMPLATE.md` 블록을 여기에 붙이거나 별도 파일로 두고 링크만 남긴다.

## 진행 중 · 다음에 할 일

| ID | 요약 | 영역 | 상태 | 메모 |
|----|------|------|------|------|
| EVO-001 | 투자자 프로필/적합성 게이트 | `#pb` `#today-brief` `#research-center` | discussing · scaffold shipped | `web_investor_profiles`(SQL), `/api/investor-profile`, Today Brief 덱·PB 맥락 연결 1차 반영. 고도화·운영 확정은 진행 중. 자동매매 없음. |
| EVO-002 | Today Brief 개인화 점수 설명 강화 | `#today-brief` `#ux` | discussing · 1차 shipped | 카드 기본 `userReadableSummary`, 중립대 필수 문구, `repeatExposure.source`(스냅샷 우선)·`today_candidate_snapshot` ops. 고도화는 진행 중. 매수 권유·자동 실행 없음. |
| EVO-003 | Research Center follow-up 추적함 | `#research-center` `#pb` | discussing · 1차 shipped | PATCH·GET summary·정규화 dedupe·선택 DB unique index·archived/메모 UI·GET read-only 테스트·ops에 note 원문 미저장. 자동매매 없음. |
| EVO-004 | PB 주간 점검 리포트 | `#pb` `#dashboard` | discussing · 1차 shipped + 안정화 | GET 미리보기+`recommendedIdempotencyKey`, POST 멱등. **`sqlReadiness`(테이블 미적용 actionHints)**. responseGuard는 지시형·위험 문맥만. 자동 주문·리밸런싱 없음. |
| EVO-010 | 실사용 전 SQL 순서·스모크 | `#ops` `#dashboard` | shipped | `docs/sql/APPLY_ORDER.md`(append 순서·중복 인덱스 사전 점검). `npm run pre-live-smoke`(dry-run 기본). 홈 **실사용 점검** 패널. 자동매매 없음. |

## 아이디어 풀 (미정)

| ID | 요약 | 영역 | 상태 | 메모 |
|----|------|------|------|------|
| EVO-005 | 보유 비중/테마 집중도 리스크 경고 | `#portfolio` `#pb` `#risk` | discussing · 1차 shipped + 안정화 | Today Brief 덱·`exposureBasis`·`themeMappingConfidence`·점수 설명·`qualityMeta` 요약; PB/Research send-to-pb `[보유 집중도 점검]` 질문형. `country_overweight`=시장 노출 휴리스틱. 임계는 `concentrationLimit`. 집중도는 점검 질문이며 매도·리밸런싱 지시 아님. 자동 실행 없음. |
| EVO-006 | 미국 신호 empty reason 7일 히스토그램 | `#today-brief` `#ops` | **1차 shipped** | `GET …/today-candidates/ops-summary`에서 `us_signal_candidates_empty`를 **primaryReason → reasonCodes[0] → unknown**으로 집계, `qualityMeta.todayCandidates.usKrEmptyReasonHistogram`, `range=24h|7d`. read-only·민감 detail 미저장. |
| EVO-007 | 관심 테마별 ETF/국내주식 연결 맵 | `#sector-radar` `#today-brief` | **1차 shipped + 안정화** | registry·`themeConnectionMap`·Brief 덱 `themeConnection`·`usKrEmptyThemeBridgeHint`·집중도 매핑 보강. **Brief `themeConnectionMap`은 5테마×링크8 truncate** + `summary.truncated`; 전체/bridge는 내부 full map. **`GET /api/dashboard/theme-connections`** read-only 상세(링크20). Sector bucket→`mapSectorRadarThemeToThemeKey`. 관심 원천 `watchlistRows`(후속 정교화). 후보 강제 생성 아님. |
| EVO-008 | 판단 복기 시스템 | `#pb` `#research-center` `#ops` | **1차+안정화+PB 코치** | 과거 후보/리포트/PB 맥락을 **판단 과정** 관점에서 복기(수익률 평가·자동매매 아님). SQL `append_decision_retrospectives.sql`; API·대시보드·Research 연결; Today 후보 시드 **페이로드 검증**·상태 **reviewed/learned/archived** UI. **`GET|POST /api/decision-retrospectives/coach`** — PB 초안만, 자동 저장 없음; `auditRetroCoachPolicyWarnings`. |

## 보류 · 나중에

| ID | 요약 | 사유 |
|----|------|------|
| EVO-009 | 자동 주문 또는 자동 포트폴리오 변경 | 제품 원칙상 비범위. 사용자의 명시 승인 없는 자동 실행 금지. |

---

**ID 규칙 (예시):** `EVO-001` 처럼 저장소 내에서만 통일하면 된다.
