import 'dotenv/config';
import { Client, GatewayIntentBits, WebhookClient, Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Interaction, Events, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } from 'discord.js';
import { logger, updateHealth, startHeartbeat } from './logger';
import { RayDalioAgent, JYPAgent, JamesSimonsAgent, PeterDruckerAgent, StanleyDruckenmillerAgent } from './agents';
import { createClient } from '@supabase/supabase-js';
import { ensureMainPanelOnBoot, savePanelState, loadPanelState, getMainPanel, getPortfolioPanel, getFinancePanel, getAIPanel, getTrendPanel, getSettingsPanel, getNoDataButtons } from './panelManager';
import { buildPortfolioSnapshot } from './portfolioService';
import { resolveInstrumentMetadata } from './instrumentRegistry';
import {
    generateTrendSpecialistResponse,
    trendTopicFromCustomId,
    TREND_TOPIC_CONFIG,
    type TrendTopicKind
} from './trendAnalysis';

logger.info('BOOT', 'index initialization started');

function validateEnv() {
    const env = {
        DISCORD_TOKEN: process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL
    };
    const missing = Object.entries(env)
        .filter(([, value]) => !value)
        .map(([key]) => key);

    if (missing.length > 0) {
        logger.error('ENV', 'Missing required environment variables', { missing });
        updateHealth(s => s.discord.lastError = `Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }

    logger.info('ENV', 'Environment validation passed', {
        keysChecked: ['DISCORD_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'DISCORD_WEBHOOK_URL']
    });

    return {
        DISCORD_TOKEN: env.DISCORD_TOKEN as string,
        SUPABASE_URL: env.SUPABASE_URL as string,
        SUPABASE_KEY: env.SUPABASE_SERVICE_ROLE_KEY as string,
        WEBHOOK_URL: env.DISCORD_WEBHOOK_URL as string
    };
}

const { DISCORD_TOKEN, SUPABASE_URL, SUPABASE_KEY, WEBHOOK_URL } = validateEnv();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});
const webhook = new WebhookClient({ url: WEBHOOK_URL });
startHeartbeat();

function parseNumberStrict(value: string): number | null {
    if (!value) return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
}

function normalizeSymbol(value: string): string {
    return (value || '').trim().toUpperCase();
}

function formatKrw(v: number): string {
    return `${Math.round(v).toLocaleString('ko-KR')}원`;
}

function getDiscordUserId(user: { id: string }): string {
    return user.id;
}

function normalizeFlowType(value: string): string | null {
    const valid = ['income', 'fixed_expense', 'saving', 'investment', 'debt_payment', 'other'];
    const normalized = (value || '').trim().toLowerCase();
    if (valid.includes(normalized)) return normalized;
    return null;
}


function parsePositiveAmount(value: string): number | null {
    const amount = parseNumberStrict(value);
    if (amount === null || amount <= 0) return null;
    return amount;
}

function sanitizeDescription(value: string): string {
    return (value || '').trim();
}

function isSchemaMismatchError(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    return (
        message.includes('schema cache') ||
        message.includes('column') ||
        message.includes('does not exist') ||
        message.includes('could not find')
    );
}

function logSchemaSafeInsertFailure(table: string, payload: Record<string, unknown>, error: any) {
    const payloadKeys = Object.keys(payload);
    const scope = `DB][${table}][insert`;
    logger.error(scope, 'insert failed', {
        table,
        payloadKeys,
        errorMessage: error?.message || String(error),
        errorCode: error?.code || null,
        hint: isSchemaMismatchError(error) ? 'column mismatch suspected: check DB schema and payload keys' : null
    });
}

async function safeEditReply(interaction: any, content: string, context: string) {
    return safeEditReplyPayload(interaction, { content, flags: 64 }, context);
}

function normalizeInteractionPayload(payload: any): any {
    if (!payload || typeof payload !== 'object') return payload;
    const next = { ...payload };
    if ('ephemeral' in next) {
        if (next.ephemeral === true) next.flags = 64;
        delete next.ephemeral;
    }
    return next;
}

async function safeDeferReply(interaction: any, options: any = { flags: 64 }): Promise<boolean> {
    if (interaction.deferred || interaction.replied) {
        logger.warn('INTERACTION', 'defer skipped: already handled', {
            customId: interaction.customId,
            discordUserId: interaction.user?.id,
            deferred: interaction.deferred,
            replied: interaction.replied
        });
        return false;
    }
    logger.info('INTERACTION', 'defer reply started', {
        customId: interaction.customId,
        discordUserId: interaction.user?.id
    });
    await interaction.deferReply(normalizeInteractionPayload(options));
    return true;
}

async function safeEditReplyPayload(interaction: any, payload: any, context: string): Promise<void> {
    try {
        const normalizedPayload = normalizeInteractionPayload(payload);
        if (!interaction.deferred && !interaction.replied) {
            await interaction.reply(normalizedPayload);
        } else {
            await interaction.editReply(normalizedPayload);
        }
        logger.info('INTERACTION', `interaction completed: ${context}`, {
            customId: interaction.customId,
            discordUserId: interaction.user?.id,
            deferred: interaction.deferred,
            replied: interaction.replied
        });
        updateHealth(h => {
            h.interactions.lastInteractionAt = new Date().toISOString();
        });
    } catch (replyError: any) {
        logger.error('INTERACTION', `reply failed: ${context}`, {
            customId: interaction.customId,
            discordUserId: interaction.user?.id,
            deferred: interaction.deferred,
            replied: interaction.replied,
            error: replyError?.message || String(replyError)
        });
        updateHealth(h => h.discord.lastError = `reply_failed:${context}:${replyError?.message || 'unknown'}`);
    }
}

async function safeReplyOrFollowUp(interaction: any, payload: any, context: string): Promise<void> {
    try {
        const normalizedPayload = normalizeInteractionPayload(payload);
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(normalizedPayload);
        } else {
            await interaction.reply(normalizedPayload);
        }
        logger.info('INTERACTION', `interaction completed: ${context}`, {
            customId: interaction.customId,
            discordUserId: interaction.user?.id,
            deferred: interaction.deferred,
            replied: interaction.replied
        });
    } catch (e: any) {
        logger.error('INTERACTION', `fallback response failed: ${context}`, {
            customId: interaction.customId,
            discordUserId: interaction.user?.id,
            deferred: interaction.deferred,
            replied: interaction.replied,
            error: e?.message || String(e)
        });
    }
}

async function safeUpdate(interaction: any, payload: any, context: string): Promise<void> {
    if (interaction.deferred || interaction.replied) {
        logger.warn('INTERACTION', `update skipped: ${context}`, {
            customId: interaction.customId,
            discordUserId: interaction.user?.id,
            deferred: interaction.deferred,
            replied: interaction.replied
        });
        return;
    }
    logger.info('INTERACTION', 'interaction update started', {
        customId: interaction.customId,
        discordUserId: interaction.user?.id
    });
    await interaction.update(payload);
    logger.info('INTERACTION', `interaction completed: ${context}`, {
        customId: interaction.customId,
        discordUserId: interaction.user?.id,
        deferred: interaction.deferred,
        replied: interaction.replied
    });
}

function extractWeeklyReport(jypText: string): string | null {
    if (!jypText) return null;
    const text = jypText.replace(/\r\n/g, '\n');
    const startPattern = /(##\s*Weekly K-Culture Report|\[K-Culture Weekly Report\])/i;
    const startMatch = text.match(startPattern);
    if (!startMatch || startMatch.index === undefined) return null;

    const startIndex = startMatch.index;
    const remaining = text.slice(startIndex);
    const endMatch = remaining.match(/\n##\s|\n\[?[A-Za-z][A-Za-z\s_-]*Agent\]?|\n\[[A-Za-z][A-Za-z\s_-]*\]/);
    const section = endMatch ? remaining.slice(0, endMatch.index) : remaining;
    const cleaned = section.trim();

    return cleaned.length > 0 ? cleaned : null;
}

function getThisWeekFridayKST(now: Date = new Date()): Date {
    const weekdayText = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        weekday: 'short'
    }).format(now);
    const weekdayMap: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
    };
    const kstWeekday = weekdayMap[weekdayText] ?? 0;

    const ymd = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(now).split('-').map(Number);
    const [year, month, day] = ymd;

    const kstMidnightUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - (9 * 60 * 60 * 1000);
    const daysUntilFriday = (5 - kstWeekday + 7) % 7;
    return new Date(kstMidnightUtcMs + (daysUntilFriday * 24 * 60 * 60 * 1000));
}

function shouldGenerateWeeklyReport(now: Date, targetFridayKst: Date, lastReportDate: Date | null): boolean {
    if (now < targetFridayKst) return false;
    if (!lastReportDate) return true;
    return lastReportDate < targetFridayKst;
}

async function runWeeklyReportSchedulerCheck() {
    const now = new Date();
    const targetFriday = getThisWeekFridayKST(now);
    try {
        const { data, error } = await supabase
            .from('chat_history')
            .select('created_at')
            .not('jyp_weekly_report', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            logger.error('SCHEDULER', 'weekly report last-date query failed', error);
            return;
        }

        const lastReportDate = data && data.length > 0 && data[0].created_at ? new Date(data[0].created_at) : null;
        logger.info('SCHEDULER', 'weekly report check', {
            now: now.toISOString(),
            targetFriday: targetFriday.toISOString(),
            lastReportDate: lastReportDate ? lastReportDate.toISOString() : null
        });

        if (!shouldGenerateWeeklyReport(now, targetFriday, lastReportDate)) {
            logger.warn('SCHEDULER', 'weekly report skipped');
            return;
        }

        const jyp = new JYPAgent();
        await jyp.initializeContext('system');
        const jypRes = await jyp.inspire('이번 주 K-Culture 트렌드 주간 리포트를 생성해줘', true, '[Scheduler]');
        const extractedReport = extractWeeklyReport(jypRes);
        if (!extractedReport) {
            logger.warn('SCHEDULER', 'weekly report skipped');
            return;
        }

        const payload = {
            user_id: 'system',
            user_query: 'weekly_kculture_report',
            jyp_insight: jypRes,
            jyp_weekly_report: extractedReport,
            created_at: new Date().toISOString()
        };
        const { error: insertError } = await supabase.from('chat_history').insert(payload);
        if (insertError) {
            logger.error('SCHEDULER', 'weekly report insert failed', {
                message: insertError?.message,
                keys: Object.keys(payload),
                details: insertError
            });
            return;
        }

        logger.info('SCHEDULER', 'weekly report generated');
    } catch (e: any) {
        logger.error('SCHEDULER', 'weekly report scheduler error', e);
    }
}

function startWeeklyReportScheduler() {
    if ((globalThis as any).__weeklySchedulerStarted) {
        return;
    }
    (globalThis as any).__weeklySchedulerStarted = true;
    logger.info('SCHEDULER', 'weekly report scheduler started');

    runWeeklyReportSchedulerCheck().catch(() => {
        // runWeeklyReportSchedulerCheck already logs errors internally.
    });

    setInterval(() => {
        runWeeklyReportSchedulerCheck().catch(() => {
            // runWeeklyReportSchedulerCheck already logs errors internally.
        });
    }, 60 * 60 * 1000);
}

function isTrendQueryCheck(query: string): boolean {
    return /(트렌드|유행|k-?pop|드라마|넷플릭스|스포츠|콘텐츠|아이돌|엔터|기회|시장)/i.test(query);
}

const DISCORD_CONTENT_MAX = 2000;
const DISCORD_BODY_CHUNK = 1720;

function chunkDiscordBody(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks.length ? chunks : [''];
}

async function broadcastAgentResponse(userId: string, agentName: string, avatarURL: string, content: string, sourceInteraction: Interaction | Message) {
    let finalContent = content;
    let components: ActionRowBuilder<ButtonBuilder>[] = [];

    if (finalContent.includes('[REASON: NO_DATA]')) {
        finalContent = finalContent.replace(/\[REASON: NO_DATA\]/g, '').trim();
        components = [getNoDataButtons()];
    }

    const originalLen = finalContent.length;
    if (originalLen > 12000) {
        logger.info('DISCORD', 'response summarized for limit', { originalLength: originalLen, agentName });
        finalContent =
            finalContent.slice(0, 12000) + '\n\n_(응답이 길어 이후 생략)_';
    }

    const defaultAvatar = 'https://upload.wikimedia.org/wikipedia/commons/e/ef/System_Preferences_icon_Apple.png';

    const bodyChunks = chunkDiscordBody(finalContent, DISCORD_BODY_CHUNK);
    if (bodyChunks.length > 1) {
        logger.info('DISCORD', 'long response chunked', { parts: bodyChunks.length, agentName });
    }

    const sendParts = async (useWebhook: boolean) => {
        for (let i = 0; i < bodyChunks.length; i++) {
            const header =
                bodyChunks.length === 1
                    ? `## ${agentName}\n`
                    : `## ${agentName} (${i + 1}/${bodyChunks.length})\n`;
            let piece = header + bodyChunks[i];
            if (piece.length > DISCORD_CONTENT_MAX) {
                piece = piece.slice(0, DISCORD_CONTENT_MAX - 1) + '…';
            }
            if (useWebhook) {
                await webhook.send({
                    content: piece,
                    username: agentName,
                    avatarURL: avatarURL || defaultAvatar,
                    components: i === 0 && components.length ? components : undefined
                });
            } else {
                await (sourceInteraction as any).channel.send({
                    content: piece,
                    components: i === 0 && components.length ? components : undefined
                });
            }
        }
    };

    try {
        await sendParts(true);
    } catch (e: any) {
        logger.error('DISCORD', `Webhook send error: ${e.message}`, e);
        if (sourceInteraction && (sourceInteraction as any).channel) {
            try {
                await sendParts(false);
            } catch (e2: any) {
                logger.error('DISCORD', `channel send error: ${e2.message}`, e2);
            }
        }
    }
    return finalContent;
}

