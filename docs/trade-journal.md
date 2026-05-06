# Trade Journal (원칙 기반 매매일지)

## 목적

`/trade-journal`은 자동 주문/자동 매매 기능이 아니라, 아래 흐름을 지원한다.

1. 사용자 원칙(checklist) 정의
2. 매매일지 입력 시 원칙 자동 점검
3. PB/페르소나 2차 검토
4. 거래 후 회고 및 누적 분석

역할 구분:

- Trade Journal: 실제 실행한 거래의 원칙 점검/복기
- Decision Journal: 실행하지 않은 판단(관망/보류/미진입) 기록

핵심 원칙:

- 자동 매매/자동 주문/원장 자동 수정 금지
- 체크리스트가 1차 필터
- PB/페르소나는 2차 검토자
- blocking 규칙은 score와 분리 집계
- Today Candidates/ Sector Radar 점수는 체크리스트를 대체하지 않음
- 후보는 관찰 대상이며, 실제 진입 전 Trade Journal 점검이 우선

## API

- `GET /api/investment-principles`
- `POST /api/investment-principles`
- `PATCH /api/investment-principles/:id`
- `POST /api/trade-journal/check`
- `GET /api/trade-journal`
- `POST /api/trade-journal`
- `GET /api/trade-journal/:id`
- `POST /api/trade-journal/review`
- `POST /api/trade-journal/reflection`
- `GET /api/trade-journal/analytics`

## 평가 엔진 요약

- 입력: trade draft + principle set + portfolio holdings(optional)
- 출력:
  - principle별 `met/not_met/unclear/manual_required`
  - 충족률(score)
  - met/total
  - blocking violation count
  - summary

분리 정책:

- 자동 판단 가능 규칙: `blocking_boolean`, `boolean`, `threshold_numeric`, `portfolio_exposure`, `score`
- 수동 판단 규칙: manual_required 또는 unclear

구조 필드 우선순위:

1. `rule_key/target_metric/operator/threshold*` 기반 구조 평가
2. 기존 `rule_text` 휴리스틱
3. 그래도 불명확하면 `manual_required/unclear`

`operator` 처리 방향:

- DB 컬럼명은 호환성을 위해 `operator` 유지
- 코드 레벨에서는 의미를 명확히 하기 위해 `comparisonOperator` alias로 해석
- 지원 연산자: `=`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `not_in`, `exists`, `not_exists`

추가 구조 필드:

- `ruleKey`
- `targetMetric`
- `operator`
- `thresholdValue`
- `thresholdUnit`
- `requiresUserInput`
- `appliesWhenJson`
- `evaluationHint`

## 매수/매도 유형 필드

- `entry_type` (buy 전용)
  - `value_entry`, `trend_follow`, `rebalancing_buy`, `event_driven_buy`, `long_term_accumulate`
- `exit_type` (sell 전용)
  - `target_reached`, `thesis_broken`, `risk_reduction`, `rebalancing_sell`, `stop_loss`, `event_avoidance`
- `conviction_level`
  - `low`, `medium`, `high`

검증:

- buy인데 `exit_type` 입력 시 차단
- sell인데 `entry_type` 입력 시 차단
- conviction_level은 optional이지만 enum 검증 적용

## Review snapshot

`trade_journal_reviews`는 리뷰 생성 시점 스냅샷을 함께 보관한다.

- `entry_snapshot_json`
- `evaluation_snapshot_json`

따라서 이후 원칙/일지가 바뀌어도 기존 review의 판단 근거는 보존된다.

## Analytics KPI (초기 운영)

우선 노출 지표:

1. 평균 checklist 충족률
2. blocking 위반 비율
3. buy vs sell 평균 충족률 차이
4. 가장 자주 위반한 원칙 Top 5
5. reflection에서 자주 나온 실패 패턴 Top 5

세부 지표(예: verdict 분포)는 하단/접기 영역으로 분리한다.

## Today Candidates 연계 원칙

- Today Candidates는 관찰 우선순위 신호이며 실행 지시가 아니다.
- 후보를 실제 거래로 전환하려면 Trade Journal check/review를 반드시 거친다.
- 향후 suitability gate와 연계할 수 있도록 구조 필드/증거 저장을 유지한다.

## ops logging 대상 예시

- check/review/reflection 실패
- principle validation warning
- analytics degraded

## Sell 체크리스트 강화

- sell은 buy보다 보수적으로 점검하며 `exit_type`별 필수 근거를 다르게 본다.
- 핵심 분기:
  - `thesis_broken`: thesis/invalidation 근거
  - `target_reached`: 목표 도달 근거와 조급한 익절 구분
  - `risk_reduction`: 편중/리스크 축소 근거
  - `stop_loss`: 사전 기준 일관성
  - `event_avoidance`: 이벤트 리스크 근거

## 평가 결과 구조화 (`evidence_json`)

`trade_journal_check_results.evidence_json`에 판정 근거를 저장한다.

- `matchedMetric`
- `observedValue`
- `comparisonOperator`
- `thresholdValue`
- `decisionBasis`
- `appliedRuleKey`
- `autoEvaluated`

이 구조는 explanation 텍스트와 함께 저장되며, 향후 위반 패턴 분석/리포트 자동화에 재사용한다.

## Horizon × 타입 검증

- 명백한 오류는 차단:
  - buy + `exit_type`
  - sell + `entry_type`
  - sell 전용 exit_type을 buy에 사용하는 입력
- 다소 어색한 조합은 warning:
  - `long_term_accumulate` + non-`long_term`
  - `trend_follow`/`event_driven_buy` + `long_term`
  - `rebalancing_*` 타입인데 note 미입력

## 검증 시나리오

1. 원칙 저장/수정
- buy/sell/common/risk 원칙 생성
- blocking rule 생성 후 목록 반영 확인

2. 매매일지 점검
- buy entry 입력 후 `POST /api/trade-journal/check`
- 충족률/위반/수동 확인 항목 노출 확인
- blocking 위반 강조 확인

3. 페르소나 검토
- 동일 entry로 `POST /api/trade-journal/review` 호출
- 체크리스트 기반 요약/리스크/next actions/verdict 반환 확인
- blocking 위반 시 강한 경고 포함 확인

4. 회고/누적 분석
- `POST /api/trade-journal/reflection` 저장 확인
- `/api/trade-journal/analytics` 응답에서:
  - 평균 충족률
  - blocking 위반 빈도
  - buy/sell 충족률 차이
  - verdict 분포
  - 실패 패턴

