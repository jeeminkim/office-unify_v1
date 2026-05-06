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
- 모바일은 `reader-first / export-second`를 강제한다:
  - 기본 화면은 responsive reader만 노출
  - export inline 기본 노출 금지
  - `저장용 미리보기`, `PNG 저장` 액션에서만 export 레이아웃을 연다
- 저장용 미리보기는 lazy 렌더를 허용한다.

## Export 템플릿 분기 (저장본 전용)

클라이언트 `resolveExportTemplate(articlePattern, resultMode)`가 PNG/SVG 레이아웃을 선택한다 (추출기와 독립).

| 템플릿 | 대상 문서 성격(대표) | 특징 |
|--------|---------------------|------|
| `IndustryStructureExport` | `industry_report`, `company_report`, `thematic_analysis` 또는 `mixed_or_unknown`+`industry_structure` | 4-zone 비중·외곽 flow 레인·플레이어/차트 하단 |
| `MarketOpinionExport` | `market_commentary`, `opinion_editorial`, `how_to_explainer`, 기타 mixed→시황/논점 계열 | 상단 요약+**핵심 수치 카드**(원문 숫자 기반)·4-block·번호형 흐름 요약·화살표 최소화 |

화면 상단( SVG 밖)에 `저장 템플릿: …` 스트립으로 선택 결과를 표시한다(PNG에는 포함되지 않음).

## 차트 auto-compact (`computeChartPolicy`)

유효한 막대/원형/선형 데이터 개수에 따라 `none | single_focus | dual_split | full_three`를 적용한다.

- 막대: 라벨+유효 숫자
- 원형: 양수 값만
- 선형: 유효 점 **2개 이상**일 때만 슬롯 사용(그렇지 않으면 export에서 생략)

빈 '데이터 없음' 상자는 export에서 가급적 그리지 않는다(`SimplePieChart`/`SimpleLineChart`의 export 모드).

모바일 responsive reader 정책:

- 유효 차트만 기본 노출(최대 1개)
- 데이터 없는 차트/박스는 기본 비노출
- 나머지는 `차트 더 보기` 접기 패널로 접근

## Export 텍스트 compact

- `ZoneCard`의 `variant="export"`: 항목 수·줄 수·키워드 줄 수 축소
- 플레이어/리스크/메모: `exportLayout`의 길이 상한·둘째 줄 제한

## PNG 디버그 최소화

- `InfographicCanvas`의 `showExportDebug`(기본 `false`): 끌 때 SVG 하단의 장문 `warnings`·상세 `sourceMeta` 스트립을 숨기고 `office-unify · 날짜`만 남긴다.
- 품질 배지(예: 복구 추출, 자동 보정, 차트 일부 생략)는 최대 2개.

## Extractor Hardening (긴 본문/도메인 편차 대응)

- source extraction 성공 이후 `text -> InfographicSpec` 실패를 줄이기 위해 추출 단계 강화:
  - `llm_direct`
  - `llm_repaired`
  - `semantic_fallback`
  - `degraded_fallback`
- parse pipeline:
  - raw trim / fence 제거
  - first JSON candidate
  - strict parse
  - repair parse(smart quote, trailing comma, stray backslash, tail cut)
  - semantic fallback
- domain-aware zone mapping:
  - 제조업형 + 소프트웨어/클라우드/보안형 해석 가이드를 prompt에 포함
  - `sourceMeta.industryPattern` 및 `zoneAliases`로 해석 맥락을 유지
- numeric salvage:
  - `%`, 순위, `라벨: 수치` 패턴을 규칙 기반 추출
  - chart/comparison 복구 시 원문 수치만 사용(추정 생성 금지)
- minimum viable spec 기준:
  - 4개 zone 중 3개 이상 실질 item
  - risks 3개 이상
  - comparisons 또는 charts 존재
  - notes 2개 이상 + summary non-empty
- 기준 미달 시 `degraded_fallback`으로 분류하고 빈 인포그래픽 렌더 대신 재시도 안내를 우선한다.

## Article-aware / Opinion-aware 확장

- `industryPattern`(산업 맥락)과 `articlePattern`(문서 성격)을 분리해 처리한다.
  - industryPattern: 제조/보안/헬스/금융/소비재 등 도메인 힌트
  - articlePattern: 리포트형/의견형/시황형/테마형/가이드형
