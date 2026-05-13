# 결정 로그 (경량)

장문 ADR 대신 **한 화면에서 훑어볼 수 있는** 요약만 남긴다. 상세 논의는 PR·이슈 링크로 충분하다.

형식:

```
### YYYY-MM-DD — 짧은 제목
- **결정:** 채택 | 보류 | 거부
- **이유:** (한두 문장)
- **대안:** (있으면)
- **링크:** PR / 이슈 / 커밋
```

---

### 템플릿 (복사용)

### YYYY-MM-DD —
- **결정:**
- **이유:**
- **대안:**
- **링크:**

---

### 2026-05-13 — 미국 신호 empty 사유는 ops 히스토그램으로만 7일(또는 24h) 집계한다 (EVO-006)

- **결정:** 채택
- **이유:** 단일 요청의 `usKrSignalDiagnostics`만으로는 패턴을 보기 어렵다. `web_ops_events`의 **`us_signal_candidates_empty`**를 **read-only SELECT**로 집계하면 운영자·사용자가 빈도를 볼 수 있고, 후보를 억지로 늘리지 않는다.
- **대안:** Today Brief 본문에 장문 히스토리 포함(노이즈·민감정보 위험).
- **링크:** (PR)

### 2026-05-13 — 테마 연결 맵은 설명·진단용이며 후보 수를 늘리지 않는다 (EVO-007 1차)

- **결정:** 채택 (1차 휴리스틱 registry)
- **이유:** ETF·국내 관심·보유·미국 신호를 **theme key**로 묶어 “왜 같은 테마로 보였는지”를 설명하면 매핑 품질을 점검할 수 있다. **낮은 신뢰도는 후보 생성에 사용하지 않는다.**
- **대안:** 요청마다 LLM으로 테마 내러티브 생성(비용·일관성·민감정보 위험).
- **링크:** (PR)

### 2026-05-13 — Today Brief 테마 맵 본문은 크기 제한, 상세는 별도 read-only API (EVO-007 안정화)

- **결정:** 채택
- **이유:** 브리핑 JSON이 비대해지는 것을 막고, 진단용 전체 맵은 **`GET /api/dashboard/theme-connections`**로 분리한다. `usKrEmptyThemeBridgeHint` 등은 **truncate 전 full map**으로 계산해 얇음 판정이 왜곡되지 않게 한다.
- **대안:** 클라이언트에 전 테마·전 링크를 항상 포함(모바일·캐시 부담).
- **링크:** (PR)

### 2026-05-13 — PB 복기 코치는 초안만 제안하고 DB에 자동 저장하지 않는다 (EVO-008 2차)

- **결정:** 채택
- **이유:** PB가 사용자 복기를 대신 확정하면 책임·일관성 문제가 생긴다. 초안은 **`POST /api/decision-retrospectives/coach`**로만 받고, **`web_decision_retrospectives` insert는 사용자가 `POST /api/decision-retrospectives`를 눌렀을 때만** 수행한다.
- **대안:** PB 응답을 서버가 자동으로 복기 행으로 파싱 저장(거부).
- **링크:** (PR)

### 2026-05-13 — Today 후보 복기 시드는 화이트리스트·길이 제한으로만 받는다

- **결정:** 채택
- **이유:** 클라이언트가 임의 JSON을 보낼 수 있어 과대 페이로드·민감 필드 혼입을 막고, `detail_json`에는 요약 메타만 남긴다.
- **대안:** 서버에서 Today Brief를 재조회해 후보를 복원(추가 조회·캐시 의존).
- **링크:** (PR)

### 2026-05-13 — PB 멱등 키는 `(user_key, idempotency_key)` 복합 unique

- **결정:** 채택
- **이유:** `web_persona_chat_requests`(및 동일 패턴)에서 idempotency 키는 **user_key와 함께**만 unique이며, 단독 전역 unique가 아니다. 주간 점검 `recommendedIdempotencyKey`는 기존 해시 형식을 유지한다.
- **대안:** 키 문자열에 `userScopeHash`를 additive로 포함(전역 키 공유 환경 대비) — 현 스키마에서는 필수 아님.
- **링크:** (PR)