async function getFinancialAnchorState(userId: string): Promise<{ hasPortfolio: boolean; hasLifestyle: boolean }> {
    try {
        const [portfolioRes, expensesRes, cashflowRes] = await Promise.all([
            supabase.from('portfolio').select('id').or(`discord_user_id.eq.${userId},user_id.eq.${userId}`).limit(1),
            supabase.from('expenses').select('id').or(`discord_user_id.eq.${userId},user_id.eq.${userId}`).limit(1),
            supabase.from('cashflow').select('id').or(`discord_user_id.eq.${userId},user_id.eq.${userId}`).limit(1)
        ]);
        const hasPortfolio = (portfolioRes.data?.length ?? 0) > 0;
        const hasLifestyle = (expensesRes.data?.length ?? 0) > 0 || (cashflowRes.data?.length ?? 0) > 0;
        return { hasPortfolio, hasLifestyle };
    } catch (e: any) {
        logger.error('GATE', 'financial anchor state check crashed', e);
        return { hasPortfolio: false, hasLifestyle: false };
    }
}

function requiresLifestyleAnchorsForTrigger(customId?: string): boolean {
    if (!customId) return false;
    return customId === 'panel:finance:analyze_spending' || customId === 'panel:ai:spending';
}

async function sendGateEmbed(sourceInteraction: any, description: string) {
    const embed = new EmbedBuilder().setTitle('[System]').setDescription(description).setColor('#e74c3c');
    if (sourceInteraction?.isButton?.() || sourceInteraction?.isModalSubmit?.()) {
        await sourceInteraction.followUp({ embeds: [embed] });
    } else {
        await sourceInteraction.reply({ embeds: [embed] });
    }
}

