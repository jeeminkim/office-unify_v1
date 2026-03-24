import 'dotenv/config';
import { Client, GatewayIntentBits, WebhookClient, Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Interaction, Events, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } from 'discord.js';
import { logger, updateHealth, startHeartbeat } from './logger';
import { RayDalioAgent, JYPAgent, JamesSimonsAgent, PeterDruckerAgent, StanleyDruckenmillerAgent, hasRequiredAnchoredData } from './agents';
import { createClient } from '@supabase/supabase-js';
import { restoreOrBuildMainPanel, savePanelState, getMainPanel, getPortfolioPanel, getFinancePanel, getAIPanel, getTrendPanel, getSettingsPanel, getNoDataButtons } from './panelManager';

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
    try {
        await interaction.editReply({ content });
        logger.info('INTERACTION', `reply success: ${context}`);
        updateHealth(h => {
            h.interactions.lastInteractionAt = new Date().toISOString();
        });
    } catch (replyError: any) {
        logger.error('INTERACTION', `reply failed: ${context}`, replyError);
        updateHealth(h => h.discord.lastError = `reply_failed:${context}:${replyError?.message || 'unknown'}`);
    }
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

async function broadcastAgentResponse(userId: string, agentName: string, avatarURL: string, content: string, sourceInteraction: Interaction | Message) {
    let finalContent = content;
    let components: ActionRowBuilder<ButtonBuilder>[] = [];
    
    if (finalContent.includes('[REASON: NO_DATA]')) {
        finalContent = finalContent.replace(/\[REASON: NO_DATA\]/g, '').trim();
        components = [getNoDataButtons()];
    }

    const defaultAvatar = "https://upload.wikimedia.org/wikipedia/commons/e/ef/System_Preferences_icon_Apple.png";
    
    try {
        await webhook.send({ 
            content: `## ${agentName}\n${finalContent}`, 
            username: agentName,
            avatarURL: avatarURL || defaultAvatar,
            components: components.length > 0 ? components : undefined
        });
    } catch (e: any) {
        logger.error('DISCORD', `Webhook send error: ${e.message}`, e);
        if (sourceInteraction && (sourceInteraction as any).channel) {
             await (sourceInteraction as any).channel.send({ 
                content: `**[${agentName}]**\n${finalContent}`, 
                components: components.length > 0 ? components : undefined 
            });
        }
    }
    return finalContent;
}

async function checkDataGate(userId: string): Promise<boolean> {
    try {
        const [portfolioRes, expensesRes, cashflowRes] = await Promise.all([
          supabase.from('portfolio').select('id').eq('user_id', userId).limit(1),
          // SCHEMA-SAFE: No ordering, strictly fetching 1 item
          supabase.from('expenses').select('id').eq('user_id', userId).limit(1),
          supabase.from('cashflow').select('id').eq('user_id', userId).limit(1)
        ]);
        
        const validation = hasRequiredAnchoredData({
            portfolio: portfolioRes.data || [],
            expenses: expensesRes.data || [],
            cashflow: cashflowRes.data || []
        });

        return validation.ok;
    } catch (e: any) {
        logger.error('GATE', 'Data gate checking crashed', e);
        return false;
    }
}

