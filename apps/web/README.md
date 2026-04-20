# `apps/web` — Office Unify 웹 앱

Next.js(App Router) + TypeScript + Tailwind입니다. **저장소 루트(`../..`)의 `README.md`**에 모노레포 구조·배포·Supabase·환경 변수 전체가 정리되어 있습니다.

## 이 폴더에서 하는 일

- **Dev Assistant** (`/`): Flow/ Mermaid, SQL, TypeScript 생성 — Gemini는 UI 설정 또는 서버 `GEMINI_API_KEY` 사용.
- **Persona chat**, **Private Banker**, **투자위원회**, **포트폴리오 원장** 등: Supabase + 서버 API 라우트.

## 로컬 실행

저장소 **루트**에서:

```bash
cd ../..
npm install
npm run dev
```

`apps/web`만 열어 `npm install` 하면 workspace 패키지가 없어 실패합니다.

## 환경 변수

`apps/web/.env.local` (Git 무시). 키 목록은 **루트 `README.md`** 참고.

## Windows 트러블슈팅

```powershell
npm run clean:win   # apps/web 전용 — .next / node_modules 정리
```

- `EPERM` / `ENOTEMPTY`: 프로세스 종료 후 `clean:win` → `npm install` 재시도
- `ERR_SSL_CIPHER_OPERATION_FAILED`: 프록시/네트워크·registry 확인

## localStorage (Dev Assistant)

- `dev_assistant_settings`: API Key 등(설정 모달)
- 기타 초안·최근 결과·피드백 키 — 상세는 기존 주석/코드 참고

민감 정보는 공용 PC에서 사용 후 설정에서 초기화를 권장합니다.

## Mermaid 렌더 안정화 파이프라인 (Flow)

Flow 결과는 프롬프트 지시만 신뢰하지 않고 앱에서 아래 방어 단계를 거칩니다.

1. `extractMermaid(raw, jsonField)`
   - JSON `mermaidCode`, markdown mermaid fence, 본문 내 `flowchart|graph|...` 선언 시작점을 순서대로 탐색합니다.
2. `sanitizeMermaid(extracted)`
   - 코드펜스/불필요 설명문 제거, 선언 누락 시 `flowchart TD` 보정, 라벨 위험 문자 정리, 빈/깨진 라인 정리.
3. `validateMermaid(sanitized)`
   - 렌더 전 `mermaid.parse(...)` 사전 검증.
4. `render or fallback`
   - 검증 실패 시 사용자 화면은 폭탄 에러 대신 fallback 카드 + sanitize된 원문을 표시합니다.

### 실패 시 사용자 UX

- 제목: `Flow 이미지를 생성하지 못했습니다`
- 안내 문구: 문법 문제로 이미지 대신 원문 표시
- 원문 펼침(accordion) 제공
- 개발 모드에서는 raw 원문도 확인 가능
- `수정 요청에 붙여넣기용 Mermaid 복사` 버튼으로 재요청 UX 연결

### 운영 로그 포인트

브라우저 콘솔에서 아래 prefix를 확인합니다.

- `MERMAID_EXTRACT_START`
- `MERMAID_EXTRACT_RESULT`
- `MERMAID_SANITIZE_APPLIED`
- `MERMAID_PARSE_OK`
- `MERMAID_PARSE_FAIL`
- `MERMAID_RENDER_OK`
- `MERMAID_RENDER_FAIL`
- `MERMAID_RENDER_FALLBACK`

로그에는 `requestId`, 원문/추출/보정 길이, 추정 타입, parse/render 단계, error(line/column 가능 시)를 남기며 원문 전체는 남기지 않고 truncate된 샘플만 기록합니다.

### 검증용 fixture

`apps/web/lib/mermaid/fixtures.ts`에 아래 8개 수동 검증 케이스를 유지합니다.

- 정상 flowchart
- "다이어그램은 지원되지 않습니다" 같은 비정형 응답
- 자연어 설명 혼합
- 괄호/콜론/세미콜론이 많은 라벨
- 끊긴 화살표
- 선언 누락
- 완전 빈 입력
- SQL/TS/Flow 혼합 장문에서 Mermaid 추출

## Mermaid 2차 안정화 (과보정 방지 + 자동 테스트)

1차 조치 이후 남은 리스크를 줄이기 위해 아래를 추가했습니다.

- `apps/web/lib/mermaid/pipeline.test.ts`로 fixture 기반 자동 테스트 10개 이상을 실행 가능 상태로 승격
- sanitize를 `diagramType` 기준 분기:
  - 공통: 코드펜스 제거, 줄바꿈 정리, smart quote 치환
  - flowchart 전용: 깨진 화살표 제거, 라벨 최소 안전화
  - 비-flowchart(`sequenceDiagram`, `erDiagram`, `classDiagram` 등): 보수적 정제(정상 문법 보존)
- parse 성공/실패와 render 성공/실패 로그를 분리해 운영 추적 가능성 강화
- fallback 영역에 dev 전용 `Mermaid Debug Panel` 추가(raw/extracted/sanitized/parse/render 상태)
- 모바일에서도 원문 박스가 깨지지 않도록 `overflow-x-auto`/`max-w-full` 기반으로 유지

### 모바일 fallback 점검 포인트

- 화면 폭 360px 기준으로 fallback 카드 문구 줄바꿈이 깨지지 않는지
- sanitize 원문 코드 박스가 가로 스크롤로만 넘치고 레이아웃을 밀어내지 않는지
- 실패 상태에서 PNG 버튼 비활성 유지, TXT/MD 저장은 정상 동작하는지

## Committee Followups 운영 보드 (Phase 2)

- 경로: `/committee-followups`
- 역할: 저장된 위원회 후속작업(`committee_followup_items`) 운영/상태 추적
- 제공 기능:
  - 목록 조회 + 필터(status/priority/itemType) + 검색(q) + 정렬(sort)
  - 상세 조회 + artifact 확인
  - 상태 전이 PATCH(서버 검증)
  - 재분석 준비 payload 생성(`/api/committee-discussion/followups/:id/reanalyze-prep`)
  - 실제 재분석 실행(`/api/committee-discussion/followups/:id/reanalyze`) + 결과 artifact 누적 저장

원칙:

- 조일현 Markdown(`report`)은 사람용 문서, 후속작업 운영은 별도 계층
- 자동 주문/자동 매매/원장 자동 반영 금지
- 저장된 항목만 운영 보드에서 관리
- reanalyze는 사용자가 버튼을 눌렀을 때만 실행되며 자동 상태 변경은 하지 않음