- 의견형(`opinion_editorial`) 및 시황형(`market_commentary`)은 opinion frame을 우선 추출:
  - `thesis`, `supportingPoints`, `counterPoints`, `risks`, `checkpoints`, `signals` 등
  - 이후 4-zone 템플릿으로 매핑해 렌더 호환을 유지
- 표현 중립화 원칙:
  - 감정적 수사/과장/메타 발언은 cleanup 단계에서 완화
  - 원문 근거 없는 주장 생성 금지
- quality meta:
  - `articlePattern`, `sourceTone`, `subjectivityLevel`, `structureDensity`
  - `extractedClaimsCount`, `extractedSignalsCount`, `extractedRisksCount`

## 사용자 override / 재시도 제어

- 입력 UI에서 자동 분류를 직접 교정할 수 있다:
  - `articlePatternOverride`
  - `industryPatternOverride`
- 기본은 자동 감지 결과를 표시하고, 수동 지정 시 override가 extractor 우선값으로 사용된다.
- `Reset to auto`로 자동 모드 복귀 가능.

## Degraded fallback reason

- degraded fallback 시 단순 실패가 아니라 reason classifier를 함께 반환:
  - `insufficient_structure`
  - `mixed_document`
  - `too_long_and_diffuse`
  - `weak_numeric_support`
  - `weak_zone_signal`
  - `opinion_structure_unclear`
- UI는 reason별 행동 가이드를 제공하고, 재시도/텍스트 축약/패턴 전환 CTA를 노출한다.

## Result Mode

- 최종 구조화 결과 유형을 `sourceMeta.resultMode`로 표시:
  - `industry_structure`
  - `opinion_argument_map`
  - `market_checkpoint_map`
  - `howto_process_map`
  - `mixed_summary_map`

## PNG 저장 방식

- 렌더 결과는 단일 SVG (`InfographicCanvas`; 내부적으로 위 export 템플릿 중 하나)
- `XMLSerializer`로 SVG 문자열화
- `canvas`에 2x 스케일로 draw 후 PNG 다운로드
- 한글 가독성을 위해 단색 배경 + 고정 폰트 크기 + 줄바꿈 유틸 사용

## 한계와 주의사항

- MVP는 템플릿 1종(A4 세로 비율) 고정
- 복잡한 업종별 도식 프리셋은 미포함
- 장문 원문은 API에서 길이 제한(trim) 적용
- PDF는 텍스트 레이어 중심 파싱이며 OCR 미지원
- 결과 저장/히스토리/재호출은 2차 범위

## 운영 로그(선택)

- 기본 원칙은 DB 비저장이지만, 품질 회귀 추적을 위해 `web_ops_events`를 보조적으로 사용할 수 있다.
- 코드 후보:
  - `infographic_degraded_fallback`
  - `infographic_weak_numeric_support`
  - `infographic_export_render_failed`
- 결과 데이터 자체 저장과 운영 로그 기록은 다른 책임이다(로그는 품질 추적용).

## 회귀 테스트 운영 포인트

- `resultMode` / `articlePattern` / `industryPattern` 조합별 fixture 회귀를 유지한다.
- 입력 유형(text/url/pdf)별 degraded 비율을 추적해 prompt/cleanup 회귀를 조기 탐지한다.

## 추후 2차 범위

- 결과 스냅샷 DB 저장 + 히스토리
- 업종 프리셋(반도체/우주/배터리 등) 세분화
- 멀티 페이지 출력
- 차트 단위 근거(source span) 연결

## 모바일 수동 QA 시나리오

- 모바일 viewport에서 `/infographic` 진입 시 responsive reader 기본 진입 확인
- `저장용 미리보기`/`PNG 저장` 버튼으로만 export 접근 가능한지 확인
- 기본 화면에서 zone/플레이어/리스크/차트 과밀도가 줄었는지 확인
  - zone 항목 기본 3개
  - notes 기본 2개
  - 리스크는 제목 + 1줄 설명
  - 플레이어 설명은 펼침에서만 확인
- 빈 차트/`데이터 없음` 박스가 기본 화면에 노출되지 않는지 확인
- PNG 저장 결과가 export 레이아웃 기준으로 정상 저장되는지 확인