async function runDebate(userId: string, userQuery: string, sourceInteraction: any) {
    try {
        const isTrendQuery = isTrendQueryCheck(userQuery);
        const isDataOk = await checkDataGate(userId);
        
        logger.info('ROUTER', `isTrend=${isTrendQuery}`);
        updateHealth(s => s.ai.lastRoute = isTrendQuery ? 'trend' : 'financial');

        if (!isTrendQuery && !isDataOk) {
            logger.info('GATE', 'NO_DATA triggered');
            logger.info('AI', 'Gemini skipped due to NO_DATA');
            updateHealth(s => s.ai.lastNoDataTriggered = true);
            
            const embed = new EmbedBuilder()
              .setTitle("[System]")
              .setDescription("분석에 필요한 앵커 데이터가 부족합니다.\n\n아래 버튼으로 먼저 데이터를 입력해주세요.")
              .setColor('#e74c3c');
            if (sourceInteraction.isButton?.() || sourceInteraction.isModalSubmit?.()) {
                 await sourceInteraction.followUp({ embeds: [embed], components: [getNoDataButtons()] });
            } else {
                 await sourceInteraction.reply({ embeds: [embed], components: [getNoDataButtons()] });
            }
            return;
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

        const rayRes = await broadcastAgentResponse(userId, "Ray Dalio (PB)", "https://upload.wikimedia.org/wikipedia/commons/4/4e/Ray_Dalio_at_the_World_Economic_Forum_%28cropped%29.jpg", await ray.analyze(userQuery, isTrendQuery), sourceInteraction);
        if (rayRes?.includes("[REASON: NO_DATA]") && !isTrendQuery) {
            logger.warn('AI', 'Ray Dalio aborted due to NO_DATA at logic layer');
            return;
        }

        const jypRes = await broadcastAgentResponse(userId, "JYP (Analyst)", "https://upload.wikimedia.org/wikipedia/commons/4/44/Park_Jin-young_at_WCG_2020.png", await jyp.inspire(userQuery, isTrendQuery, rayRes), sourceInteraction);
        const simonsRes = await broadcastAgentResponse(userId, "James Simons (Quant)", "https://upload.wikimedia.org/wikipedia/commons/4/46/Jim_Simons.jpg", await simons.strategize(userQuery, isTrendQuery, `[Ray]\n${rayRes}\n[JYP]\n${jypRes}`), sourceInteraction);
        const druckerRes = await broadcastAgentResponse(userId, "Peter Drucker (COO)", "https://upload.wikimedia.org/wikipedia/commons/0/00/Peter_Drucker_circa_1980.jpg", await drucker.summarizeAndGenerateActions(isTrendQuery, `[Ray]\n${rayRes}\n[JYP]\n${jypRes}\n[Simons]\n${simonsRes}`), sourceInteraction);
        const cioRes = await broadcastAgentResponse(userId, "Stanley Druckenmiller (CIO)", "https://upload.wikimedia.org/wikipedia/commons/0/0f/Stanley_Druckenmiller.jpg", await cio.decide(isTrendQuery, `[Ray]\n${rayRes}\n[JYP]\n${jypRes}\n[Simons]\n${simonsRes}\n[Drucker]\n${druckerRes}`), sourceInteraction);

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
        logger.info('DB', 'chat_history insert attempt', {
            keys: Object.keys(chatHistoryPayload)
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
        logger.error('ROUTER', "토론 에러: " + err.message, err);
    }
}

const commandQueryMap: Record<string, string> = {
    'panel:portfolio:risk': "포트폴리오 리스크 집중 분석",
    'panel:finance:analyze_spending': "최근 소비 패턴 분석 및 미래지향성 평가",
    'panel:finance:stability': "재무 안정성 점검",
    'panel:ai:full': "종합 자산 및 소비 구조 진단",
    'panel:ai:risk': "포트폴리오 리스크 점검",
    'panel:ai:strategy': "실행 가능한 투자 전략 제안",
    'panel:ai:spending': "소비 개선 전략 및 평가",
    'panel:trend:kpop': "현재 K-pop 시장 트렌드와 투자 기회 분석",
    'panel:trend:drama': "OTT/드라마 콘텐츠 트렌드 분석",
    'panel:trend:sports': "스포츠 산업의 자본 흐름 모델 분석",
    'panel:trend:hot': "요즘 가장 핫한 투자 트렌드와 기회 발굴"
};

client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!')) {
        logger.info('COMMAND', `message command received: ${message.content}`, { user: message.author.tag });
    }

    if (message.content === '!메뉴' || message.content === '!패널재설치') {
        const msg = await message.reply(getMainPanel());
        savePanelState(msg.channel.id, msg.id);
        logger.info('PANEL', 'Explicit reinstall via text command', { channelId: msg.channel.id, messageId: msg.id });
        updateHealth(s => s.panels.lastPanelAction = 'manual_reinstall');
        return;
    }

    if (message.content.startsWith('!종목추가')) {
        const parts = message.content.split(' ');
        if (parts.length < 4) return message.reply("❌ 사용법: `!종목추가 [심볼] [수량] [평단가] [종목명?] [섹터?]`");
        const [_, symbol, qtyStr, priceStr, name = symbol, sector = 'Unknown'] = parts;
        const qty = parseNumberStrict(qtyStr);
        const price = parseNumberStrict(priceStr);
        if (qty === null || price === null) return message.reply("❌ 수량과 평단가는 숫자로 입력해주세요.");

        await supabase.from('stocks').upsert({ symbol, name, sector });
        const { error } = await supabase.from('portfolio').insert({
            user_id: message.author.id, symbol, avg_purchase_price: price, quantity: qty
        });
        if (error) {
            logger.error('DATABASE', 'Supabase insert failure', error);
            return message.reply(`❌ 등록 실패: ${error.message}`);
        }
        return message.reply(`✅ **${name}(${symbol})** 종목 추가 완료!`);
    }

    if (message.content.startsWith('!지출추가')) {
        const parts = message.content.split(' ');
        if (parts.length < 3) return message.reply("❌ 사용법: `!지출추가 [금액] [카테고리] [설명...]`");
        const [_, amountStr, category, ...descParts] = parts;
        const amount = parseNumberStrict(amountStr);
        if (amount === null) return message.reply("❌ 금액은 숫자로 입력해주세요.");

        const { error } = await supabase.from('expenses').insert({
            user_id: message.author.id, amount, category, description: descParts.join(' ')
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
            user_id: message.author.id, flow_type: flowType, amount, description: descParts.join(' '), flow_date: new Date().toISOString()
        });
        if (error) {
            logger.error('DATABASE', 'Supabase insert failure', error);
            return message.reply(`❌ 등록 실패: ${error.message}`);
        }
        return message.reply(`✅ **${flowType}** 현금흐름 추가 완료!`);
    }

    if (message.content.startsWith('!토론')) {
        const userQuery = message.content.replace('!토론', '').trim() || "현재 내 상황을 점검해줘.";
        const isTrend = isTrendQueryCheck(userQuery);
        
        const statusText = isTrend 
            ? "📊 **포트폴리오 / 지출 / 현금흐름 + 트렌드 데이터를 기반으로 분석 중...**" 
            : "📊 **포트폴리오 / 지출 / 현금흐름 데이터를 기준으로 분석 중...**";
            
        const loadingMsg = await message.reply(statusText);
        await runDebate(message.author.id, userQuery, loadingMsg);
        await loadingMsg.delete().catch(()=>{});
    }
});

