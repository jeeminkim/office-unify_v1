# Infographic Generator (MVP)

## 개요

`/infographic`은 블로그 분석 글, 증권사 리포트, 사용자가 붙여넣은 원문/URL/PDF를 바탕으로
산업 구조 인포그래픽을 생성하는 무상태(MVP) 기능이다.

핵심 원칙:

- 생성형 이미지 모델에 텍스트 렌더링을 맡기지 않는다.
- `정제(JSON)`와 `렌더링(SVG)`를 분리한다.
- 숫자가 없으면 추정 생성하지 않고 `null/unknown/empty`를 허용한다.
- DB 저장 없이 미리보기 + PNG 저장까지만 제공한다.

## 데이터 흐름

1. 사용자 입력: `industryName`, `sourceType(text|url|pdf_upload|pdf_url)`
2. API: `POST /api/infographic/extract`
3. 서버:
   - 입력 검증/길이 제한/파일 크기 제한
   - sourceType별 본문 추출
     - `text`: rawText 그대로
     - `url`: HTML fetch 후 본문 텍스트 추출
     - `pdf_upload`/`pdf_url`: 텍스트 레이어 PDF 파싱(OCR 미포함)
   - LLM JSON 추출 (`ai-office-engine`)
   - normalize + validation
4. 클라이언트:
   - `원문 추출` -> `미리보기/수정` -> `구조화 요약 생성` 2-step
   - `responsive` 읽기 뷰(모바일 우선)
   - `export` A4 SVG 뷰(저장용)
   - PNG 저장
   - JSON 디버그 패널(접기/펼치기)

## API

- `POST /api/infographic/extract-source-text`
  - sourceType 기반 원문 추출 전용
  - URL/PDF 입력의 추출 결과를 preview/edit 단계로 전달
  - 내부 처리: `raw extract -> cleanup -> cleaned text`
  - cleanup 결과 요약(strip) 제공: 반복 헤더 제거, 노이즈 라인 정리, 문단 병합 등
- `POST /api/infographic/extract`
  - 최종 텍스트를 받아 `InfographicSpec` 생성

## JSON 스키마 핵심

`InfographicSpec` (shared-types):

- 메타: `title`, `subtitle`, `industry`, `summary`, `sourceMeta`
`sourceMeta` 확장:

- `sourceType`
- `sourceUrl?`
- `sourceTitle?`
- `extractionWarnings?`
- `extractedTextLength?`
- `cleanupApplied?`
- `cleanupNotes?`
- `rawExtractedTextLength?`
- `cleanedTextLength?`
- `generatedAt`
- `confidence`

- 산업 존(고정 4개): `input`, `production`, `distribution`, `demand`
- 흐름: `flows[]` (`goods|data|capital|service|energy|unknown`)
- 보조 패널: `lineup`, `comparisons`, `risks`, `notes`, `warnings`
- 차트: `charts.bar`, `charts.pie`, `charts.line`

### fallback 원칙

- 누락 zone은 기본 4개 템플릿으로 복구
- 차트 값이 없으면 빈 배열 또는 `value: null`
- 추정/가짜 수치 금지
- fallback 발생 시 `warnings`에 사유 기록
- URL/PDF 본문 추출 실패 또는 본문 과소 추출 시 `extractionWarnings` 기록
- cleanup 적용 시 `cleanupNotes`에 적용 규칙을 기록
- UI는 기본적으로 cleaned text를 보여주고, raw text는 접기 패널에서만 노출한다.

## 렌더 모드 정책

- 모바일(좁은 viewport) 초기 모드: `responsive`
- 데스크톱(넓은 viewport) 초기 모드: `export`
- `responsive`: 읽기 UX 중심
- `export`: PNG 저장 기준 레이아웃
- PNG 저장은 항상 export 기준으로 수행
- 모바일에서는 `저장용 미리보기` 액션으로 export 레이아웃을 확인한다.
- 저장용 미리보기에서 "이 화면이 PNG로 저장됩니다." 안내 후 저장을 수행한다.

## PNG 저장 방식

- 렌더 결과는 단일 SVG (`InfographicCanvas`)
- `XMLSerializer`로 SVG 문자열화
- `canvas`에 2x 스케일로 draw 후 PNG 다운로드
- 한글 가독성을 위해 단색 배경 + 고정 폰트 크기 + 줄바꿈 유틸 사용

## 한계와 주의사항

- MVP는 템플릿 1종(A4 세로 비율) 고정
- 복잡한 업종별 도식 프리셋은 미포함
- 장문 원문은 API에서 길이 제한(trim) 적용
- PDF는 텍스트 레이어 중심 파싱이며 OCR 미지원
- 결과 저장/히스토리/재호출은 2차 범위

## 추후 2차 범위

- 결과 스냅샷 DB 저장 + 히스토리
- 업종 프리셋(반도체/우주/배터리 등) 세분화
- 멀티 페이지 출력
- 차트 단위 근거(source span) 연결