type UserMode = 'SAFE' | 'BALANCED' | 'AGGRESSIVE';

async function loadUserMode(discordUserId: string): Promise<UserMode> {
    const { data, error } = await supabase
        .from('user_settings')
        .select('mode')
        .eq('discord_user_id', discordUserId)
        .maybeSingle();
    if (error) {
        logger.error('SETTINGS', 'settings load failed', {
            discordUserId,
            message: error.message
        });
        return 'BALANCED';
    }
    const mode = String(data?.mode || 'BALANCED').toUpperCase();
    if (mode === 'SAFE' || mode === 'AGGRESSIVE' || mode === 'BALANCED') {
        logger.info('SETTINGS', 'settings loaded', { discordUserId, mode });
        return mode;
    }
    return 'BALANCED';
}

async function saveUserMode(discordUserId: string, mode: UserMode): Promise<void> {
    const payload = {
        discord_user_id: discordUserId,
        mode,
        updated_at: new Date().toISOString()
    };
    const { error } = await supabase
        .from('user_settings')
        .upsert(payload, { onConflict: 'discord_user_id' });
    if (error) {
        logger.error('SETTINGS', 'settings update failed', {
            discordUserId,
            mode,
            message: error.message
        });
        throw error;
    }
    logger.info('SETTINGS', 'settings updated', { discordUserId, mode });
}

/** 트렌드 패널 전용: 스냅샷·5인 토론 없음, 단일 페르소나 */
async function runTrendAnalysis(
    userId: string,
    userQuery: string,
    sourceInteraction: any,
    topic: TrendTopicKind,
    triggerCustomId?: string
) {
    try {
        logger.info('TREND', 'trend analysis route selected', { topic, customId: triggerCustomId ?? null });
        logger.info('TREND', 'portfolio snapshot skipped', { reason: 'trend_pipeline' });
        const cfg = TREND_TOPIC_CONFIG[topic];
        logger.info('TREND', 'trend persona selected', { personaKey: cfg.personaKey, agentLabel: cfg.agentLabel });

        updateHealth(s => s.ai.lastRoute = 'trend_isolated');

        logger.info('AI', 'Gemini call started');
        const text = await generateTrendSpecialistResponse(topic, userQuery);
        await broadcastAgentResponse(userId, cfg.agentLabel, cfg.avatarUrl, text, sourceInteraction);
        logger.info('AI', 'Gemini call completed');

        const chatHistoryPayload = {
            user_id: userId,
            user_query: userQuery,
            ray_advice: text,
            jyp_insight: null as string | null,
            simons_opportunity: null as string | null,
            drucker_decision: null as string | null,
            cio_decision: null as string | null,
            jyp_weekly_report: null as string | null
        };
        const { error: dbError } = await supabase.from('chat_history').insert(chatHistoryPayload);
        if (dbError) {
            logger.error('DB', '[chat_history][insert] trend failed', { message: dbError?.message });
        } else {
            logger.info('DB', 'chat_history insert success (trend)');
        }
    } catch (err: any) {
        logger.error('ROUTER', '트렌드 분석 에러: ' + err.message, err);
    }
}

