import 'server-only';

import type { CorporateActionRiskSnapshot, CorporateActionRiskType } from '@/lib/todayCandidatesContract';

type RegistryRow = {
  stockCodes: string[];
  riskType: CorporateActionRiskType;
  headline: string;
  sourceLabel: string;
  basisNote?: string;
  effectiveFrom: string;
  expiresAt: string | null;
};

function todayYmdKst(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replaceAll('-', '');
}

function isActiveRow(row: RegistryRow, ymd: string): boolean {
  if (ymd < row.effectiveFrom.replaceAll('-', '')) return false;
  if (row.expiresAt) {
    const ex = row.expiresAt.replaceAll('-', '').slice(0, 8);
    if (ymd > ex) return false;
  }
  return true;
}

/**
 * 운영 전 수동 등록된 기업 이벤트 리스크(실시간 뉴스 미연동 시 우선).
 * HLB 예시: 유상증자·주주배정 등 리스크 점검 카드용(fixture 겸용).
 */
const CORPORATE_ACTION_RISK_REGISTRY: RegistryRow[] = [
  {
    stockCodes: ['028300'],
    riskType: 'rights_offering',
    headline: '유상증자·주주배정 등 기업 이벤트 리스크 점검(수동 레지스트리·예시)',
    sourceLabel: 'manual_registry',
    basisNote: '실시간 공시 연동 전까지 운영자가 근거·기간을 명시해 등록합니다.',
    effectiveFrom: '20260101',
    expiresAt: null,
  },
];

export function resolveCorporateActionRiskForStockCode(
  stockCode: string | undefined,
  now = new Date(),
): CorporateActionRiskSnapshot | undefined {
  const code = (stockCode ?? '').trim();
  if (!code) return undefined;
  const ymd = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .replaceAll('-', '');
  for (const row of CORPORATE_ACTION_RISK_REGISTRY) {
    if (!row.stockCodes.includes(code)) continue;
    if (!isActiveRow(row, ymd)) continue;
    return {
      active: true,
      riskType: row.riskType,
      headline: row.headline,
      sourceLabel: row.sourceLabel,
      effectiveFrom: row.effectiveFrom,
      expiresAt: row.expiresAt,
      ...(row.basisNote ? { basisNote: row.basisNote } : {}),
    };
  }
  return undefined;
}

/** 테스트·진단용 — 레지스트리 스냅샷 날짜 고정 시 사용 */
export function __corporateRiskRegistryYmdForTests(): string {
  return todayYmdKst();
}
