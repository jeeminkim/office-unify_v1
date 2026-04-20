import type { InfographicSpec } from '@office-unify/shared-types';

/** K-엔터 시황형 디자인 회귀: 막대 중심·수치 카드·MarketOpinionExport·PNG 경고 최소화 검증용 */
export const K_ENTERTAINMENT_MARKET_COMMENTARY_REGRESSION_TEXT = `K-엔터 시황: 목표주가 하향과 리스크 재평가
증권사들이 보수적으로 재조정한 가운데 하이브 목표주가가 15.6% 하향, YG는 13.3% 하향으로 정리됐다.
업계 내 최대 하향폭은 18.8% 수준으로, 단기 수급보다 구조적 우려(세대교체 리스크, 인적 리스크)가 부각된다.

체크포인트:
- 음원/콘서트 모멘텀 대비 영업이익 변동성
- 해외 투어·IP 확장의 지속성
- 주요 인력 이슈에 따른 프로젝트 지연 가능성

시사점:
낙관/비관을 가르기보다 하향폭이 큰 종목부터 근거와 리스크를 분리해 점검하는 편이 안전하다.`;

/** 수동/테스트용 고정 스펙: 실제 LLM 출력과 다를 수 있으나 export 레이아웃 회귀 기준으로 사용 */
export const K_ENTERTAINMENT_MARKET_REGRESSION_SPEC: InfographicSpec = {
  title: 'K-엔터: 목표가 하향과 리스크 재평가',
  subtitle: '시황 브리프 (회귀 기준 스펙)',
  industry: 'K-엔터',
  summary:
    '목표주가 하향이 이어지며 세대교체·인적 리스크가 부각된다. 하이브 15.6%·YG 13.3% 하향, 업계 최대 하향폭 약 18.8%로 정리.',
  zones: [
    {
      id: 'input',
      name: '문제의식',
      items: ['목표가 하향 속도', '수급 대비 펀더멘털', '이벤트 일정'],
      visualKeywords: ['하향', '변동성'],
    },
    {
      id: 'production',
      name: '핵심 주장',
      items: ['구조적 우려가 단기 모멘텀을 압도', '종목별 편차 확대'],
      visualKeywords: ['리스크', '편차'],
    },
    {
      id: 'distribution',
      name: '쟁점/반론',
      items: ['해외 성장 스토리 지속성', '밸류 조정 범위'],
      visualKeywords: ['성장', '밸류'],
    },
    {
      id: 'demand',
      name: '시사점',
      items: ['근거·리스크 분리 점검', '이벤트 전후 변동성 관리'],
      visualKeywords: ['점검', '모니터링'],
    },
  ],
  flows: [
    { from: 'input', to: 'production', type: 'data', label: '시그널' },
    { from: 'production', to: 'demand', type: 'capital', label: '시사' },
  ],
  lineup: [
    { name: '하이브', category: '리더', note: '목표가 하향 15.6%·IP 라인업 점검' },
    { name: 'YG', category: '중형', note: '13.3% 하향·프로젝트 일정 리스크' },
    { name: 'JYP', category: '중형', note: '상대적 방어·밸류 디스카운트 완화 여부' },
  ],
  comparisons: [
    { label: '목표주가 하향 최대폭', value: '18.8%', note: '업계 범위' },
    { label: '하이브 하향폭', value: '15.6%', note: '' },
    { label: 'YG 하향폭', value: '13.3%', note: '' },
  ],
  risks: [
    { title: '세대교체 리스크', description: '신인 대비 기존 라인업 성장세 둔화 우려' },
    { title: '인적 리스크', description: '핵심 인력 이탈·프로젝트 지연 가능성' },
  ],
  charts: {
    bar: [
      { label: '하이브', value: 15.6 },
      { label: 'YG', value: 13.3 },
      { label: 'JYP', value: 9.2 },
    ],
    pie: [{ label: '점유', value: null }],
    line: [{ label: 't1', value: 1 }],
  },
  notes: ['하향폭이 큰 종목부터 근거 분리', '실적 시즌 가이던스 확인'],
  warnings: [
    'PNG_EXPORT_REGRESSION: 이 경고 문구는 기본 PNG에 노출되면 안 됩니다( showExportDebug=false ).',
  ],
  sourceMeta: {
    sourceType: 'pasted_text',
    generatedAt: '2026-04-20T12:00:00.000Z',
    confidence: 'medium',
    articlePattern: 'market_commentary',
    resultMode: 'market_checkpoint_map',
    extractionMode: 'llm_direct',
    parseStage: 'strict_ok',
  },
};