/** 금융/포트폴리오 5인 토론 — 스냅샷 주입 */
async function runPortfolioDebate(userId: string, userQuery: string, sourceInteraction: any) {
    try {
        logger.info('AI', 'portfolio debate route selected', { discordUserId: userId });
        const mode = await loadUserMode(userId);
        const snapshot = await buildPortfolioSnapshot(userId);
        const anchorState = await getFinancialAnchorState(userId);
        const triggerId: string | undefined = sourceInteraction?.customId;
        const hasPortfolio = anchorState.hasPortfolio || snapshot.summary.position_count > 0;

        updateHealth(s => s.ai.lastRoute = 'financial_debate');

        if (requiresLifestyleAnchorsForTrigger(triggerId) && !anchorState.hasLifestyle) {
            logger.info('GATE', 'lifestyle_data_required_blocked', { triggerId });
            await sendGateEmbed(
                sourceInteraction,
                '소비·현금흐름 데이터가 없어 이 분석은 실행할 수 없습니다.\n지출 또는 현금흐름을 먼저 등록해 주세요.'
            );
            return;
        }

        if (!hasPortfolio) {
            logger.info('GATE', 'NO_DATA triggered');
            logger.info('AI', 'Gemini skipped due to NO_DATA');
            updateHealth(s => s.ai.lastNoDataTriggered = true);

            const embed = new EmbedBuilder()
                .setTitle('[System]')
                .setDescription('분석에 필요한 포트폴리오(보유 종목) 데이터가 없습니다.\n\n아래 버튼으로 먼저 종목을 등록해 주세요.')
                .setColor('#e74c3c');
            if (sourceInteraction.isButton?.() || sourceInteraction.isModalSubmit?.()) {
                await sourceInteraction.followUp({ embeds: [embed], components: [getNoDataButtons()] });
            } else {
                await sourceInteraction.reply({ embeds: [embed], components: [getNoDataButtons()] });
            }
            return;
        }

        if (hasPortfolio && !anchorState.hasLifestyle) {
            logger.info('GATE', 'partial_analysis_mode', {
                discordUserId: userId,
                reason: 'missing_expenses_or_cashflow'
            });
            logger.info('GATE', 'portfolio_only_mode', {
                discordUserId: userId,
                positionCount: snapshot.summary.position_count
            });
            logger.info('AI', 'debate proceeding with portfolio snapshot only', {
                discordUserId: userId,
                positionCount: snapshot.summary.position_count
            });
        }

        updateHealth(s => s.ai.lastNoDataTriggered = false);

        logger.info('AI', 'Gemini call started');
        const ray = new RayDalioAgent();
        const jyp = new JYPAgent();
        const simons = new JamesSimonsAgent();
        const drucker = new PeterDruckerAgent();
        const cio = new StanleyDruckenmillerAgent();

        await Promise.all([
            ray.initializeContext(userId),
            jyp.initializeContext(userId),
            simons.initializeContext(userId),
            drucker.initializeContext(userId),
            cio.initializeContext(userId)
        ]);
        ray.setPortfolioSnapshot(snapshot.positions);
        jyp.setPortfolioSnapshot(snapshot.positions);
        simons.setPortfolioSnapshot(snapshot.positions);
        drucker.setPortfolioSnapshot(snapshot.positions);
        cio.setPortfolioSnapshot(snapshot.positions);

        logger.info('AI', 'portfolio debate snapshot prepared', {
            discordUserId: userId,
            totalMarketValueKrw: snapshot.summary.total_market_value_krw,
            top3WeightPct: snapshot.summary.top3_weight_pct,
            domesticWeightPct: snapshot.summary.domestic_weight_pct,
            usWeightPct: snapshot.summary.us_weight_pct
        });
        const modePrompt = `[USER_MODE]\n${mode}\nSAFE=보수적, BALANCED=중립, AGGRESSIVE=공격적 기준을 답변 강도에 반영하라.`;
        const snapshotPrompt = `[PORTFOLIO_SNAPSHOT]\n${JSON.stringify(snapshot, null, 2)}\n위 스냅샷을 기준으로만 자산배분/리스크/리밸런싱을 논의하라.`;
        const partialScope =
            hasPortfolio && !anchorState.hasLifestyle
                ? [
                      '[분석 범위]',
                      '- 현재 등록된 **포트폴리오 스냅샷 기준 부분 분석**이다.',
                      '- **생활비 적합성·월 투자여력·현금버퍼 적정성** 등은 지출/현금흐름 데이터 없이 **정밀 판단 불가** — 답변에서 "부분 분석"과 "정밀 분석 불가"를 구분해 명시하라.',
                      '- 지출·현금흐름을 입력하면 위 항목을 정밀화할 수 있다.'
                  ].join('\n')
                : '';
        const effectiveQuery = `${userQuery}\n\n${modePrompt}\n\n${snapshotPrompt}${partialScope ? `\n\n${partialScope}\n` : ''}`;
        const rayRes = await broadcastAgentResponse(
            userId,
            'Ray Dalio (PB)',
            'https://upload.wikimedia.org/wikipedia/commons/4/4e/Ray_Dalio_at_the_World_Economic_Forum_%28cropped%29.jpg',
            await ray.analyze(effectiveQuery, false),
            sourceInteraction
        );
        if (rayRes?.includes('[REASON: NO_DATA]')) {
            logger.warn('AI', 'Ray Dalio aborted due to NO_DATA at logic layer');
            return;
        }

        const jypRes = await broadcastAgentResponse(
            userId,
            'JYP (Analyst)',
            'https://upload.wikimedia.org/wikipedia/commons/4/44/Park_Jin-young_at_WCG_2020.png',
            await jyp.inspire(effectiveQuery, false, rayRes),
            sourceInteraction
        );
        const simonsRes = await broadcastAgentResponse(
            userId,
            'James Simons (Quant)',
            'https://upload.wikimedia.org/wikipedia/commons/4/46/Jim_Simons.jpg',
            await simons.strategize(effectiveQuery, false, `[Ray]\n${rayRes}\n[JYP]\n${jypRes}`),
            sourceInteraction
        );
        const druckerRes = await broadcastAgentResponse(
            userId,
            'Peter Drucker (COO)',
            'https://upload.wikimedia.org/wikipedia/commons/0/00/Peter_Drucker_circa_1980.jpg',
            await drucker.summarizeAndGenerateActions(false, `[Ray]\n${rayRes}\n[JYP]\n${jypRes}\n[Simons]\n${simonsRes}`),
            sourceInteraction
        );
        const cioRes = await broadcastAgentResponse(
            userId,
            'Stanley Druckenmiller (CIO)',
            'https://upload.wikimedia.org/wikipedia/commons/0/0f/Stanley_Druckenmiller.jpg',
            await cio.decide(false, `[Ray]\n${rayRes}\n[JYP]\n${jypRes}\n[Simons]\n${simonsRes}\n[Drucker]\n${druckerRes}`),
            sourceInteraction
        );

        logger.info('AI', 'Gemini call completed');
        const weeklyReport = extractWeeklyReport(jypRes);

        const chatHistoryPayload = {
            user_id: userId,
            user_query: userQuery,
            ray_advice: rayRes,
            jyp_insight: jypRes,
            simons_opportunity: simonsRes,
            drucker_decision: druckerRes,
            cio_decision: cioRes,
            jyp_weekly_report: weeklyReport
        };
        logger.info('DB', 'chat_history payload preview', {
            keys: Object.keys(chatHistoryPayload),
            hasWeeklyReport: !!weeklyReport
        });
        const { error: dbError } = await supabase.from('chat_history').insert(chatHistoryPayload);
        if (dbError) {
            logger.error('DB', '[chat_history][insert] failed', {
                message: dbError?.message,
                keys: Object.keys(chatHistoryPayload),
                hasWeeklyReport: !!weeklyReport,
                details: dbError
            });
        } else {
            logger.info('DB', 'chat_history insert success');
        }
    } catch (err: any) {
        logger.error('ROUTER', '포트폴리오 토론 에러: ' + err.message, err);
    }
}

const financialCommandQueryMap: Record<string, string> = {
    'panel:portfolio:risk': '포트폴리오 리스크 집중 분석',
    'panel:finance:analyze_spending': '최근 소비 패턴 분석 및 미래지향성 평가',
    'panel:finance:stability': '재무 안정성 점검',
    'panel:ai:full': '종합 자산 및 소비 구조 진단',
    'panel:ai:risk': '포트폴리오 리스크 점검',
    'panel:ai:strategy': '실행 가능한 투자 전략 제안',
    'panel:ai:spending': '소비 개선 전략 및 평가'
};

const trendCommandQueryMap: Record<string, string> = {
    'panel:trend:kpop':
        'K-pop 산업·시장·콘텐츠·팬덤·플랫폼 관점에서 현재 핵심 트렌드와 이슈를 상세히 분석해 줘. (개인 포트폴리오·비중 언급 금지)',
    'panel:trend:drama':
        'OTT·드라마·영상 콘텐츠 산업 관점에서 플랫폼 경쟁, 소비 트렌드, 주요 이슈를 분석해 줘. (개인 포트폴리오·비중 언급 금지)',
    'panel:trend:sports':
        '스포츠 비즈니스(리그, 미디어, 스폰서, 팬, 글로벌 시장) 관점에서 구조와 트렌드를 분석해 줘. (개인 포트폴리오·비중 언급 금지)',
    'panel:trend:hot':
        '지금 사회·미디어·산업에서 두드러지는 핫 트렌드와 배경, 소비자 반응, 지속 가능성을 분석해 줘. (개인 포트폴리오·비중 언급 금지)'
};

