import { logger } from './logger';

export type OrchestratorRoute =
  | 'financial_debate'
  | 'trend_analysis'
  | 'open_topic'
  | 'portfolio_view'
  | 'trade_record'
  | 'weekly_report'
  | 'settings'
  | 'unknown';

export type OrchestratorInput = {
  customId?: string;
  modalId?: string;
  messagePrefix?: string;
};

type OrchestratorDecision = {
  route: OrchestratorRoute;
  reuseCache: boolean;
  minimizeApi: boolean;
};

function classifyFromCustomId(customId: string): OrchestratorRoute {
  if (customId.startsWith('panel:trend:') || customId === 'modal:trend:free') return 'trend_analysis';
  if (customId.startsWith('panel:portfolio:') || customId.startsWith('modal:portfolio:')) return 'trade_record';
  if (customId.startsWith('panel:ai:') || customId === 'modal:ai:ask') return 'financial_debate';
  if (customId.startsWith('panel:settings:')) return 'settings';
  if (customId.startsWith('panel:finance:')) return 'financial_debate';
  return 'unknown';
}

/**
 * 무거운 프레임워크 없이, 최소 Decision Orchestrator.
 * - 라우트 분류
 * - 캐시/예산 힌트 플래그 (향후 quote/fx/중간요약 캐시에 연결)
 */
export function decideOrchestratorRoute(input: OrchestratorInput): OrchestratorDecision {
  const cid = input.modalId || input.customId || '';
  if (input.messagePrefix?.startsWith('!토론')) {
    const q = input.messagePrefix.slice('!토론'.length).trim();
    const trend = /(트렌드|유행|k-?pop|드라마|넷플릭스|스포츠|콘텐츠|아이돌|엔터|기회|시장)/i.test(q);
    return {
      route: trend ? 'trend_analysis' : 'financial_debate',
      reuseCache: true,
      minimizeApi: true
    };
  }
  if (!cid) return { route: 'unknown', reuseCache: false, minimizeApi: false };

  const route = classifyFromCustomId(cid);
  const portfolioView =
    cid === 'panel:portfolio:view' ||
    cid === 'panel:portfolio:view:all' ||
    cid === 'panel:portfolio:view:retirement';
  return {
    route: portfolioView ? 'portfolio_view' : route,
    reuseCache: portfolioView || route === 'trend_analysis',
    minimizeApi: portfolioView || route === 'trend_analysis'
  };
}

export function logOrchestratorDecision(decision: OrchestratorDecision, meta: Record<string, unknown>): void {
  logger.info('ORCHESTRATOR', 'route selected', { route: decision.route, ...meta });
  if (decision.reuseCache) {
    logger.info('ORCHESTRATOR', 'cached data reused', { route: decision.route });
  }
  if (decision.minimizeApi) {
    logger.info('ORCHESTRATOR', 'api budget minimized', { route: decision.route });
  }
}
