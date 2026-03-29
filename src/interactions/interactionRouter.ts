import { handleMainPanelNavigation, isMainPanelInteraction } from './panelInteractionHandler';

/**
 * Discord 버튼 중 메인 패널 네비게이션만 interaction 계층에서 선처리한다.
 * (`feedback:save:*` 는 index.ts에서 처리)
 * @returns true면 호출측에서 interaction 처리 종료(return)
 */
export async function routeEarlyButtonInteraction(params: {
  interaction: any;
  customId: string;
  getDiscordUserId: (user: { id: string }) => string;
  safeDeferReply: (interaction: any, opts?: any) => Promise<boolean>;
  safeEditReply: (interaction: any, content: string, context: string) => Promise<void>;
  mainPanel: {
    getTrendPanel: () => any;
    getPortfolioPanel: () => any;
    getFinancePanel: () => any;
    getAIPanel: () => any;
    getDataCenterPanel: () => any;
    getSettingsPanel: () => any;
    getMainPanel: () => any;
    safeUpdate: (interaction: any, payload: any, context: string) => Promise<void>;
  };
}): Promise<boolean> {
  const { customId: cid, interaction } = params;

  if (isMainPanelInteraction(cid)) {
    await handleMainPanelNavigation({
      interaction,
      customId: cid,
      getTrendPanel: params.mainPanel.getTrendPanel,
      getPortfolioPanel: params.mainPanel.getPortfolioPanel,
      getFinancePanel: params.mainPanel.getFinancePanel,
      getAIPanel: params.mainPanel.getAIPanel,
      getDataCenterPanel: params.mainPanel.getDataCenterPanel,
      getSettingsPanel: params.mainPanel.getSettingsPanel,
      getMainPanel: params.mainPanel.getMainPanel,
      safeUpdate: params.mainPanel.safeUpdate
    });
    return true;
  }

  return false;
}
