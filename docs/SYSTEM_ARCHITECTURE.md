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
- `/realized-pnl` : 실현손익 대시보드(기간/종목/이벤트)
- `/financial-goals` : 목표 자금 관리(목표 생성/배분/달성률)

## 서버 API 계층

- `/api/system/status`
  - env/DB 접근 진단
  - secret 값은 반환하지 않고 존재 여부만 반환
- `/api/dashboard/overview`
  - 홈 대시보드 집계
  - NO_DATA / fallback 상태를 명시
- `/api/portfolio/summary`
  - 개인 콘솔용 확장 요약
  - quote provider 우선순위: Google Sheets `GOOGLEFINANCE` read-back -> Yahoo fallback -> none
  - Google Finance는 직접 API 호출이 아니라 시트 수식 결과 read-back
  - quote/환율 실패 시 평가손익 계산을 생략(NO_DATA)하고 비중만 매입금액 기준 fallback
- `/api/portfolio/holdings`
  - 보유/관심 목록 조회
- `/api/portfolio/holdings/[id]`
  - 보유 종목 빠른 수정(PATCH) / 삭제(DELETE)
  - `google_ticker`/`quote_symbol` 수동 보정 저장
- `/api/portfolio/holdings/apply-trade`
  - buy/sell/correct 사후 반영(주문 실행 아님)
  - sell 반영 시 실현손익 이벤트 자동 기록(손실 포함)
- `/api/portfolio/quotes/refresh`
  - 시세 시트 row/formula 동기화 요청 (지연 반영)
  - 응답에 권장 재조회 시간(약 60초) 포함
- `/api/portfolio/quotes/status`
  - 시트 read-back 상태/지연 상태 점검
  - 종목별 `googleTicker/rawPrice/parsedPrice/rowStatus` 진단 제공
  - mismatch 종목 ticker 보정 전/후 확인
- 기존 투자 도구 API
  - `/api/private-banker/message`
  - `/api/committee-discussion/*`
  - `/api/trend/generate`
  - `/api/research-center/generate`
  - `/api/trade-journal/*`
- `/api/realized-pnl/summary`
  - 기간별/종목별 실현손익 집계 + 목표 배분/미배분 집계
- `/api/realized-pnl/events`
  - 실현손익 이벤트 CRUD
- `/api/financial-goals`
  - 목표 CRUD
- `/api/financial-goals/[id]/allocations`
  - 목표 배분 생성(실현손익/수동현금/조정)

## 출력 형식 검증

- PB/위원회 출력은 프롬프트에만 의존하지 않고 서버 후처리 검증을 수행한다.
- 누락 섹션이 있으면 최대 1회 형식 보정으로 섹션 placeholder를 추가한다.
- 판단 내용 자체를 변경하지 않고 형식 누락만 보정한다.

## 데이터 품질 원칙

- 자동 매매/자동 주문/원장 자동 수정 금지
- 실현손익은 외부 거래 체결 후 사용자 입력 기준
- 목표 배분은 자금 흐름 추적용 기록이며 실제 계좌 이체가 아님
- 시세가 없으면 추정값 생성 금지
- 시세 상태 진단은 `/api/portfolio/quotes/status`에서 확인하고, refresh 직후 계산 지연을 고려한다.
- ticker 우선순위는 `google_ticker` -> `quote_symbol` -> 자동 후보이며, KR mismatch 시 수동 override를 권장한다.
- 계산 불가 항목은 `undefined/null + warning`으로 반환
- 메모리/시트/테이블 미설정 시 기능 전체 중단 대신 섹션 단위 경고로 degrade
- PB/위원회/Trend/Research 결과 화면은 outputQuality/model usage badge를 함께 표시
- 전량 매도 시 보유 제거 후 선택적으로 watchlist 이동 가능

