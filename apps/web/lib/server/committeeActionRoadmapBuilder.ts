import 'server-only';

import type {
  CommitteeActionItem,
  CommitteeActionRoadmap,
  CommitteeDiscussionLineDto,
  CommitteeLineOutputQuality,
  CommitteePrimaryConcern,
} from '@office-unify/shared-types';

const TRADE_INSTRUCTION = /(즉시\s*매수|즉시\s*매도|지금\s*매수|지금\s*매도|전량\s*매도|전량\s*매수|주문\s*실행|자동\s*주문)/i;

function extractSection(text: string, label: string): string {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\[([^\\]]*${esc}[^\\]]*)\\]\\s*([\\s\\S]*?)(?=\\n\\s*\\[|$)`, 'i');
  const m = text.match(re);
  return m?.[2]?.trim() ?? '';
}

function bulletsFromBlock(block: string, max = 5): string[] {
  if (!block.trim()) return [];
  const lines = block
    .split(/\n+/)
    .map((l) => l.replace(/^[\s\-*•\d.)]+/, '').trim())
    .filter((l) => l.length >= 6 && !TRADE_INSTRUCTION.test(l));
  return lines.slice(0, max);
}

function item(
  title: string,
  reason: string,
  linkedPersonaIds: string[],
  priority: CommitteeActionItem['priority'] = 'medium',
): CommitteeActionItem {
  return {
    title: title.slice(0, 200),
    reason: reason.slice(0, 500),
    linkedPersonaIds,
    priority,
    notTradeInstruction: true,
  };
}

function inferPrimaryConcern(blob: string): CommitteePrimaryConcern {
  const hasSector = /반도체|메모리|hbm|ai\s*반도체|sk하이닉스|삼성전자|soxx|smh/i.test(blob);
  const hasLeverage = /레버리지|고변동|2x|3x|인버스|bull|bear|솔\s*ai|top2|플러스/i.test(blob);
  if (hasSector) return 'sector_concentration';
  if (hasLeverage) return 'leverage_exposure';
  if (/손절\s*후|모멘텀\s*추격|추격\s*매수|손절.*늘/i.test(blob)) return 'momentum_chasing';
  if (/손절|청산|본전/i.test(blob)) return 'loss_cut_rotation';
  if (/데이터\s*부족|확인\s*불가|근거\s*부족/i.test(blob)) return 'data_insufficient';
  if (/집중|비중|분산|노출/i.test(blob)) return 'portfolio_balance';
  return 'unknown';
}

function defaultActionLinks(): CommitteeActionRoadmap['actionLinks'] {
  return [
    {
      actionKey: 'create_followups',
      label: '후속작업으로 추출',
      description: '아래 체크리스트를 운영 보드 초안으로 변환합니다(저장 전 검토).',
      method: 'POST',
      writeAction: false,
      requiresConfirmation: false,
    },
    {
      actionKey: 'save_decision_retrospective',
      label: '판단 복기로 저장',
      description: '복기 시드 API로 이동합니다(명시 저장 시에만 DB write).',
      href: '/trade-journal',
      method: 'GET',
      writeAction: true,
      requiresConfirmation: true,
    },
    {
      actionKey: 'open_research_center',
      label: 'Research Center로 보내기',
      description: '검증 변수·리스크를 조사할 주제를 prefill합니다.',
      href: '/research-center',
      method: 'GET',
      writeAction: false,
      requiresConfirmation: false,
    },
    {
      actionKey: 'open_trade_journal_seed',
      label: 'Trade Journal 관찰 메모',
      description: '관찰·복기 메모 시드로 이동합니다.',
      href: '/trade-journal',
      method: 'GET',
      writeAction: false,
      requiresConfirmation: false,
    },
    {
      actionKey: 'open_portfolio_exposure',
      label: '포트폴리오 노출 확인',
      description: '보유·관심 원장에서 섹터·레버리지 노출을 점검합니다.',
      href: '/portfolio-ledger',
      method: 'GET',
      writeAction: false,
      requiresConfirmation: false,
    },
    {
      actionKey: 'copy_checklist',
      label: '체크리스트 복사',
      description: '이번 주 할 일·하지 말 것을 클립보드에 복사합니다.',
      writeAction: false,
      requiresConfirmation: false,
    },
  ];
}

export function buildCommitteeActionRoadmap(input: {
  topic: string;
  transcript: Array<CommitteeDiscussionLineDto & { outputQuality?: CommitteeLineOutputQuality }>;
  closingLines?: CommitteeDiscussionLineDto[];
}): CommitteeActionRoadmap {
  const all = [...input.transcript, ...(input.closingLines ?? [])];
  const blob = all.map((l) => l.content).join('\n');
  const bySlug = new Map(all.map((l) => [l.slug, l]));

  const hindenburg = bySlug.get('hindenburg')?.content ?? '';
  const jim = bySlug.get('jim-simons')?.content ?? '';
  const cio = bySlug.get('cio')?.content ?? '';
  const drucker = bySlug.get('drucker')?.content ?? '';

  const doThisWeek: CommitteeActionItem[] = [];
  const doNotDo: CommitteeActionItem[] = [];
  const monitor: CommitteeActionItem[] = [];
  const researchNeeded: CommitteeActionItem[] = [];
  const retrospectiveNeeded: CommitteeActionItem[] = [];

  for (const t of bulletsFromBlock(extractSection(drucker, '이번 주 할 일'), 3)) {
    doThisWeek.push(item(t, 'Peter Drucker 실행 항목', ['drucker'], 'high'));
  }
  for (const t of bulletsFromBlock(extractSection(drucker, '하지 말 것'), 3)) {
    doNotDo.push(item(t, 'Peter Drucker 보류·금지 항목', ['drucker'], 'high'));
  }
  for (const t of bulletsFromBlock(extractSection(hindenburg, '구조적 취약점'), 2)) {
    doNotDo.push(item(`구조 리스크 점검: ${t}`, 'Hindenburg 구조적 취약점', ['hindenburg'], 'medium'));
  }
  for (const t of bulletsFromBlock(extractSection(hindenburg, '핵심 착각'), 1)) {
    monitor.push(item(`착각 재검토: ${t}`, 'Hindenburg 핵심 착각', ['hindenburg'], 'medium'));
  }
  for (const t of bulletsFromBlock(extractSection(jim, '검증 변수'), 3)) {
    monitor.push(item(`모니터: ${t}`, 'James Simons 검증 변수', ['jim-simons'], 'medium'));
    researchNeeded.push(item(`근거 수집: ${t}`, '검증 변수 확인용 리서치', ['jim-simons'], 'low'));
  }
  const validUntil = extractSection(jim, '유효기간');
  if (validUntil) {
    monitor.push(item(`유효기간 점검: ${validUntil.slice(0, 120)}`, 'James Simons 유효기간', ['jim-simons'], 'low'));
  }

  const cioHold = extractSection(cio, '보류할 행동') || extractSection(cio, '지금 보류');
  for (const t of bulletsFromBlock(cioHold, 3)) {
    doNotDo.push(item(t, 'CIO 보류 행동', ['cio'], 'high'));
  }

  const primaryConcern = inferPrimaryConcern(`${input.topic}\n${blob}`);
  if (primaryConcern === 'sector_concentration') {
    if (!doThisWeek.some((x) => /반도체|섹터|노출/i.test(x.title))) {
      doThisWeek.push(
        item('반도체·AI 관련 노출 비중을 원장 기준으로 계산', '섹터 집중 리스크 점검', ['cio', 'hindenburg'], 'high'),
      );
    }
    monitor.push(
      item('메모리 가격·AI capex·반도체 ETF 수급 지표 주간 점검', '섹터 집중 모니터', ['jim-simons'], 'medium'),
    );
  }
  if (primaryConcern === 'leverage_exposure') {
    doThisWeek.push(
      item('레버리지·고변동 상품 노출 한도(비중·손실 허용) 문서화', '레버리지 노출 점검', ['cio'], 'high'),
    );
    doNotDo.push(
      item('계획 없는 레버리지·고변동 상품 추가 편입 보류', '레버리지 리스크', ['cio', 'hindenburg'], 'high'),
    );
  }
  if (primaryConcern === 'momentum_chasing') {
    doNotDo.push(
      item('손절 직후 동일 테마 모멘텀 추격 확대 보류', '손절 후 추격 패턴', ['hindenburg', 'drucker'], 'high'),
    );
    retrospectiveNeeded.push(
      item('손절한 종목의 손절 사유·기준 복기 기록', '반복 실수 감소', ['drucker'], 'high'),
    );
  }
  if (/손절|바이오|동성화인텍/i.test(blob)) {
    retrospectiveNeeded.push(
      item('최근 손절·회전 판단 복기(바이오·소재 등)', '판단 복기', ['drucker', 'cio'], 'medium'),
    );
  }
  if (primaryConcern === 'sector_concentration' && /늘린|확대|비중/i.test(blob)) {
    retrospectiveNeeded.push(
      item('반도체·레버리지 비중 확대 당시 근거 복기', '비중 확대 근거', ['cio', 'drucker'], 'medium'),
    );
  }

  const truncatedPersonaIds = all
    .filter((l) => l.outputQuality?.truncated || l.outputQuality?.status === 'partial')
    .map((l) => l.slug);

  const sanitizedTotal = all.reduce((n, l) => n + (l.outputQuality?.sanitizedPromptLeaks ?? 0), 0);

  const stance =
    truncatedPersonaIds.length > 0 || doThisWeek.length === 0
      ? 'review_required'
      : primaryConcern === 'data_insufficient'
        ? 'insufficient_data'
        : primaryConcern === 'sector_concentration' || primaryConcern === 'leverage_exposure'
          ? 'risk_review'
          : 'observe';

  const confidence =
    truncatedPersonaIds.length > 0 ? 'low' : doThisWeek.length >= 2 && doNotDo.length >= 1 ? 'medium' : 'low';

  const actionabilityScore = Math.min(
    100,
    doThisWeek.length * 12 +
      doNotDo.length * 10 +
      monitor.length * 6 +
      researchNeeded.length * 4 +
      retrospectiveNeeded.length * 8 -
      truncatedPersonaIds.length * 15 -
      sanitizedTotal * 5,
  );

  const status: CommitteeActionRoadmap['status'] =
    truncatedPersonaIds.length > 0
      ? 'partial'
      : doThisWeek.length === 0 && doNotDo.length === 0
        ? 'insufficient_data'
        : stance === 'review_required'
          ? 'needs_user_review'
          : 'ready';

  const cioVerdict = extractSection(cio, '최종 판정').slice(0, 300);

  return {
    status,
    decisionFrame: {
      question: input.topic.slice(0, 500),
      userDecisionSummary: cioVerdict || undefined,
      primaryConcern,
      stance,
      confidence,
    },
    actionBuckets: {
      doThisWeek: dedupeItems(doThisWeek).slice(0, 8),
      doNotDo: dedupeItems(doNotDo).slice(0, 8),
      monitor: dedupeItems(monitor).slice(0, 10),
      researchNeeded: dedupeItems(researchNeeded).slice(0, 8),
      retrospectiveNeeded: dedupeItems(retrospectiveNeeded).slice(0, 8),
    },
    portfolioImplications: {
      concentrationWarnings:
        primaryConcern === 'sector_concentration'
          ? ['반도체·AI 테마 노출이 포트 전체 판단을 좌우할 수 있습니다. 섹터 비중을 숫자로 확인하세요.']
          : [],
      leverageWarnings:
        primaryConcern === 'leverage_exposure'
          ? ['레버리지·고변동 상품은 손실 폭을 키울 수 있습니다. 노출 한도를 먼저 정하세요.']
          : [],
      positionSizingWarnings: [
        '추가 확대 전 기존 보유·관심종목 비중을 함께 봅니다(자동 리밸런싱 없음).',
      ],
      missingPortfolioData: [],
    },
    verificationPlan: {
      variables: monitor.slice(0, 5).map((m) => ({
        label: m.title.slice(0, 120),
        whyItMatters: m.reason.slice(0, 200),
        checkFrequency: 'weekly' as const,
        sourceHint: 'Research Center·시세·공시',
      })),
      reviewDateHint: extractSection(drucker, '다음 점검').slice(0, 120) || '이번 주 금요일 또는 다음 리밸런싱 검토일',
      validUntil: validUntil.slice(0, 80) || undefined,
    },
    actionLinks: defaultActionLinks(),
    qualityMeta: {
      missingSections: [],
      truncatedPersonaIds,
      sanitizedPromptLeaks: sanitizedTotal,
      generatedFromRounds: new Set(input.transcript.map((_, i) => i)).size,
      actionabilityScore,
    },
  };
}

function dedupeItems(items: CommitteeActionItem[]): CommitteeActionItem[] {
  const seen = new Set<string>();
  const out: CommitteeActionItem[] = [];
  for (const it of items) {
    const k = it.title.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}
