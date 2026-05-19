import { ACTION_STEP_SEED_STORAGE_KEY, type ActionStepSeedPayload } from '@/lib/actionStepLinks';

const PB_DAILY_SEED_QUESTION =
  '이 점검 메모를 기준으로 추가 확인할 리스크와 우선순위를 알려줘. 매수/매도 지시는 하지 말고 확인 관점으로 답해줘.';

const COMMITTEE_SEED_QUESTION =
  '다음 PB 일일 점검 메모를 위원회 관점에서 리스크·반론·확인 변수로 토론해줘. 매수/매도 지시 없이 점검 관점만.';

export function buildPbDailyNoteCopyText(item: {
  name?: string;
  symbol?: string;
  noteSummary: string;
  pbPerspective: string;
  nextChecks: string[];
  doNotDo: string[];
  evidenceNeeded: string[];
}): string {
  return [
    item.name || item.symbol ? `종목: ${item.name ?? ''} ${item.symbol ?? ''}`.trim() : null,
    `PB 관점: ${item.pbPerspective}`,
    `요약: ${item.noteSummary}`,
    item.nextChecks.length ? `확인할 것:\n${item.nextChecks.map((c) => `- ${c}`).join('\n')}` : null,
    item.doNotDo.length ? `하지 말 것: ${item.doNotDo.join(' · ')}` : null,
    item.evidenceNeeded.length ? `필요 증거: ${item.evidenceNeeded.join(', ')}` : null,
    '원하는 답변: 조언이 아니라 점검·확인 관점. 매수/매도·자동 주문 지시 없음.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function storePbDailyNoteSeed(item: {
  symbol?: string;
  name?: string;
  market?: string;
  noteSummary: string;
  pbPerspective: string;
  nextChecks: string[];
  doNotDo: string[];
  evidenceNeeded: string[];
  fullText?: string;
}): void {
  if (typeof sessionStorage === 'undefined') return;
  const compactText = buildPbDailyNoteCopyText(item);
  const payload: ActionStepSeedPayload = {
    source: 'pb_daily_note',
    stepLabel: item.name ?? item.symbol ?? 'PB 일일 점검',
    question: PB_DAILY_SEED_QUESTION,
    symbol: item.symbol,
    name: item.name,
    market: item.market,
    whyCreated: item.pbPerspective,
    doNotDo: item.doNotDo,
    evidenceNeeded: item.evidenceNeeded,
    compactText,
    fullText: item.fullText ?? compactText,
    createdAt: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(ACTION_STEP_SEED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function pbDailyNotePbHref(): string {
  return '/private-banker?source=pb_daily_note';
}

export function pbDailyNoteCommitteeHref(): string {
  return '/committee-discussion?source=pb_daily_note';
}

export function pbDailyNoteResearchHref(input: {
  symbol?: string;
  name?: string;
  market?: string;
  question?: string;
  knownRisk?: string;
}): string {
  const q = new URLSearchParams();
  q.set('source', 'pb_daily_note');
  if (input.symbol) q.set('symbol', input.symbol);
  if (input.name) q.set('name', input.name);
  if (input.market) q.set('market', input.market);
  if (input.question) q.set('question', input.question.slice(0, 200));
  if (input.knownRisk) q.set('knownRisk', input.knownRisk.slice(0, 120));
  return `/research-center?${q.toString()}`;
}

export { PB_DAILY_SEED_QUESTION, COMMITTEE_SEED_QUESTION };