client.on('interactionCreate', async (interaction: Interaction) => {
    try {
        if (interaction.isButton()) {
            const cid = interaction.customId;
            logger.info('INTERACTION', `button customId=${cid}`, { user: interaction.user.tag });
            updateHealth(s => {
                s.interactions.lastInteractionAt = new Date().toISOString();
                s.interactions.lastInteractionType = 'button';
                s.interactions.lastCustomId = cid;
            });

            if (cid.startsWith('panel:main:')) {
                if (cid === 'panel:main:portfolio') await interaction.update(getPortfolioPanel());
                else if (cid === 'panel:main:finance') await interaction.update(getFinancePanel());
                else if (cid === 'panel:main:ai') await interaction.update(getAIPanel());
                else if (cid === 'panel:main:trend') await interaction.update(getTrendPanel());
                else if (cid === 'panel:main:settings') await interaction.update(getSettingsPanel());
                else if (cid === 'panel:main:reinstall') await interaction.update(getMainPanel());
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

            if (commandQueryMap[cid]) {
                const query = commandQueryMap[cid];
                const statusText = isTrendQueryCheck(query) 
                    ? "📊 **포트폴리오 / 지출 / 현금흐름 + 트렌드 데이터를 기반으로 분석 중...**" 
                    : "📊 **포트폴리오 / 지출 / 현금흐름 데이터를 기준으로 분석 중...**";
                await interaction.reply({ content: statusText, ephemeral: false });
                await runDebate(interaction.user.id, query, interaction);
                await interaction.deleteReply().catch(()=>{});
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
                await interaction.deferReply({ ephemeral: true });
                try {
                    const supabaseUrlPrefix = (SUPABASE_URL || '').slice(0, 24);
                    const supabaseKeyPrefix = (SUPABASE_KEY || '').slice(0, 12);
                    logger.info('INTERACTION', 'portfolio view button debug', {
                        customId: interaction.customId,
                        interactionUserId: interaction.user.id,
                        supabaseUrlPrefix,
                        supabaseKeyPrefix
                    });

                    const { data, error } = await supabase
                        .from('portfolio')
                        .select('*')
                        .eq('user_id', interaction.user.id);

                    logger.info('DATABASE', 'portfolio query result debug', {
                        userId: interaction.user.id,
                        rowCount: data?.length ?? 0,
                        data,
                        error
                    });

                    if (error) {
                        logger.error('DATABASE', 'Supabase select failure: portfolio', error);
                        await safeEditReply(interaction, `포트폴리오 조회 중 오류가 발생했습니다: ${error.message}`, 'panel:portfolio:view:db_failure');
                        return;
                    }

                    if (!data || data.length === 0) {
                        await safeEditReply(interaction, `조회된 포트폴리오가 없습니다 (user_id=${interaction.user.id})`, 'panel:portfolio:view:empty');
                        return;
                    }

                    const msg = data.map(d => `- ${d.symbol} : ${d.quantity}주 (평단 ${d.avg_purchase_price})`).join('\n');
                    await safeEditReply(interaction, `**[내 포트폴리오]**\n${msg}`, 'panel:portfolio:view:success');
                } catch (e: any) {
                    logger.error('INTERACTION', 'portfolio view handler exception', {
                        message: e?.message,
                        stack: e?.stack,
                        customId: interaction.customId,
                        interactionUserId: interaction.user.id
                    });
                    await safeEditReply(interaction, '포트폴리오 조회 처리 중 예기치 못한 오류가 발생했습니다.', 'panel:portfolio:view:exception');
                }
                return;
            }

            if (cid === 'panel:portfolio:delete') {
                await interaction.reply({ content: "`!종목삭제 [심볼]` 명령어를 이용해 주세요 (개발 중)", ephemeral: true });
                return;
            }

            if (cid.startsWith('panel:settings:')) {
                await interaction.reply({ content: "✅ 성향 설정이 저장되었습니다. (추후 모델 Temperature 적용 예정)", ephemeral: true });
                return;
            }
        }

        if (interaction.type === InteractionType.ModalSubmit) {
            const cid = interaction.customId;
            logger.info('INTERACTION', `modal customId=${cid}`, { user: interaction.user.tag });
            updateHealth(s => {
                s.interactions.lastInteractionAt = new Date().toISOString();
                s.interactions.lastInteractionType = 'modal';
                s.interactions.lastCustomId = cid;
            });

            if (cid === 'modal:ai:ask' || cid === 'modal:trend:free') {
                const query = interaction.fields.getTextInputValue('query');
                const statusText = isTrendQueryCheck(query) 
                    ? "📊 **포트폴리오 / 지출 / 현금흐름 + 트렌드 데이터를 기반으로 분석 중...**" 
                    : "📊 **포트폴리오 / 지출 / 현금흐름 데이터를 기준으로 분석 중...**";
                await interaction.reply({ content: statusText, ephemeral: false });
                await runDebate(interaction.user.id, query, interaction);
                await interaction.deleteReply().catch(()=>{});
                return;
            }

            if (cid === 'modal:portfolio:add') {
                const symbol = interaction.fields.getTextInputValue('symbol');
                const qty = parsePositiveAmount(interaction.fields.getTextInputValue('qty'));
                const price = parsePositiveAmount(interaction.fields.getTextInputValue('price'));
                if (!qty || !price) return interaction.reply({ content: "❌ 수량과 평단가는 0보다 큰 숫자여야 합니다.", ephemeral: true });
                
                await supabase.from('stocks').upsert({ symbol, name: symbol, sector: 'Unknown' });
                const { error } = await supabase.from('portfolio').insert({
                    user_id: interaction.user.id, symbol, avg_purchase_price: price, quantity: qty
                });
                if (error) { 
                    logger.error('DATABASE', 'Supabase insert failure', error); 
                    return interaction.reply({ content: `❌ 에러: ${error.message}`, ephemeral: true }); 
                }
                return interaction.reply({ content: `✅ **${symbol}** 픽 완료!`, ephemeral: true });
            }

            if (cid === 'modal:expense:add') {
                await interaction.deferReply({ ephemeral: true });
                const amount = parsePositiveAmount(interaction.fields.getTextInputValue('amount'));
                const category = interaction.fields.getTextInputValue('category');
                const desc = sanitizeDescription(interaction.fields.getTextInputValue('desc'));
                if (!amount) {
                    await safeEditReply(interaction, "입력값을 확인해주세요. 금액이 올바르지 않습니다.", 'modal:expense:add:validation_failure');
                    return;
                }
                
                const { error } = await supabase.from('expenses').insert({
                    user_id: interaction.user.id, amount, category, description: desc
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
                await interaction.deferReply({ ephemeral: true });
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
                        user_id: interaction.user.id,
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
        logger.error('INTERACTION', "Interaction Error: " + (error as Error).message, error);
    }
});

// Use clientReady hook to prevent warning & ensure safe boot
client.once(Events.ClientReady, async (c) => {
    logger.info('DISCORD', `ready bot=${c.user.tag} guilds=${c.guilds.cache.size}`);
    updateHealth(s => {
        s.discord.ready = true;
        s.discord.botTag = c.user.tag;
        s.discord.guildCount = c.guilds.cache.size;
    });

    // Startup Restore Logic decoupled from DB
    await restoreOrBuildMainPanel(client);
    
    logger.info('BOOT', `[🟢 PM2 Status] KJM Office Bot is Online: ${c.user.tag}`);
});

updateHealth(s => s.discord.loginAttempted = true);
startWeeklyReportScheduler();
logger.info('DISCORD', 'login attempt');
client.login(DISCORD_TOKEN).catch(e => {
    logger.error('DISCORD', 'login failure', e);
    updateHealth(s => s.discord.lastError = e.message);
});
