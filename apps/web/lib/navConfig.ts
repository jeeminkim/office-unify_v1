/** 앱 네비게이션 IA — route는 유지하고 label·설명만 정리 (additive). */

export type NavLinkItem = {
  href: string;
  label: string;
  description: string;
};

export type NavGroup = {
  id: string;
  label: string;
  description: string;
  children: NavLinkItem[];
};

export const NAV_HOME: NavLinkItem = {
  href: '/',
  label: '홈',
  description: '오늘 요약 · 실사용 점검 · 빠른 링크',
};

/** 데스크톱 상단 1차 그룹 + 드롭다운 */
export const NAV_TREE: NavGroup[] = [
  {
    id: 'invest-ops',
    label: '투자 운영',
    description: '오늘 관찰 · 작업 · 일일 점검 · 복기',
    children: [
      { href: '/', label: 'Today Brief', description: '오늘의 3줄 브리핑·관찰 후보' },
      { href: '/action-items', label: '액션 인박스', description: '다음 확인·실행 작업 큐' },
      { href: '/daily-review', label: '일일 점검', description: '하루 판단 메모·점검 노트' },
      { href: '/judgment-review', label: '판단 품질 복기', description: '30일 판단 패턴·개선점' },
    ],
  },
  {
    id: 'portfolio',
    label: '포트폴리오',
    description: '보유 · 원장 · 관심종목',
    children: [
      { href: '/assets', label: '내 자산', description: '토스증권 계좌 평가금액·손익·보유 종목' },
      { href: '/discover', label: '종목 탐색', description: '종목명 검색·토스 현재가·가격 흐름 관찰 후보' },
      { href: '/portfolio', label: '보유 현황', description: '평가·시세 품질·집중도 (읽기 중심)' },
      { href: '/portfolio-ledger', label: '보유/거래 원장', description: '매매 기록·수량/평단·ticker 수정' },
      { href: '/watchlist', label: '관심종목 관리', description: '관심종목·섹터·ticker·등록 후보 승인' },
    ],
  },
  {
    id: 'research',
    label: '리서치',
    description: '리서치·섹터·트렌드',
    children: [
      { href: '/research-center', label: '리서치 센터', description: '멀티 데스크 리포트·후속 질문' },
      { href: '/sector-radar', label: '섹터 레이더', description: '섹터 온도·ETF anchor' },
      { href: '/trend', label: 'Trend', description: '트렌드 메모리·주제 연결' },
      { href: '/infographic', label: 'Infographic', description: '인포그래픽 생성' },
    ],
  },
  {
    id: 'judgment',
    label: '판단/복기',
    description: '저널·위원회·PB',
    children: [
      { href: '/trade-journal', label: 'Trade Journal', description: '관찰·매매 메모' },
      { href: '/decision-journal', label: 'Decision Journal', description: '판단 기록' },
      { href: '/committee-discussion', label: '위원회 토론', description: '턴제 토론·후속 작업' },
      { href: '/persona-chat', label: 'Persona Chat', description: '페르소나 일별 상담' },
      { href: '/private-banker', label: 'Private Banker', description: 'PB 주간·상담' },
    ],
  },
  {
    id: 'ops',
    label: '운영/설정',
    description: 'SQL·시세·데이터 소스',
    children: [
      { href: '/ops/sql-readiness', label: 'SQL 준비 상태', description: 'DDL 적용·테이블 readiness' },
      { href: '/ops-events', label: '운영 로그', description: 'ops 이벤트 조회' },
      { href: '/ops/google-finance-setup', label: 'Google Finance 설정', description: 'Sheets·GOOGLEFINANCE read-only 점검' },
      { href: '/system-status', label: '데이터 소스 상태', description: 'provider·연결 상태' },
      { href: '/dev-assistant', label: 'Dev Assistant', description: '개발 보조 도구' },
    ],
  },
];

/** 모바일 하단 5탭 */
export const MOBILE_PRIMARY = [
  { href: '/', label: '홈', short: '홈' },
  { href: '/action-items', label: 'Action', short: '작업' },
  { href: '/daily-review', label: 'Daily', short: '일일' },
  { href: '/assets', label: 'Assets', short: '자산' },
] as const;

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isGroupActive(pathname: string, group: NavGroup): boolean {
  return group.children.some((c) => isNavActive(pathname, c.href));
}

export function flattenNavLinks(): NavLinkItem[] {
  const out: NavLinkItem[] = [NAV_HOME];
  for (const g of NAV_TREE) out.push(...g.children);
  return out;
}

const MOBILE_SHORT_LABEL_BY_HREF: Record<string, string> = {
  '/dev-assistant': 'Dev',
  '/portfolio-ledger': '원장',
  '/ops/google-finance-setup': 'GF 설정',
  '/sector-radar': '섹터',
  '/realized-pnl': '실현손익',
  '/financial-goals': '목표',
  '/decision-journal': '판단일지',
  '/trade-journal': '매매일지',
  '/action-items': '작업함',
};

/** Mobile labels keep operational routes readable in narrow drawers/chips. */
export function mobileNavLabel(item: Pick<NavLinkItem, 'href' | 'label'>): string {
  return MOBILE_SHORT_LABEL_BY_HREF[item.href] ?? item.label;
}