client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!')) {
        logger.info('COMMAND', `message command received: ${message.content}`, { user: message.author.tag });
    }

    if (message.content === '!메뉴' || message.content === '!패널재설치') {
        const state = loadPanelState();
        let msg: any = null;
        if (state?.channelId === message.channel.id && state.messageId) {
            const oldMsg = await (message.channel as any).messages.fetch(state.messageId).catch(() => null);
            if (oldMsg) {
                msg = await oldMsg.edit(getMainPanel()).catch(() => null);
            }
        }
        if (!msg) {
            msg = await message.reply(getMainPanel());
        }
        savePanelState(msg.channel.id, msg.id);
        logger.info('PANEL', 'Explicit reinstall via text command', {
            channelId: msg.channel.id,
            messageId: msg.id,
            mode: msg.id === state?.messageId ? 'edit_existing' : 'send_new'
        });
        updateHealth(s => s.panels.lastPanelAction = 'manual_reinstall');
        return;
    }

    if (message.content.startsWith('!종목추가')) {
        const parts = message.content.split(' ');
        if (parts.length < 4) return message.reply("❌ 사용법: `!종목추가 [심볼] [수량] [평단가] [종목명?] [섹터?]`");
        const [_, symbolInput, qtyStr, priceStr, name = symbolInput, sector = 'Unknown'] = parts;
        const resolved = resolveInstrumentMetadata(symbolInput, undefined);
        const normalizedSymbol = resolved?.symbol || normalizeSymbol(symbolInput);
        const market = resolved?.market || 'KR';
        const currency = resolved?.currency || 'KRW';
        const displayName = resolved?.displayName || name;
        const quoteSymbol = resolved?.quoteSymbol || normalizedSymbol;
        const exchange = resolved?.exchange || null;
        const qty = parseNumberStrict(qtyStr);
        const price = parseNumberStrict(priceStr);
        if (qty === null || price === null) return message.reply("❌ 수량과 평단가는 숫자로 입력해주세요.");

        await supabase.from('stocks').upsert({ symbol: normalizedSymbol, name: displayName, sector });
        const { error } = await supabase.from('portfolio').insert({
            discord_user_id: getDiscordUserId(message.author),
            symbol: normalizedSymbol,
            display_name: displayName,
            quote_symbol: quoteSymbol,
            exchange,
            market,
            currency,
            avg_purchase_price: price,
            quantity: qty
        });
        if (error) {
            logger.error('DATABASE', 'Supabase insert failure', error);
            return message.reply(`❌ 등록 실패: ${error.message}`);
        }
        return message.reply(`✅ **${displayName}(${quoteSymbol})** 종목 추가 완료!`);
    }

    if (message.content.startsWith('!지출추가')) {
        const parts = message.content.split(' ');
        if (parts.length < 3) return message.reply("❌ 사용법: `!지출추가 [금액] [카테고리] [설명...]`");
        const [_, amountStr, category, ...descParts] = parts;
        const amount = parseNumberStrict(amountStr);
        if (amount === null) return message.reply("❌ 금액은 숫자로 입력해주세요.");

        const { error } = await supabase.from('expenses').insert({
            discord_user_id: getDiscordUserId(message.author), amount, category, description: descParts.join(' ')
        });
        if (error) {
            logger.error('DATABASE', 'Supabase insert failure', error);
            return message.reply(`❌ 등록 실패: ${error.message}`);
        }
        return message.reply(`✅ **${category}** 지출 기록 추가 완료!`);
    }

    if (message.content.startsWith('!현금흐름추가')) {
        const parts = message.content.split(' ');
        if (parts.length < 3) return message.reply("❌ 사용법: `!현금흐름추가 [종류] [금액] [설명...]` (income, fixed_expense, saving, investment, debt_payment, other)");
        const [_, typeRaw, amountStr, ...descParts] = parts;
        const flowType = normalizeFlowType(typeRaw);
        if (!flowType) return message.reply("❌ 잘못된 현금흐름 종류입니다. (income, fixed_expense, saving, investment, debt_payment, other 중 택 1)");
        
        const amount = parseNumberStrict(amountStr);
        if (amount === null) return message.reply("❌ 금액은 숫자로 입력해주세요.");

        const { error } = await supabase.from('cashflow').insert({
            discord_user_id: getDiscordUserId(message.author), flow_type: flowType, amount, description: descParts.join(' '), flow_date: new Date().toISOString()
        });
        if (error) {
            logger.error('DATABASE', 'Supabase insert failure', error);
            return message.reply(`❌ 등록 실패: ${error.message}`);
        }
        return message.reply(`✅ **${flowType}** 현금흐름 추가 완료!`);
    }

    if (message.content.startsWith('!토론')) {
        const userQuery = message.content.replace('!토론', '').trim() || '현재 내 상황을 점검해줘.';
        const isTrend = isTrendQueryCheck(userQuery);

        const statusText = isTrend
            ? '📌 **트렌드·주제 분석 중…** (포트폴리오 스냅샷 미사용)'
            : '📊 **포트폴리오·소비·현금흐름 기준 재무 분석 중...**';

        const loadingMsg = await message.reply(statusText);
        if (isTrend) {
            await runTrendAnalysis(message.author.id, userQuery, loadingMsg, 'free', undefined);
        } else {
            await runPortfolioDebate(message.author.id, userQuery, loadingMsg);
        }
        await loadingMsg.delete().catch(() => {});
    }
});

logger.info('BOOT', 'interactionCreate handler registered', {
    pid: process.pid,
    source: 'index.ts'
});