### 2026-05-13 — 판단 복기(EVO-008) 1차는 사용자 피드백 중심, PB 자동 저장 복기는 비범위

- **결정:** 채택 (1차)
- **이유:** 복기 목적은 **판단 품질 개선**이며 수익률만으로 좋고 나쁨을 나누지 않는다. PB가 복기 본문을 **자동으로 DB에 저장**하면 주관적 회고와 섞일 수 있다.
- **대안:** 2차에서 선택적 「PB 복기 코치」(요약 제안만, 저장은 사용자 확인).
- **링크:** (PR)

> **후속(2차):** 「PB 복기 코치」를 `POST /api/decision-retrospectives/coach`로 채택 — 초안만 반환·`autoSaved: false`·사용자 확인 후 `POST /api/decision-retrospectives` 저장. **위** 「PB 복기 코치는 초안만…」결정 참조.

### 2026-05-11 — Today Brief는 관찰 후보 덱 중심으로 유지

- **결정:** 채택
- **이유:** 관심 후보 top2 + Sector Radar ETF top1 구성이 사용자에게 더 직관적이며 기존 후보 API를 additive로 유지할 수 있다.
- **대안:** 기존 2열 후보 영역만 유지
- **링크:** 관련 PR/커밋은 추후 기입

### 2026-05-11 — Research Center follow-up은 PB 고찰로 연결

- **결정:** 채택
- **이유:** 리서치 결과가 일회성 문서로 끝나지 않고 추적 항목과 판단 보조 대화로 이어진다.
- **대안:** follow-up을 UI 표시만 하고 저장하지 않음
- **링크:** 추후 기입

### 2026-05-11 — 자동매매/자동주문은 evolution 백로그에서도 비범위

- **결정:** 채택
- **이유:** 본 서비스는 개인화 투자 판단 보조이며 사용자 승인 없는 실행 시스템이 아니다.
- **대안:** 없음
- **링크:** 추후 기입

### 2026-05-11 — 투자자 프로필은 저장 가능한 맥락으로 두고 적합성은 휴리스틱으로 시작

- **결정:** 채택 (1차 스캐폴딩)
- **이유:** 동일 사용자 기준(손실 감내·기간·레버리지·집중도)을 Today Brief·PB가 공유하면 관찰 후보 설명이 일관된다. 자동 실행과 분리한다.
- **대안:** 매 요청마다 세션 스토리지만 사용(비영속)
- **링크:** 추후 기입

### 2026-05-11 — Research Center follow-up은 추적함·상태·PB 고찰로 확장(EVO-003)

- **결정:** 채택 (1차)
- **이유:** 추출만으로는 후속 확인이 끊기므로 open/tracking/discussed/dismissed/archived와 PATCH·요약 메타로 운영 가능하게 한다. PB 멱등 시 `tracking`으로 남겨 과도한 “논의 완료” 표기를 피한다.
- **대안:** 외부 이슈 트래커만 사용
- **링크:** 추후 기입

### 2026-05-11 — Today Brief에 보유 집중도는 참고 신호로만 (EVO-005 1차)

- **결정:** 채택
- **이유:** 관찰 후보만 보지 않고 보유·테마 겹침을 알려야 과도한 동일 테마 추적을 줄일 수 있다. `concentrationLimit`과 단일/테마 임계 %를 맞추되, **자동 리밸런싱·매매 지시는 금지**하고 `qualityMeta`에는 집계·레벨만 남긴다.
- **대안:** 외부 포트폴리오 분석 도구만 사용
- **링크:** `docs/ops/today_candidates.md`

### 2026-05-11 — 집중도 메타·문구는 additive이며 실행 지시와 분리 (EVO-005 안정화)

