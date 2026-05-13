# 로드맵 백로그 (scratchpad)

날짜순 또는 우선순위순으로 유지한다. 상세는 `IDEA_TEMPLATE.md` 블록을 여기에 붙이거나 별도 파일로 두고 링크만 남긴다.

## 진행 중 · 다음에 할 일

| ID | 요약 | 영역 | 상태 | 메모 |
|----|------|------|------|------|
| EVO-001 | 투자자 프로필/적합성 게이트 | `#pb` `#today-brief` `#research-center` | discussing · scaffold shipped | `web_investor_profiles`(SQL), `/api/investor-profile`, Today Brief 덱·PB 맥락 연결 1차 반영. 고도화·운영 확정은 진행 중. 자동매매 없음. |
| EVO-002 | Today Brief 개인화 점수 설명 강화 | `#today-brief` `#ux` | discussing · 1차 shipped | `scoreExplanationDetail`·`qualityMeta.todayCandidates.scoreExplanationSummary`, 덱 카드 「왜 이 후보?」. 고도화(산식 설명·요인 가중 시각화)는 진행 중. 매수 권유·자동 실행 없음. |
| EVO-003 | Research Center follow-up 추적함 | `#research-center` `#pb` | discussing · 1차 shipped | PATCH·GET summary·정규화 dedupe·선택 DB unique index·archived/메모 UI·GET read-only 테스트·ops에 note 원문 미저장. 자동매매 없음. |
| EVO-004 | PB 주간 점검 리포트 | `#pb` `#dashboard` | discussing · 1차 shipped | `GET|POST /api/private-banker/weekly-review`: GET 미리보기만(read-only); POST PB 멱등. Today Brief 덱·follow-up(stale 14일+)·집중도·적합성. `responseGuard`는 경고만. 자동 주문·리밸런싱 없음. |

## 아이디어 풀 (미정)

| ID | 요약 | 영역 | 상태 | 메모 |
|----|------|------|------|------|
| EVO-005 | 보유 비중/테마 집중도 리스크 경고 | `#portfolio` `#pb` `#risk` | discussing · 1차 shipped + 안정화 | Today Brief 덱·`exposureBasis`·`themeMappingConfidence`·점수 설명·`qualityMeta` 요약; PB/Research send-to-pb `[보유 집중도 점검]` 질문형. `country_overweight`=시장 노출 휴리스틱. 임계는 `concentrationLimit`. 집중도는 점검 질문이며 매도·리밸런싱 지시 아님. 자동 실행 없음. |
| EVO-006 | 미국 신호 empty reason 7일 히스토그램 | `#today-brief` `#ops` | draft | `us_signal_candidates_empty`의 primaryReason을 7일 단위로 집계. |
| EVO-007 | 관심 테마별 ETF/국내주식 연결 맵 | `#sector-radar` `#today-brief` | draft | Sector Radar 대표 ETF와 국내 관심종목을 연결. |
| EVO-008 | 판단 복기 시스템 | `#pb` `#research-center` `#ops` | draft | 과거 후보/리포트/PB 판단의 결과를 복기해 품질 개선. |

## 보류 · 나중에

| ID | 요약 | 사유 |
|----|------|------|
| EVO-009 | 자동 주문 또는 자동 포트폴리오 변경 | 제품 원칙상 비범위. 사용자의 명시 승인 없는 자동 실행 금지. |

---

**ID 규칙 (예시):** `EVO-001` 처럼 저장소 내에서만 통일하면 된다.
