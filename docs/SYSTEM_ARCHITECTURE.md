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
- `/api/dashboard/today-brief`
  - 오늘의 3줄 브리핑(리스크/성과/행동) 생성
  - 사실 데이터와 제안 문장을 분리하고 confidence/경고를 함께 반환
  - 데이터 부족 시 NO_DATA 문구로 degrade
- `/api/dashboard/profit-goal-summary`
  - 이번달/연간 실현손익과 목표 배분(미배분 포함) 요약
- `/api/portfolio/summary`
  - 개인 콘솔용 확장 요약
  - quote provider 우선순위: Google Sheets `GOOGLEFINANCE` read-back -> Yahoo fallback -> none
  - Google Finance는 직접 API 호출이 아니라 시트 수식 결과 read-back
  - quote/환율 실패 시 평가손익 계산을 생략(NO_DATA)하고 비중만 매입금액 기준 fallback
  - 종목별 `thesisHealthStatus`/`thesisConfidence`를 함께 반환해 대시보드 badge로 사용
- `/api/portfolio/alerts`
  - 목표가/손절가/손실률/비중/시세누락/thesis 약화·깨짐 룰 기반 action feed
  - 경고는 제안이며 자동 매매/자동 주문을 수행하지 않음
- `/api/portfolio/dossier/[symbol]`
  - 종목 단위 dossier(매수 이유·목표/손절·PB/위원회·저널·trend·thesis health) 조회
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
  - 응답 메타: `holdingsTotal`, `holdingsWithGoogleTicker`, `holdingsMissingGoogleTicker`, `refreshedCount`, `missingTickerSymbols` (DB에 `google_ticker` 없으면 시트 행을 만들 수 없음)
- `/api/portfolio/quotes/status`
  - 시트 read-back 상태/지연 상태 점검
  - 종목별 `googleTicker/rawPrice/parsedPrice/rowStatus` 진단 제공
  - mismatch 종목 ticker 보정 전/후 확인
- `/api/portfolio/ticker-resolver/refresh|status|apply`
  - `portfolio_quote_candidates` 탭에 `GOOGLEFINANCE` 후보 수식을 쌓고 read-back으로 검증
  - **자동 DB 저장 없음** — 적용은 `apply`에서 사용자가 명시적으로 승인할 때만 `google_ticker`/`quote_symbol` 반영
  - `status` 응답의 추천 항목에 **검증 전 기본 후보**(`defaultApplyCandidate`, `canApplyDefaultBeforeVerification`)를 포함할 수 있음 — Sheets가 `pending`이어도 사용자가 UI에서 「검증 전 기본 추천 적용」으로 저장 가능 (여전히 버튼 승인 필요, `verified` 아님)
- `/api/portfolio/ticker-resolver/apply-bulk`
  - 사용자가 승인한 항목만 일괄 저장 (부분 실패 허용, `failedItems` 반환)
  - `items[].source`: `verified_googlefinance`(기본) | `default_unverified` — 후자는 GOOGLEFINANCE 검증 전 규칙 기반 저장이며, 응답 `warnings`로 안내
- `/api/portfolio/watchlist/[id]` (PATCH)
  - 관심종목 메타 + `google_ticker`/`quote_symbol` 수동 보정
- 기존 투자 도구 API
  - `/api/private-banker/message`
  - `/api/committee-discussion/*`
  - `/api/trend/generate`
  - `/api/research-center/generate`
  - `/api/trade-journal/*`
  - `/api/trade-journal/pattern-analysis`
    - 반복 투자 실수 패턴과 현재 위험 매칭을 요약
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
- `thesis health`는 rule+텍스트 기반 휴리스틱 평가이며 사실(Fact)과 판단(Interpretation)을 분리해 표시한다.
- `/portfolio`의 quote recovery 패널은 상태 머신(`needs_ticker_candidates` → `quote_ready`) 기반으로 다음 조치 버튼을 안내한다.
- confidence 의미:
  - `high`: 다중 출처 신호/기록이 일치
  - `medium`: 일부 출처만 일치
  - `low`: 원장 메모 또는 단일 출처 기반 추정

