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

---

(아래에 시간순으로 쌓는다.)