client.on('interactionCreate', async (interaction: Interaction) => {
    try {
        logger.info('INTERACTION', 'interactionCreate entered', {
            interactionId: (interaction as any).id,
            customId: 'customId' in (interaction as any) ? (interaction as any).customId : null,
            type: interaction.type,
            userId: (interaction as any).user?.id,
            deferred: (interaction as any).deferred,
            replied: (interaction as any).replied
        });

        if (interaction.isButton()) {
            const cid = interaction.customId;
            logger.info('INTERACTION', 'interaction received', {
                customId: cid,
                type: interaction.type,
                discordUserId: interaction.user?.id,
                deferred: interaction.deferred,
                replied: interaction.replied
            });
            logger.info('INTERACTION', `button customId=${cid}`, { user: interaction.user.tag });
            updateHealth(s => {
                s.interactions.lastInteractionAt = new Date().toISOString();
                s.interactions.lastInteractionType = 'button';
                s.interactions.lastCustomId = cid;
            });

            if (cid.startsWith('panel:main:')) {
                logger.info('INTERACTION', 'handler branch entered', {
                    interactionId: interaction.id,
                    customId: interaction.customId
                });
                if (cid === 'panel:main:trend') {
                    logger.info('INTERACTION', 'main trend branch start', {
                        interactionId: interaction.id,
                        discordUserId: interaction.user?.id
                    });
                    try {
                        if (interaction.deferred || interaction.replied) {
                            logger.warn('INTERACTION', 'main trend update skipped — already acknowledged', {
                                interactionId: interaction.id,
                                deferred: interaction.deferred,
                                replied: interaction.replied
                            });
                            return;
                        }
                        await interaction.update(getTrendPanel());
                        logger.info('INTERACTION', 'main trend update success', {
                            interactionId: interaction.id,
                            customId: interaction.customId
                        });
                    } catch (e: any) {
                        logger.error('INTERACTION', 'main trend local catch', {
                            interactionId: interaction.id,
                            message: e?.message,
                            code: e?.code
                        });
                        try {
                            if (!interaction.replied && !interaction.deferred) {
                                await interaction.reply({
                                    ...getTrendPanel(),
                                    flags: 64
                                });
                            }
                        } catch (_) {
                            /* ignore */
                        }
                    }
                    logger.info('INTERACTION', 'main trend branch return', {
                        interactionId: interaction.id,
                        customId: interaction.customId
                    });
                    return;
                }
                if (cid === 'panel:main:portfolio') await safeUpdate(interaction, getPortfolioPanel(), 'panel:main:portfolio');
                else if (cid === 'panel:main:finance') await safeUpdate(interaction, getFinancePanel(), 'panel:main:finance');
                else if (cid === 'panel:main:ai') await safeUpdate(interaction, getAIPanel(), 'panel:main:ai');
                else if (cid === 'panel:main:settings') await safeUpdate(interaction, getSettingsPanel(), 'panel:main:settings');
                else if (cid === 'panel:main:reinstall') await safeUpdate(interaction, getMainPanel(), 'panel:main:reinstall');
                logger.info('INTERACTION', 'handler branch returning', {
                    interactionId: interaction.id,
                    customId: interaction.customId
                });
                return;
            }

            if (cid === 'panel:settings:reinstall') {
                const msg = await (interaction.channel as any)?.send(getMainPanel());
                if (msg) savePanelState(msg.channel.id, msg.id);
                logger.info('PANEL', 'Explicit reinstall via button', { channelId: msg?.channel.id, messageId: msg?.id });
                updateHealth(s => s.panels.lastPanelAction = 'button_reinstall');
                await interaction.message?.delete().catch(()=>{});
                return;
            }

            const trendTopicBtn = trendTopicFromCustomId(cid);
            if (trendTopicBtn != null && trendCommandQueryMap[cid]) {
                const query = trendCommandQueryMap[cid];
                const statusText = '📌 **트렌드·주제 분석 중…** (포트폴리오 스냅샷 미사용)';
                await safeDeferReply(interaction, { flags: 64 });
                await safeEditReplyPayload(interaction, { content: statusText }, `${cid}:status`);
                await runTrendAnalysis(interaction.user.id, query, interaction, trendTopicBtn, cid);
                return;
            }

            if (financialCommandQueryMap[cid]) {
                const query = financialCommandQueryMap[cid];
                const statusText = '📊 **포트폴리오·소비·현금흐름 기준 재무 분석 중...**';
                await safeDeferReply(interaction, { flags: 64 });
                await safeEditReplyPayload(interaction, { content: statusText }, `${cid}:status`);
                await runPortfolioDebate(interaction.user.id, query, interaction);
                return;
            }

            if (cid === 'panel:portfolio:add') {
                const modal = new ModalBuilder().setCustomId('modal:portfolio:add').setTitle('📈 신규 종목 등록');
                modal.addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('symbol').setLabel("심볼 (티커)").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('qty').setLabel("수량").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('price').setLabel("평균 매수 단가").setStyle(TextInputStyle.Short))
                );
                await interaction.showModal(modal);
                return;
            }

            if (cid === 'panel:finance:add_expense') {
                const modal = new ModalBuilder().setCustomId('modal:expense:add').setTitle('💸 지출 기록');
                modal.addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('amount').setLabel("금액").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('category').setLabel("카테고리").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('desc').setLabel("상세 설명").setStyle(TextInputStyle.Paragraph).setRequired(false))
                );
                await interaction.showModal(modal);
                return;
            }

            if (cid === 'panel:finance:add_cashflow') {
                logger.info('INTERACTION', 'button click: panel:finance:add_cashflow', { user: interaction.user.tag });
                const modal = new ModalBuilder().setCustomId('modal:cashflow:add').setTitle('💰 현금흐름 입력');
                modal.addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('flow_type').setLabel("종류 (income/saving/investment/fixed_expense 등)").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('amount').setLabel("금액").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('desc').setLabel("상세 설명").setStyle(TextInputStyle.Paragraph).setRequired(false))
                );
                logger.info('INTERACTION', 'modal open: modal:cashflow:add', { user: interaction.user.tag });
                await interaction.showModal(modal);
                return;
            }

            if (cid === 'panel:ai:ask' || cid === 'panel:trend:free') {
                const modal = new ModalBuilder().setCustomId(cid === 'panel:ai:ask' ? 'modal:ai:ask' : 'modal:trend:free').setTitle(cid === 'panel:ai:ask' ? '✍️ 직접 질문' : '🔍 자유 탐색');
                modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder().setCustomId('query').setLabel("궁금한 내용을 입력하세요").setStyle(TextInputStyle.Paragraph)
                ));
                await interaction.showModal(modal);
                return;
            }

            if (cid === 'panel:portfolio:view') {
                logger.info('INTERACTION', 'portfolio view branch start', {
                    interactionId: interaction.id,
                    customId: interaction.customId
                });
                try {
                    await safeDeferReply(interaction, { flags: 64 });
                    logger.info('INTERACTION', 'portfolio view defer success', {
                        interactionId: interaction.id,
                        customId: interaction.customId
                    });
                    const discordUserId = getDiscordUserId(interaction.user);
                    logger.info('PORTFOLIO', 'portfolio view requested', {
                        interactionId: interaction.id,
                        discordUserId,
                        username: interaction.user.username,
                        customId: interaction.customId
                    });
                    logger.info('PORTFOLIO', 'portfolio select query params', {
                        discordUserId: interaction.user.id
                    });

                    const { data, error } = await supabase
                        .from('portfolio')
                        .select('*')
                        .or(`discord_user_id.eq.${discordUserId},user_id.eq.${discordUserId}`);

                    logger.info('PORTFOLIO', 'portfolio select completed', {
                        discordUserId,
                        rowCount: data?.length ?? 0,
                        firstRows: (data ?? []).slice(0, 5).map((r: any) => ({
                            discord_user_id: r.discord_user_id,
                            user_id: r.user_id,
                            symbol: r.symbol,
                            quantity: r.quantity
                        }))
                    });

                    if (error) {
                        logger.error('DATABASE', 'Supabase select failure: portfolio', {
                            table: 'portfolio',
                            column: 'discord_user_id',
                            discordUserId,
                            message: error.message
                        });
                        await safeEditReply(interaction, `포트폴리오 조회 중 오류가 발생했습니다: ${error.message}`, 'panel:portfolio:view:db_failure');
                        return;
                    }

                    if (!data || data.length === 0) {
                        logger.warn('PORTFOLIO', 'portfolio empty for current user', { discordUserId });
                        await safeEditReply(interaction, '조회된 포트폴리오가 없습니다.', 'panel:portfolio:view:empty');
                        logger.info('INTERACTION', 'handler branch returning', {
                            interactionId: interaction.id,
                            customId: interaction.customId
                        });
                        return;
                    }

                    const snapshot = await buildPortfolioSnapshot(discordUserId);
                    const lines = snapshot.positions.map((p, i) => {
                        const label = p.display_name || p.symbol || p.quote_symbol || 'UNKNOWN';
                        const code = p.quote_symbol || p.symbol;
                        return [
                            `${i + 1}) ${label} (${code})`,
                            `- 수량: ${p.quantity}`,
                            `- 평단: ${p.avg_purchase_price} ${p.currency}`,
                            `- 현재가: ${p.current_price} ${p.price_currency}`,
                            `- 평가액: ${formatKrw(p.market_value_krw)}`,
                            `- 비중: ${p.weight_pct}%`,
                            `- 손익: ${formatKrw(p.pnl_krw)} (${p.return_pct}%)`
                        ].join('\n');
                    });
                    const header = [
                        '**[포트폴리오 요약]**',
                        `총 평가액: ${formatKrw(snapshot.summary.total_market_value_krw)}`,
                        `총 손익: ${formatKrw(snapshot.summary.total_pnl_krw)} (${snapshot.summary.total_return_pct}%)`,
                        `KR/US 비중: ${snapshot.summary.domestic_weight_pct}% / ${snapshot.summary.us_weight_pct}%`,
                        '',
                        '**[보유 종목]**'
                    ].join('\n');
                    await safeEditReply(interaction, `${header}\n${lines.join('\n\n')}`, 'panel:portfolio:view:success');
                } catch (e: any) {
                    (interaction as any).__localErrorHandled = true;
                    logger.error('INTERACTION', 'portfolio view local catch', {
                        message: e?.message,
                        stack: e?.stack,
                        customId: interaction.customId,
                        interactionUserId: interaction.user.id
                    });
                    if (interaction.deferred || interaction.replied) {
                        await safeEditReply(interaction, '포트폴리오 조회 처리 중 예기치 못한 오류가 발생했습니다.', 'panel:portfolio:view:exception');
                    } else {
                        await safeReplyOrFollowUp(interaction, { content: '포트폴리오 조회 처리 중 예기치 못한 오류가 발생했습니다.', flags: 64 }, 'panel:portfolio:view:exception_unacked');
                    }
                }
                logger.info('INTERACTION', 'portfolio view branch return', {
                    interactionId: interaction.id,
                    customId: interaction.customId
                });
                return;
            }

            if (cid === 'panel:portfolio:delete') {
                const modal = new ModalBuilder().setCustomId('modal:portfolio:delete').setTitle('❌ 보유 종목 삭제');
                modal.addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder().setCustomId('symbol').setLabel("삭제할 심볼").setStyle(TextInputStyle.Short)
                    )
                );
                await interaction.showModal(modal);
                return;
            }

            if (cid === 'panel:settings:view') {
                const discordUserId = getDiscordUserId(interaction.user);
                const mode = await loadUserMode(discordUserId);
                await safeReplyOrFollowUp(interaction, { content: `현재 설정 모드: **${mode}**`, ephemeral: true }, 'panel:settings:view');
                return;
            }

            if (cid.startsWith('panel:settings:')) {
                const modeMap: Record<string, UserMode> = {
                    'panel:settings:safe': 'SAFE',
                    'panel:settings:balanced': 'BALANCED',
                    'panel:settings:aggressive': 'AGGRESSIVE'
                };
                const targetMode = modeMap[cid];
                if (!targetMode) return;
                const discordUserId = getDiscordUserId(interaction.user);
                try {
                    await saveUserMode(discordUserId, targetMode);
                    await safeReplyOrFollowUp(interaction, { content: `✅ 성향 설정 저장 완료: **${targetMode}**`, ephemeral: true }, 'panel:settings:update');
                } catch (e: any) {
                    await safeReplyOrFollowUp(interaction, { content: `❌ 설정 저장 실패: ${e?.message || 'unknown'}`, ephemeral: true }, 'panel:settings:update:failure');
                }
                return;
            }
        }

        if (interaction.type === InteractionType.ModalSubmit) {
            const cid = interaction.customId;
            logger.info('INTERACTION', 'interaction received', {
                customId: cid,
                type: interaction.type,
                discordUserId: interaction.user?.id,
                deferred: interaction.deferred,
                replied: interaction.replied
            });
            logger.info('INTERACTION', `modal customId=${cid}`, { user: interaction.user.tag });
            updateHealth(s => {
                s.interactions.lastInteractionAt = new Date().toISOString();
                s.interactions.lastInteractionType = 'modal';
                s.interactions.lastCustomId = cid;
            });

            if (cid === 'modal:trend:free') {
                const query = interaction.fields.getTextInputValue('query');
                const statusText = '📌 **트렌드·주제 분석 중…** (포트폴리오 스냅샷 미사용)';
                await safeDeferReply(interaction, { flags: 64 });
                await safeEditReplyPayload(interaction, { content: statusText }, `${cid}:status`);
                await runTrendAnalysis(interaction.user.id, query, interaction, 'free', cid);
                return;
            }

            if (cid === 'modal:ai:ask') {
                const query = interaction.fields.getTextInputValue('query');
                const statusText = '📊 **포트폴리오·소비·현금흐름 기준 재무 분석 중...**';
                await safeDeferReply(interaction, { flags: 64 });
                await safeEditReplyPayload(interaction, { content: statusText }, `${cid}:status`);
                await runPortfolioDebate(interaction.user.id, query, interaction);
                return;
            }

            if (cid === 'modal:portfolio:add') {
                logger.info('INTERACTION', 'handler branch entered', {
                    interactionId: interaction.id,
                    customId: interaction.customId
                });
                await safeDeferReply(interaction, { flags: 64 });
                try {
                    const rawInput = interaction.fields.getTextInputValue('symbol');
                    const resolved = resolveInstrumentMetadata(rawInput, undefined);
                    const symbol = resolved?.symbol || normalizeSymbol(rawInput);
                    const displayName = resolved?.displayName || rawInput;
                    const quoteSymbol = resolved?.quoteSymbol || symbol;
                    const exchange = resolved?.exchange || null;
                    const market = resolved?.market || 'KR';
                    const currency = resolved?.currency || 'KRW';
                    const qty = parsePositiveAmount(interaction.fields.getTextInputValue('qty'));
                    const price = parsePositiveAmount(interaction.fields.getTextInputValue('price'));
                    if (!qty || !price) {
                        await safeEditReply(interaction, "❌ 수량과 평단가는 0보다 큰 숫자여야 합니다.", 'modal:portfolio:add:validation_failure');
                        return;
                    }
                    const discordUserId = getDiscordUserId(interaction.user);
                    logger.info('PORTFOLIO', 'portfolio upsert requested', {
                        interactionId: interaction.id,
                        discordUserId,
                        username: interaction.user.username,
                        symbol,
                        quantity: qty,
                        avgPurchasePrice: price
                    });
                    const upsertPayloadPreview = {
                        discord_user_id: discordUserId,
                        symbol,
                        display_name: displayName,
                        quote_symbol: quoteSymbol,
                        exchange,
                        market,
                        currency,
                        avg_purchase_price: price,
                        quantity: qty
                    };
                    logger.info('PORTFOLIO', 'portfolio upsert payload', {
                        payload: upsertPayloadPreview
                    });

                    await supabase.from('stocks').upsert({ symbol, name: displayName, sector: 'Unknown' });
                    const { data: existingRows, error: readError } = await supabase
                        .from('portfolio')
                        .select('id,quantity,avg_purchase_price,discord_user_id,user_id')
                        .or(`discord_user_id.eq.${discordUserId},user_id.eq.${discordUserId}`)
                        .eq('symbol', symbol)
                        .limit(50);
                    if (readError) {
                        logger.error('PORTFOLIO', 'portfolio upsert error response sent', {
                            discordUserId: interaction.user.id,
                            symbol,
                            message: readError.message
                        });
                        await safeEditReply(interaction, `❌ 조회 에러: ${readError.message}`, 'modal:portfolio:add:read_error');
                        return;
                    }
                    const rows = existingRows || [];
                    const aggregatedQty = rows.reduce((acc: number, r: any) => acc + Number(r.quantity || 0), 0);
                    const aggregatedCost = rows.reduce((acc: number, r: any) => acc + (Number(r.quantity || 0) * Number(r.avg_purchase_price || 0)), 0);
                    const nextQuantity = aggregatedQty + qty;
                    const nextAvg = nextQuantity > 0 ? ((aggregatedCost + (qty * price)) / nextQuantity) : price;
                    const upsertRes = await supabase
                        .from('portfolio')
                        .upsert({
                            discord_user_id: discordUserId,
                            symbol,
                            display_name: displayName,
                            quote_symbol: quoteSymbol,
                            exchange,
                            market,
                            currency,
                            quantity: nextQuantity,
                            avg_purchase_price: nextAvg,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'discord_user_id,symbol' })
                        .select('id');
                    const error = upsertRes.error;
                    if (error) {
                        logger.error('PORTFOLIO', 'portfolio upsert error response sent', {
                            discordUserId: interaction.user.id,
                            symbol,
                            message: error.message
                        });
                        await safeEditReply(interaction, `❌ 저장 실패: ${error.message}`, 'modal:portfolio:add:db_error');
                        return;
                    }
                    logger.info('PORTFOLIO', 'portfolio upsert completed', {
                        discordUserId,
                        symbol,
                        affectedRows: upsertRes.data?.length ?? 0
                    });
                    await safeEditReply(interaction, `✅ **${displayName} (${quoteSymbol})** 저장 완료!`, 'modal:portfolio:add:success');
                    logger.info('PORTFOLIO', 'portfolio upsert success response sent', {
                        discordUserId: interaction.user.id,
                        symbol
                    });
                    logger.info('INTERACTION', 'handler branch returning', {
                        interactionId: interaction.id,
                        customId: interaction.customId
                    });
                    return;
                } catch (e: any) {
                    logger.error('PORTFOLIO', 'portfolio upsert error response sent', {
                        discordUserId: interaction.user.id,
                        symbol: normalizeSymbol(interaction.fields.getTextInputValue('symbol')),
                        message: e?.message || String(e)
                    });
                    await safeEditReply(interaction, `❌ 저장 실패: ${e?.message || 'unknown error'}`, 'modal:portfolio:add:exception');
                    return;
                }
            }

            if (cid === 'modal:portfolio:delete') {
                const symbol = normalizeSymbol(interaction.fields.getTextInputValue('symbol'));
                const discordUserId = getDiscordUserId(interaction.user);
                const { data, error } = await supabase
                    .from('portfolio')
                    .delete()
                    .or(`discord_user_id.eq.${discordUserId},user_id.eq.${discordUserId}`)
                    .eq('symbol', symbol)
                    .select('id');
                if (error) {
                    logger.error('PORTFOLIO', 'portfolio delete failed', { discordUserId, symbol, message: error.message });
                    await safeReplyOrFollowUp(interaction, { content: `❌ 삭제 중 오류가 발생했습니다: ${error.message}`, ephemeral: true }, 'modal:portfolio:delete:failure');
                    return;
                }
                if (!data || data.length === 0) {
                    logger.warn('PORTFOLIO', 'portfolio delete target not found', { discordUserId, symbol });
                    await safeReplyOrFollowUp(interaction, { content: '해당 심볼은 현재 등록되어 있지 않습니다.', ephemeral: true }, 'modal:portfolio:delete:not_found');
                    return;
                }
                const { count } = await supabase
                    .from('portfolio')
                    .select('id', { count: 'exact', head: true })
                    .or(`discord_user_id.eq.${discordUserId},user_id.eq.${discordUserId}`);
                logger.info('PORTFOLIO', 'portfolio deleted', { discordUserId, symbol, deletedRows: data.length, remainCount: count ?? 0 });
                await safeReplyOrFollowUp(interaction, { content: `✅ 삭제 완료: **${symbol}**\n남은 보유 종목 수: **${count ?? 0}**\n'내 포트폴리오 조회' 버튼으로 확인해 주세요.`, ephemeral: true }, 'modal:portfolio:delete:success');
                return;
            }

            if (cid === 'modal:expense:add') {
                await safeDeferReply(interaction, { flags: 64 });
                const amount = parsePositiveAmount(interaction.fields.getTextInputValue('amount'));
                const category = interaction.fields.getTextInputValue('category');
                const desc = sanitizeDescription(interaction.fields.getTextInputValue('desc'));
                if (!amount) {
                    await safeEditReply(interaction, "입력값을 확인해주세요. 금액이 올바르지 않습니다.", 'modal:expense:add:validation_failure');
                    return;
                }
                
                const { error } = await supabase.from('expenses').insert({
                    discord_user_id: getDiscordUserId(interaction.user), amount, category, description: desc
                });
                if (error) { 
                    logger.error('DATABASE', 'Supabase insert failure', error); 
                    await safeEditReply(interaction, "지출 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", 'modal:expense:add:db_failure');
                    return; 
                }
                await safeEditReply(interaction, `✅ **${category}** 지출 기록 완료!`, 'modal:expense:add:success');
                return;
            }

            if (cid === 'modal:cashflow:add') {
                logger.info('INTERACTION', 'modal submit received: modal:cashflow:add', { user: interaction.user.tag });
                await safeDeferReply(interaction, { flags: 64 });
                try {
                    const flowTypeRaw = interaction.fields.getTextInputValue('flow_type');
                    const flowType = normalizeFlowType(flowTypeRaw);
                    const amount = parsePositiveAmount(interaction.fields.getTextInputValue('amount'));
                    const description = sanitizeDescription(interaction.fields.getTextInputValue('desc'));

                    if (!flowType || !amount) {
                        logger.warn('INTERACTION', 'validation failure: modal:cashflow:add', {
                            flowTypeRaw,
                            amountRaw: interaction.fields.getTextInputValue('amount')
                        });
                        await safeEditReply(interaction, "입력값을 확인해주세요. 금액과 유형이 올바르지 않습니다.", 'modal:cashflow:add:validation_failure');
                        return;
                    }

                    logger.info('INTERACTION', 'validation success: modal:cashflow:add', { flowType, amount });
                    const payload = {
                        discord_user_id: getDiscordUserId(interaction.user),
                        flow_type: flowType,
                        amount,
                        description,
                        flow_date: new Date().toISOString()
                    };

                    logger.info('DB', '[cashflow][insert] attempt', { table: 'cashflow', payloadKeys: Object.keys(payload) });
                    const { error } = await supabase.from('cashflow').insert(payload);
                    if (error) {
                        logSchemaSafeInsertFailure('cashflow', payload, error);
                        await safeEditReply(interaction, "현금흐름 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", 'modal:cashflow:add:db_failure');
                        return;
                    }

                    logger.info('DB', '[cashflow][insert] success', { userId: interaction.user.id, flowType, amount });
                    await safeEditReply(interaction, "현금흐름이 정상적으로 저장되었습니다.", 'modal:cashflow:add:success');
                } catch (modalError: any) {
                    logger.error('INTERACTION', 'modal:cashflow:add exception', modalError);
                    await safeEditReply(interaction, "현금흐름 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", 'modal:cashflow:add:exception');
                }
                return;
            }
        }
    } catch (error) {
        const anyInteraction: any = interaction as any;
        if (anyInteraction.__localErrorHandled) {
            return;
        }
        logger.error('INTERACTION', 'global catch entered', {
            interactionId: anyInteraction.id,
            customId: 'customId' in anyInteraction ? anyInteraction.customId : null,
            deferred: anyInteraction.deferred,
            replied: anyInteraction.replied,
            error: error instanceof Error ? error.message : String(error)
        });
        // Minimize extra ack attempts in global catch
        if (anyInteraction.deferred || anyInteraction.replied) {
            await safeReplyOrFollowUp(anyInteraction, { content: '처리 중 오류가 발생했습니다.', ephemeral: true }, 'interaction:global_catch');
        }
    }
});

// Use clientReady hook to prevent warning & ensure safe boot
client.once(Events.ClientReady, async (c) => {
    logger.info('BOOT', 'ready handler entered', {
        once: true,
        pid: process.pid
    });
    if ((globalThis as any).__aiOfficeReadyHandled) {
        logger.warn('BOOT', 'ready handler already executed, skipping duplicate');
        return;
    }
    (globalThis as any).__aiOfficeReadyHandled = true;
    logger.info('DISCORD', `ready bot=${c.user.tag} guilds=${c.guilds.cache.size}`);
    updateHealth(s => {
        s.discord.ready = true;
        s.discord.botTag = c.user.tag;
        s.discord.guildCount = c.guilds.cache.size;
    });

    // Startup restore + announcement
    await ensureMainPanelOnBoot(client);
    
    logger.info('BOOT', `[🟢 PM2 Status] KJM Office Bot is Online: ${c.user.tag}`);
});

updateHealth(s => s.discord.loginAttempted = true);
startWeeklyReportScheduler();
logger.info('DISCORD', 'login attempt');
client.login(DISCORD_TOKEN).catch(e => {
    logger.error('DISCORD', 'login failure', e);
    updateHealth(s => s.discord.lastError = e.message);
});
