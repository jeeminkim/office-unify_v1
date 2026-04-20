import type { InfographicSpec } from '@office-unify/shared-types';

const now = new Date().toISOString();

export const SEMICONDUCTOR_SAMPLE_SPEC: InfographicSpec = {
  title: '반도체 산업 구조 인포그래픽',
  subtitle: '원재료에서 최종 수요까지의 공급망 요약',
  industry: '반도체',
  summary:
    '소재·장비 공급 안정성과 파운드리 가동률, 최종 수요(서버/모바일/자동차)의 변동이 산업 사이클을 좌우한다.',
  zones: [
    {
      id: 'input',
      name: '원재료·입력',
      items: ['웨이퍼 소재', '반도체 가스', '노광/식각 장비', 'EDA 툴'],
      visualKeywords: ['고순도', '장비 리드타임', '기술 종속'],
    },
    {
      id: 'production',
      name: '생산·조립',
      items: ['설계(Fabless)', '파운드리 제조', 'OSAT 패키징/테스트'],
      visualKeywords: ['공정 미세화', '수율', 'CAPEX'],
    },
    {
      id: 'distribution',
      name: '유통·운용·네트워크',
      items: ['글로벌 유통', '재고 관리', '클라우드/통신 인프라 공급'],
      visualKeywords: ['재고일수', '채널 믹스', '물류 병목'],
    },
    {
      id: 'demand',
      name: '최종 수요·출력',
      items: ['AI 서버', '스마트폰', '자동차 전장', '산업용 IoT'],
      visualKeywords: ['수요 탄력성', '고객사 CAPEX', '교체 주기'],
    },
  ],
  flows: [
    { from: 'input', to: 'production', type: 'goods', label: '소재/장비 공급' },
    { from: 'production', to: 'distribution', type: 'goods', label: '칩 출하' },
    { from: 'distribution', to: 'demand', type: 'service', label: '납품/통합' },
    { from: 'demand', to: 'production', type: 'capital', label: 'CAPEX 주문 신호' },
    { from: 'distribution', to: 'production', type: 'data', label: '재고/수요 데이터' },
  ],
  lineup: [
    { name: 'TSMC', category: '파운드리', note: '첨단 공정 공급 핵심' },
    { name: '삼성전자', category: '메모리/파운드리', note: '메모리 + 시스템 병행' },
    { name: 'ASML', category: '장비', note: '노광 장비 지배력' },
    { name: '엔비디아', category: '수요/설계', note: 'AI 수요 견인' },
  ],
  comparisons: [
    { label: '메모리 vs 비메모리', value: '사이클 민감도 상이', note: '메모리는 가격 변동성 높음' },
    { label: '첨단공정 진입장벽', value: '매우 높음', note: '기술/자본 집약적' },
  ],
  risks: [
    { title: 'CAPEX 둔화', description: '고객사 투자 축소 시 생산 가동률 하락 가능' },
    { title: '지정학 리스크', description: '핵심 생산 거점 집중에 따른 공급망 충격 가능' },
    { title: '재고 조정', description: '채널 재고 정상화 지연 시 출하 변동 확대' },
  ],
  charts: {
    bar: [
      { label: 'AI 서버', value: 42 },
      { label: '모바일', value: 25 },
      { label: '자동차', value: 18 },
      { label: '산업/기타', value: 15 },
    ],
    pie: [
      { label: '메모리', value: 48 },
      { label: '비메모리', value: 52 },
    ],
    line: [
      { label: 'Q1', value: 100 },
      { label: 'Q2', value: 108 },
      { label: 'Q3', value: 115 },
      { label: 'Q4', value: 111 },
    ],
  },
  notes: ['수요 데이터의 계절성/일회성 이벤트를 분리 해석할 필요'],
  warnings: [],
  sourceMeta: { sourceType: 'pasted_text', generatedAt: now, confidence: 'medium' },
};

export const SPACE_SAMPLE_SPEC: InfographicSpec = {
  title: '우주 산업 구조 인포그래픽',
  subtitle: '발사체·위성·서비스 수요까지의 가치사슬',
  industry: '우주',
  summary:
    '발사체 공급능력, 위성 제조 리드타임, 지상국/데이터 서비스 상용화 속도가 사업성의 핵심 변수다.',
  zones: [
    {
      id: 'input',
      name: '원재료·입력',
      items: ['복합소재', '추진체', '항전 부품', '정밀 가공'],
      visualKeywords: ['신뢰성', '시험 인증', '부품 조달'],
    },
    {
      id: 'production',
      name: '생산·조립',
      items: ['발사체 제작', '위성 버스 제작', '탑재체 통합', '체계 시험'],
      visualKeywords: ['통합 난이도', '시험 일정', '원가 구조'],
    },
    {
      id: 'distribution',
      name: '유통·운용·네트워크',
      items: ['발사 서비스', '지상국 운용', '궤도 운영', '데이터 플랫폼'],
      visualKeywords: ['발사 슬롯', '가동률', '운용 비용'],
    },
    {
      id: 'demand',
      name: '최종 수요·출력',
      items: ['국방/공공', '통신', '지구관측', '내비게이션/물류'],
      visualKeywords: ['장기 계약', '규제', '서비스 신뢰도'],
    },
  ],
  flows: [
    { from: 'input', to: 'production', type: 'goods', label: '핵심 부품 공급' },
    { from: 'production', to: 'distribution', type: 'goods', label: '발사체/위성 인도' },
    { from: 'distribution', to: 'demand', type: 'service', label: '데이터/통신 서비스' },
    { from: 'demand', to: 'production', type: 'capital', label: '프로젝트 예산/계약' },
    { from: 'distribution', to: 'demand', type: 'data', label: '관측 데이터 전달' },
  ],
  lineup: [
    { name: 'SpaceX', category: '발사', note: '발사 빈도와 비용 경쟁력' },
    { name: 'Planet Labs', category: '지구관측', note: '위성 데이터 상용화' },
    { name: 'Rocket Lab', category: '소형 발사', note: '민첩한 발사 서비스' },
  ],
  comparisons: [
    { label: '발사 비용', value: '하락 추세', note: '재사용 기술 영향' },
    { label: '서비스 수익화', value: '초기~성장', note: '데이터 제품화 속도 중요' },
  ],
  risks: [
    { title: '발사 실패 리스크', description: '단일 실패가 일정/비용에 큰 영향' },
    { title: '규제/주파수 정책', description: '운용 허가 및 주파수 배분 이슈' },
    { title: '상용 수요 변동', description: '고객사 예산 사이클에 따른 변동' },
  ],
  charts: {
    bar: [
      { label: '국방/공공', value: 35 },
      { label: '통신', value: 30 },
      { label: '관측 데이터', value: 20 },
      { label: '기타', value: 15 },
    ],
    pie: [
      { label: '하드웨어', value: 45 },
      { label: '서비스', value: 55 },
    ],
    line: [
      { label: 'Y1', value: 80 },
      { label: 'Y2', value: 92 },
      { label: 'Y3', value: 107 },
      { label: 'Y4', value: 121 },
    ],
  },
  notes: ['발사 성공률과 계약 구조를 함께 확인해야 왜곡을 줄일 수 있음'],
  warnings: [],
  sourceMeta: { sourceType: 'pasted_text', generatedAt: now, confidence: 'medium' },
};