- **결정:** 채택
- **이유:** 사용자·PB가 **계산 기준**(시세 평가 vs 평균 단가 추정)과 **테마 매핑 신뢰도**를 구분해 읽도록 `exposureBasis`·`themeMappingConfidence`를 추가한다. `country_overweight` 코드는 유지하되, 의미는 **KR/US 시장 노출** 휴리스틱으로 문서·UI·프롬프트에 명시한다. 집중도는 **점검 질문**이며 매도·비중 축소·리밸런싱 지시가 아니다. 금액·`userNote` 원문은 `qualityMeta`/ops에 넣지 않는다.
- **대안:** 메타 없이 자연어로만 설명(재현성·일관성 낮음)
- **링크:** `docs/ops/today_candidates.md`, `packages/shared-types/src/concentrationRisk.ts`

### 2026-05-11 — Research follow-up 중복 키는 정규화 title + 선택적 Postgres unique index

- **결정:** 채택 (앱 로직 + 선택 DDL)
- **이유:** 대소문자·공백만 다른 중복 저장을 막고, 멀티 인스턴스에서도 DB가 최종 방어선이 될 수 있다. `user_key` 소유·`research_request_id`·`symbol`(null은 키에서 빈 문자열)·`normalizeResearchFollowupDedupeTitle`(trim+lower+공백 축약)으로 서버·DB 의미를 맞춘다. 저장 `title` 원문은 유지한다.
- **대안:** 앱만 중복 검사(DB 무인덱스); 또는 `title_key` 컬럼 추가(스키마 침습도 큼)
- **주의:** 기존 데이터에 중복이 있으면 unique index 생성이 실패하므로 사전 `GROUP BY` 점검 SQL로 정리 후 적용한다. `GET /followups`는 read-only로 유지한다. `userNote` 원문은 ops 로그에 남기지 않는다.

### 2026-05-11 — Today Brief 관찰 점수는 요인 설명으로 보강(EVO-002)

- **결정:** 채택 (1차)
- **이유:** `observationScore`만 노출하면 사용자가 우선순위 근거를 이해하기 어렵다. 관심사·시세 품질·섹터·미국 신호 진단·적합성 조정을 요약 요인으로 나누되, 매수 권유·자동 실행과 분리한다.
- **대안:** 점수 산식 전체 공개
- **링크:** 추후 기입

### 2026-05-13 — PB 주간 점검은 read-only 미리보기와 PB 멱등 생성을 분리 (EVO-004 1차)

- **결정:** 채택
- **이유:** 매주 “이번 주 확인할 것”을 한 화면에서 정리하되, **조회 API에서 DB write·PB 호출을 하지 않는다.** POST만 기존 `web_persona_chat_requests` 멱등으로 PB 메시지를 남긴다. 응답 형식은 `responseGuard`로 누락 섹션·정책 문구를 경고만 한다(1차는 자동 재요청 없음). 금액·userNote·민감 메모는 sanitize/qualityMeta에 넣지 않는다.
- **대안:** Today Brief GET에 주간 블록을 직접 합치기(단일 경로 ops write 위험·경계 혼동)
- **링크:** `docs/ops/today_candidates.md`, `GET|POST /api/private-banker/weekly-review`

### 2026-05-13 — PB 주간 점검 멱등 키는 GET `recommendedIdempotencyKey`로 고정 (EVO-004 안정화)

- **결정:** 채택
- **이유:** 동일 주·동일 sanitize 미리보기 컨텍스트면 POST가 예측 가능하게 dedupe되도록 `weekOf`+결정적 JSON만 SHA-256한 권장 키를 GET에 additive로 내려준다. responseGuard는 “키워드 누락”이 아니라 **지시형·부정 없는 위험 언급**만 경고하고, “~하지 않습니다”류 안전 고지는 경고 대상에서 제외한다.
- **대안:** 클라이언트가 매 요청 UUID로 멱등 키 생성
- **링크:** `privateBankerResponseGuard.ts`, `privateBankerWeeklyReview.ts`

---

(아래에 시간순으로 쌓는다.)