export const CYBERSECURITY_REGRESSION_TEXT = `2026 사이버 보안 위협 보고서 요약
설문 대상: 국내외 보안 담당자 총 667명

주요 위협 인식:
AI 기반 피싱: 81.2%
랜섬웨어 고도화: 76.4%
클라우드 설정 오류: 62.5%
계정 탈취 및 권한 오남용: 58.1%

우선 대응 과제:
1순위: 권한 통제 체계(RBAC/ABAC) 재정비
2순위: EDR + CNAPP 통합 운영
3순위: 사고 대응 훈련 및 복구 자동화

운영 관제 이슈:
탐지 이벤트 급증으로 인한 분석 피로도 증가
MFA 미적용 계정의 위험 노출
서드파티 공급망 취약점 점검 미흡

도입/구축 현황:
AI Guardrail 도입 조직 비중: 44.0%
Red Team 시뮬레이션 정기 수행: 31.6%
클라우드 자산 가시화 체계 구축: 53.7%

적용 산업:
금융, 공공, 제조, 헬스케어 중심으로 보호 수요 확대
데이터 보호와 규제 대응 역량이 도입 의사결정에 큰 영향`;

export const OPINION_EDITORIAL_REGRESSION_TEXT = `칼럼: 지금 시장의 AI 기대는 과열인가
개인적으로 지금의 밸류에이션은 성장 기대를 너무 빠르게 반영하고 있다고 본다.
핵심 주장: 단기 기대와 장기 실적의 간극이 커지고 있다.

근거:
- 상위 3개 종목으로 거래가 과도하게 집중되고 있다.
- 매출 성장률은 유지되지만 이익률 개선 속도는 둔화 신호가 보인다.
- 신규 진입 기업의 차별화 포인트가 약해지고 있다.

반론/쟁점:
- AI 인프라 투자는 아직 초기라 추가 확장 여지가 크다는 의견도 있다.
- 정책/금리 변화가 오히려 대형 성장주에 유리하다는 시각도 있다.

체크포인트:
1) 분기 실적에서 현금흐름이 동반 개선되는지
2) 수요가 특정 고객군에 과도하게 의존하는지
3) 공급망 병목이 재발하는지

시사점:
지금은 확신보다 점검이 우선이며, 낙관/비관 어느 한쪽으로 고정하기보다 데이터 기반 재확인이 필요하다.`;

export const MARKET_COMMENTARY_REGRESSION_TEXT = `시황 코멘트: 금리와 수급이 테마 회전을 주도하는 구간
이번 주 시장은 정책 기대와 수급 변화가 동시에 작용했다.
테마 확산은 빨랐지만 지속성은 아직 확인이 필요하다.

주요 신호:
- 장기 금리 안정 구간에서 성장주 수급이 유입
- 환율 변동성 완화로 외국인 매수 강도 회복
- 2차전지/반도체/방산 순환매 빈도 증가

리스크:
- 매크로 지표 재악화 시 변동성 확대 가능
- 실적 미달 기업의 밸류에이션 조정 압력
- 이벤트성 뉴스에 따른 과매수/과매도 반복

체크포인트:
1순위: 금리 경로 재확인
2순위: 거래대금 집중도 점검
3순위: 실적 발표 시즌 가이던스 추적

대응 관점:
시장 방향성 단정 대신, 신호-리스크-체크포인트를 분리해 모니터링하는 접근이 유효하다.`;

export const SEMICONDUCTOR_REPORT_REGRESSION_TEXT = `반도체 산업 리포트 요약
핵심 포인트: AI 서버 수요 확대로 HBM/첨단 패키징 수요가 동반 증가.
위험 요인: 고객사 CAPEX 지연, 지정학 리스크, 재고 조정 장기화.
수요 비중: AI 서버 42%, 모바일 25%, 자동차 18%, 기타 15%.
체크포인트: 수율 개선, 재고일수 정상화, 고객사 가이던스 상향 여부.`;

export const HEALTHCARE_INSTITUTIONAL_REGRESSION_TEXT = `헬스케어 인사이트 브리프
임상 단계별 성공률 편차가 수익성에 직접 영향.
규제 승인 지연 리스크와 생산 품질 이슈가 동시 관리 대상.
우선 과제:
1) 임상 데이터 품질 관리 체계 강화
2) 제조/공급망 이중화
3) 보험자/병원 채널 협업 확대
주요 리스크: 승인 지연, 원가 상승, 환자 접근성 격차.`;

export const MIXED_DOCUMENT_REGRESSION_TEXT = `이번 글은 업계 소식, 개인 의견, 광고성 문구가 섞여 있습니다.
개인적으로는 지금이 기회라고 보지만, 사실상 데이터는 아직 충분하지 않습니다!!!
[광고] 구독과 좋아요 부탁드립니다.
시장 요약: 금리 변화와 수급이 혼재되어 단기 변동성이 큽니다.
어떤 분은 강세, 어떤 분은 약세를 주장합니다.
정리하면 명확한 결론보다는 추가 점검이 필요합니다.`;
