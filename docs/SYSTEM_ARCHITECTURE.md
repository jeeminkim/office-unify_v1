# System Architecture (Personal Investment Console)

## 목적

`office-unify_v1`를 단일 사용자 개인 투자 콘솔로 운영할 때의 핵심 경로를 정리한다.

## 메인 화면 구조

- `/` : 개인 투자 대시보드
  - 시스템 상태 요약
  - 포트폴리오 요약
  - Trend/Research 기억 요약
  - 하루 10분 루틴
  - 포트폴리오-신호 연결
- `/dev-assistant` : 기존 개발 보조 기능 분리 진입점
- `/portfolio` : 포트폴리오 현황 대시보드(점검 전용)
- `/portfolio-ledger` : 보유 종목 관리/원장 반영(사후 기록 반영 전용)

## 서버 API 계층

- `/api/system/status`
  - env/DB 접근 진단
  - secret 값은 반환하지 않고 존재 여부만 반환
- `/api/dashboard/overview`
  - 홈 대시보드 집계
  - NO_DATA / fallback 상태를 명시
- `/api/portfolio/summary`
  - 개인 콘솔용 확장 요약
  - Yahoo quote + `KRW=X` 환율 조회를 우선 사용
  - quote/환율 실패 시 `dataQuality.quoteAvailable=false` 및 warning으로 degrade
- `/api/portfolio/holdings`
  - 보유/관심 목록 조회
- `/api/portfolio/holdings/[id]`
  - 보유 종목 빠른 수정(PATCH) / 삭제(DELETE)
- `/api/portfolio/holdings/apply-trade`
  - buy/sell/correct 사후 반영(주문 실행 아님)
- 기존 투자 도구 API
  - `/api/private-banker/message`
  - `/api/committee-discussion/*`
  - `/api/trend/generate`
  - `/api/research-center/generate`
  - `/api/trade-journal/*`

## 출력 형식 검증

- PB/위원회 출력은 프롬프트에만 의존하지 않고 서버 후처리 검증을 수행한다.
- 누락 섹션이 있으면 최대 1회 형식 보정으로 섹션 placeholder를 추가한다.
- 판단 내용 자체를 변경하지 않고 형식 누락만 보정한다.

## 데이터 품질 원칙

- 자동 매매/자동 주문/원장 자동 수정 금지
- 시세가 없으면 추정값 생성 금지
- 계산 불가 항목은 `undefined/null + warning`으로 반환
- 메모리/시트/테이블 미설정 시 기능 전체 중단 대신 섹션 단위 경고로 degrade
- PB/위원회/Trend/Research 결과 화면은 outputQuality/model usage badge를 함께 표시
- 전량 매도 시 보유 제거 후 선택적으로 watchlist 이동 가능

