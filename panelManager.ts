import fs from 'fs';
import path from 'path';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Client, TextChannel, Message } from 'discord.js';
import { logger, updateHealth } from './logger';

const STATE_FILE = path.join(process.cwd(), 'state', 'discord-panel.json');

export function savePanelState(channelId: string, messageId: string) {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify({ channelId, messageId }, null, 2));
    logger.info('PANEL', 'State file forcibly saved/updated', { STATE_FILE, channelId, messageId });
}

export function loadPanelState(): { channelId: string, messageId: string } | null {
    if (!fs.existsSync(STATE_FILE)) return null;
    try {
        const data = fs.readFileSync(STATE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

export async function restoreOrBuildMainPanel(client: Client, defaultChannelId?: string): Promise<Message | null> {
    logger.info('PANEL', 'restore start requested');
    updateHealth(s => {
        s.panels.restoreAttempted = true;
        s.panels.lastPanelAction = 'restore_start';
        s.panels.panelErrorReason = null;
    });

    const state = loadPanelState();
    const targetChannelId = state?.channelId || defaultChannelId;

    if (!targetChannelId) {
        logger.warn('PANEL', 'No channelId in state.json, and no default Channel passed. Cannot restore.');
        updateHealth(s => {
            s.panels.restoreSucceeded = false;
            s.panels.lastPanelAction = 'skip_no_channel';
            s.panels.panelErrorReason = 'NO_STATE_AND_NO_CALLER_CHANNEL';
        });
        return null;
    }

    logger.info('PANEL', `Channel lookup for ${targetChannelId} started...`);
    const channel = await client.channels.fetch(targetChannelId).catch(() => null) as TextChannel;
    
    if (!channel) {
        logger.error('PANEL', 'Target channel resolution failed! (Missing Access or Channel Deleted)', { channelId: targetChannelId });
        updateHealth(s => {
            s.panels.restoreSucceeded = false;
            s.panels.lastPanelAction = 'fallback_failed';
            s.panels.panelErrorReason = 'CHANNEL_FETCH_FAILED';
            s.discord.targetChannelResolved = false;
        });
        return null;
    }
    
    updateHealth(s => s.discord.targetChannelResolved = true);

    // 1. Try editing existing message
    if (state && state.messageId && state.channelId === channel.id) {
        logger.info('PANEL', 'Checking old message validity...', { messageId: state.messageId });
        const oldMsg = await channel.messages.fetch(state.messageId).catch(() => null);
        if (oldMsg) {
            // Edit existing
            const editedMsg = await oldMsg.edit(getMainPanel()).catch(e => {
                logger.error('PANEL', 'Failed to edit old message. Recreate fallback triggered.', { error: e.message });
                return null;
            });
            if (editedMsg) {
                logger.info('PANEL', 'Old panel successfully restored (edited)', { messageId: editedMsg.id });
                updateHealth(s => {
                    s.panels.restoreSucceeded = true;
                    s.panels.mainPanelMessageId = editedMsg.id;
                    s.panels.lastPanelAction = 'panel_restored';
                });
                return editedMsg;
            }
        } else {
            logger.warn('PANEL', 'Old message fetch failed (Unknown Message/Deleted). Fallbacking to recreate forcibly.');
            updateHealth(s => s.panels.panelErrorReason = 'UNKNOWN_MESSAGE_FETCH_FAILED_FORCING_RECREATE');
        }
    }

    // 2. Recreate fallback - send a pristine message in the known channel
    logger.info('PANEL', 'Recreating new main panel in target channel.');
    const newMsg = await channel.send(getMainPanel()).catch(e => {
        logger.error('PANEL', 'Failed to send new panel message', { error: e.message });
        updateHealth(s => s.panels.panelErrorReason = `SEND_MESSAGE_FAILED_${e.message}`);
        return null;
    });

    if (newMsg) {
        savePanelState(channel.id, newMsg.id); // 🔥 Instantly replace state
        logger.info('PANEL', 'New panel forcefully created and state fully updated', { messageId: newMsg.id });
        updateHealth(s => {
            s.panels.restoreSucceeded = true;
            s.panels.mainPanelMessageId = newMsg.id;
            s.panels.lastPanelAction = 'panel_recreated';
            s.panels.panelErrorReason = null;
        });
        return newMsg;
    }

    // Worst case fallback
    updateHealth(s => {
        s.panels.restoreSucceeded = false;
        s.panels.lastPanelAction = 'recreate_completely_failed';
    });
    return null;
}

export function getMainPanel() {
    const embed = new EmbedBuilder()
      .setTitle("📊 KJM AI Investment Office")
      .setDescription("현재 상태를 기반으로:\n- 리스크 분석\n- 소비 평가\n- 투자 기회 탐색\n- 실행 전략 도출\n\n아래 버튼으로 진행하세요.")
      .setColor('#2b2d31');
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:main:portfolio').setLabel('📊 포트폴리오').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel:main:finance').setLabel('💸 소비/현금흐름').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel:main:ai').setLabel('🧠 AI 토론').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:main:trend').setLabel('🔥 트렌드').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('panel:main:settings').setLabel('⚙️ 설정').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
}

export function getPortfolioPanel() {
    const embed = new EmbedBuilder().setTitle("📊 포트폴리오 관리").setDescription("현재 보유 자산을 등록/수정합니다.").setColor('#3498db');
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:portfolio:add').setLabel('➕ 종목 추가').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel:portfolio:view').setLabel('📋 내 포트폴리오 조회').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:portfolio:delete').setLabel('❌ 종목 삭제').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('panel:portfolio:risk').setLabel('🔄 비중 분석 요청').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:main:reinstall').setLabel('🔙 메인으로').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row, row2] };
}

