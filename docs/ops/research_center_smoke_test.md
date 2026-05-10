# Research Center 배포 스모크 테스트

배포 후 **명시적 생성 액션**(`POST /api/research-center/generate`)과 운영 진단 경로가 기대대로 동작하는지 최소 수준으로 확인합니다. 이 문서는 secret/token/API key 실값을 포함하지 않습니다.

## 사전 조건

- 브라우저에서 동일 출처 세션으로 로그인 가능
- (선택) `GEMINI_API_KEY`, Supabase 서비스 롤, Google Sheets 연동은 환경에 따라 구성

## 체크리스트

### 1. 정상 생성 (`saveToSheets=false`, 시트 요약 저장 미체크)

> 요청 필드명은 API 기준 `saveToSheets`(시트에 요약 append). `includeSheetContext`는 원장 맥락을 프롬프트에 넣는 옵션으로 별개다.

- `/research-center`에서 시장·티커·종목명 입력 후 **시트 저장 미체크**
- 응답 `ok: true`, 본문 탭에 리포트 표시
- `qualityMeta.researchCenter.status`가 `ok`, `requestId` 존재
- `qualityMeta.researchCenter.timings`(additive)에 `totalMs`, `timeoutBudgetMs`, `nearTimeout`, 가능하면 `sheetsMs`/`contextCacheMs` 분리 등 확인

### 2. 시트 저장 포함 (`saveToSheets=true`)

- **생성 후 시트에 요약 저장** 체크 후 실행
- Sheets 미설정 시 `status: degraded` 가능, 본문은 유지되는지 확인
- 설정된 경우 `meta.sheetsAppendSucceeded`, `sheetsAppended` 확인

### 3. 입력 오류

- 빈 티커/종목명으로 생성 시도 → HTTP 400, JSON `ok: false`, `errorCode: research_input_invalid`
- 선택 필드에 비정상적으로 긴 문자열 → API가 거절하거나 경고하는지 확인(환경별 상한에 따름)

### 4. Provider 실패 / 환경 누락

- 배포 환경에서 `GEMINI_API_KEY` 미설정 시 → HTTP 503, JSON, `failedStage: provider`, `actionHint` 포함
- 로컬에서는 `.env` 제거 후 동일 확인 가능(실키 기재 금지)

### 5. 클라이언트 오류 분류

- 개발자 도구에서 `generate` 응답을 HTML로 바꾸거나 네트워크 차단 시 UI가 `network_fetch_failed` / `http_error` / `response_json_parse_failed` 등으로 구분되는지 확인

### 6. 운영 추적

- 성공/실패 응답의 `requestId`를 복사
- `/ops-events?domain=research_center&q=<requestId>`에서 동일 ID 검색
- (선택) `GET /api/research-center/ops-summary?range=24h` — read-only, **DB write 없음**, 집계·최근 실패 목록만 확인

### 7. 장기 리스크(참고)

- 생성은 동기 long-running일 수 있음. timeout budget은 `qualityMeta.researchCenter.timings`와 경고 코드로 관측하고, job queue 전환은 후속 과제로 남긴다.

## 자동 스크립트

- `apps/web/scripts/research-center-smoke.ts` — 기본 **dry-run**(환경 변수 이름 수준만 점검). 실제 호출은 `LIVE=1` 및 배포 URL·세션 쿠키가 필요하므로 운영에서만 신중히 사용.

```bash
npm run research-center-smoke --workspace=apps/web
```

## 금지·주의

- 자동 매매/자동 주문 기능을 추가하지 않는다.
- prompt 전문·비밀 값·실제 API 키를 로그/문서/스크립트 출력에 넣지 않는다.