export function getFinancePanel() {
    const embed = new EmbedBuilder().setTitle("💸 소비 및 현금흐름 관리").setDescription("지출과 자금 흐름을 입력하면\nAI가 소비 구조와 지속 가능성을 분석합니다.").setColor('#e67e22');
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:finance:add_expense').setLabel('💸 지출 입력').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel:finance:add_cashflow').setLabel('💰 현금흐름 입력').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel:finance:analyze_spending').setLabel('📊 소비 분석').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel:finance:stability').setLabel('📉 재무 안정성 체크').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:main:reinstall').setLabel('🔙 메인으로').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row, row2] };
}

export function getAIPanel() {
    const embed = new EmbedBuilder().setTitle("🧠 AI 투자 회의").setDescription("Ray / JYP / Simons / Drucker가\n현재 상태를 기반으로 전략을 도출합니다.").setColor('#9b59b6');
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:ai:full').setLabel('📊 종합 진단').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel:ai:risk').setLabel('⚠️ 리스크 점검').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('panel:ai:strategy').setLabel('💡 투자 전략').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel:ai:spending').setLabel('🧾 소비 개선').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:ai:ask').setLabel('✍️ 직접 질문').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:main:reinstall').setLabel('🔙 메인으로').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row, row2] };
}

export function getTrendPanel() {
    const embed = new EmbedBuilder().setTitle("🔥 트렌드 기반 기회 탐색").setDescription("AI 시대, 사람의 관심이 돈의 흐름을 만든다.\nK-pop / 드라마 / 스포츠 / 유행을 분석합니다.").setColor('#e74c3c');
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:trend:kpop').setLabel('🎤 K-pop').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel:trend:drama').setLabel('🎬 드라마/OTT').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel:trend:sports').setLabel('⚽ 스포츠').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel:trend:hot').setLabel('📈 핫 트렌드').setStyle(ButtonStyle.Success)
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:trend:free').setLabel('🔍 자유 탐색').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:main:reinstall').setLabel('🔙 메인으로').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row, row2] };
}

export function getSettingsPanel() {
    const embed = new EmbedBuilder().setTitle("⚙️ 시스템 설정").setDescription("AI 분석 모드 및 전략 성향을 설정합니다.").setColor('#95a5a6');
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:settings:safe').setLabel('🛡 SAFE 모드').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel:settings:balanced').setLabel('⚖ BALANCED 모드').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel:settings:aggressive').setLabel('⚡ AGGRESSIVE 모드').setStyle(ButtonStyle.Danger)
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:settings:reinstall').setLabel('🔄 패널 재설치').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:main:reinstall').setLabel('🔙 메인으로').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row, row2] };
}

export const getNoDataButtons = () => {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:portfolio:add').setLabel('📈 종목 등록하기').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel:finance:add_expense').setLabel('💸 소비 기록하기').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('panel:finance:add_cashflow').setLabel('💰 현금흐름 입력').setStyle(ButtonStyle.Primary)
    );
};
