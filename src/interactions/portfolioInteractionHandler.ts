/**
 * 포트폴리오 패널 관련 Discord interaction 분기 (index.ts에서 위치만 이동, 로직 동일).
 */
import {
  ActionRowBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../logger';
import { handlePortfolioAddModalSubmit } from './instrumentConfirmationHandler';

export type PortfolioInteractionDeps = {
  getDiscordUserId: (user: { id: string }) => string;
  pendingBuyAccountId: Map<string, string>;
  pendingSellAccountId: Map<string, string>;
  getPortfolioMorePanel: () => any;
  safeDeferReply: (interaction: any, opts?: any) => Promise<boolean>;
  safeEditReply: (interaction: any, content: string, context: string) => Promise<void>;
  safeUpdate: (interaction: any, payload: any, context: string) => Promise<void>;
  safeReplyOrFollowUp: (interaction: any, payload: any, context: string) => Promise<void>;
  listUserAccounts: (discordUserId: string) => Promise<any[]>;
  GENERAL_ACCOUNT_NAME: string;
  accountTypeLabelKo: (t: string) => string;
  findFirstRetirementAccount: (discordUserId: string) => Promise<any | null>;
  runPortfolioQueryFromButton: (
    interaction: any,
    discordUserId: string,
    uiMode: 'default' | 'all' | 'retirement' | 'account',
    opts: {
      accountId?: string;
      accountName?: string;
      accountType?: string;
      orchestratorCustomId: string;
    }
  ) => Promise<void>;
  runPortfolioQueryFromAccountSelect: (interaction: any, discordUserId: string, accountId: string) => Promise<void>;
};

export type PortfolioModalDeps = PortfolioInteractionDeps & {
  supabase: SupabaseClient;
  resolveInstrumentMetadata: (symbol: string, market?: string) => any;
  normalizeSymbol: (value: string) => string;
  parsePositiveAmount: (value: string) => number | null;
  recordBuyTrade: (args: any) => Promise<any>;
  recordSellTrade: (args: any) => Promise<any>;
  findPortfolioRowForSymbol: (discordUserId: string, symbol: string) => Promise<any>;
  findPortfolioRowInAccount: (discordUserId: string, symbol: string, accountId: string) => Promise<any>;
  learnBehaviorFromTrades: (discordUserId: string) => Promise<void>;
};

function uid(d: PortfolioInteractionDeps, interaction: any) {
  return d.getDiscordUserId(interaction.user);
}

/** @returns true if consumed */
export async function tryHandlePortfolioButton(interaction: any, d: PortfolioInteractionDeps): Promise<boolean> {
  const cid = interaction.customId as string;

  if (cid === 'panel:portfolio:more') {
    logger.info('UI', 'portfolio panel rendered', { variant: 'more' });
    await d.safeUpdate(interaction, d.getPortfolioMorePanel(), 'panel:portfolio:more');
    return true;
  }

  if (cid === 'panel:portfolio:accounts') {
    await d.safeDeferReply(interaction, { flags: 64 });
    const discordUserId = uid(d, interaction);
    try {
      const rows = await d.listUserAccounts(discordUserId);
      if (!rows.length) {
        await d.safeEditReply(
          interaction,
          '등록된 계좌가 없습니다. 채팅에서 `!계좌추가 계좌이름 유형`으로 추가할 수 있습니다.',
          'panel:portfolio:accounts:empty'
        );
        return true;
      }
      const lines = rows.map((a: any) => {
        const isGen = a.account_name === d.GENERAL_ACCOUNT_NAME;
        const badge = isGen
          ? '[기본]'
          : a.account_type === 'RETIREMENT' || a.account_type === 'PENSION'
            ? '[퇴직연금]'
            : `[${d.accountTypeLabelKo(a.account_type)}]`;
        return `· **${a.account_name}** ${badge}`;
      });
      const text = ['**내 계좌**', '', ...lines, '', `_일반계좌가 기본 매매·조회 계좌입니다._`].join('\n');
      await d.safeEditReply(interaction, text, 'panel:portfolio:accounts:ok');
    } catch (_e: any) {
      await d.safeEditReply(interaction, `계좌 목록을 불러오지 못했습니다.`, 'panel:portfolio:accounts:err');
    }
    return true;
  }

  if (cid === 'panel:portfolio:view:pick') {
    const discordUserId = uid(d, interaction);
    try {
      const rows = await d.listUserAccounts(discordUserId);
      if (!rows.length) {
        await interaction.reply({
          content: '등록된 계좌가 없습니다. `!계좌추가`로 먼저 추가해 주세요.',
          ephemeral: true
        });
        return true;
      }
      const select = new StringSelectMenuBuilder()
        .setCustomId('select:portfolio:account')
        .setPlaceholder('조회할 계좌 선택')
        .addOptions(
          rows.slice(0, 25).map((a: any) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(`${a.account_name} (${d.accountTypeLabelKo(a.account_type)})`.slice(0, 100))
              .setValue(a.id)
          )
        );
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
      await interaction.reply({
        content: '계좌를 선택하면 해당 계좌만 조회합니다.',
        components: [row],
        ephemeral: true
      });
      logger.info('UI', 'advanced account selector used', { purpose: 'view_by_account' });
    } catch (_e: any) {
      await interaction.reply({ content: '계좌 목록을 불러오지 못했습니다.', ephemeral: true }).catch(() => {});
    }
    return true;
  }

  if (cid === 'panel:portfolio:view:retirement') {
    const discordUserId = uid(d, interaction);
    try {
      const r = await d.findFirstRetirementAccount(discordUserId);
      if (!r) {
        await d.safeDeferReply(interaction, { flags: 64 });
        await d.safeEditReply(
          interaction,
          '퇴직연금 계좌가 없습니다. `!계좌추가 퇴직연금계좌 RETIREMENT`로 추가하거나 **계좌 관리**를 이용하세요.',
          'panel:portfolio:view:retirement:none'
        );
        return true;
      }
      await d.runPortfolioQueryFromButton(interaction, discordUserId, 'retirement', {
        accountId: r.id,
        accountName: r.account_name,
        accountType: r.account_type,
        orchestratorCustomId: cid
      });
    } catch (e: any) {
      (interaction as any).__localErrorHandled = true;
      await d.safeDeferReply(interaction, { flags: 64 }).catch(() => {});
      await d.safeEditReply(interaction, '조회 처리 중 오류가 발생했습니다.', 'panel:portfolio:view:retirement:ex').catch(() => {});
    }
    return true;
  }

  if (cid === 'panel:portfolio:add:other') {
    const discordUserId = uid(d, interaction);
    try {
      const rows = await d.listUserAccounts(discordUserId);
      if (!rows.length) {
        await interaction.reply({
          content: '등록된 계좌가 없습니다. 먼저 `!계좌추가`로 계좌를 만든 뒤 이용하세요.',
          ephemeral: true
        });
        return true;
      }
      const select = new StringSelectMenuBuilder()
        .setCustomId('select:portfolio:buy')
        .setPlaceholder('매수를 반영할 계좌')
        .addOptions(
          rows.slice(0, 25).map((a: any) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(`${a.account_name} (${d.accountTypeLabelKo(a.account_type)})`.slice(0, 100))
              .setValue(a.id)
          )
        );
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
      await interaction.reply({
        content: '계좌를 고른 뒤 입력 창이 열립니다.',
        components: [row],
        ephemeral: true
      });
      logger.info('UI', 'advanced account selector used', { purpose: 'buy' });
    } catch (_e: any) {
      await interaction.reply({ content: '계좌 목록을 불러오지 못했습니다.', ephemeral: true }).catch(() => {});
    }
    return true;
  }

  if (cid === 'panel:portfolio:delete:other') {
    const discordUserId = uid(d, interaction);
    try {
      const rows = await d.listUserAccounts(discordUserId);
      if (!rows.length) {
        await interaction.reply({
          content: '등록된 계좌가 없습니다.',
          ephemeral: true
        });
        return true;
      }
      const select = new StringSelectMenuBuilder()
        .setCustomId('select:portfolio:sell')
        .setPlaceholder('매도할 계좌')
        .addOptions(
          rows.slice(0, 25).map((a: any) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(`${a.account_name} (${d.accountTypeLabelKo(a.account_type)})`.slice(0, 100))
              .setValue(a.id)
          )
        );
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
      await interaction.reply({
        content: '계좌를 고른 뒤 매도 입력 창이 열립니다.',
        components: [row],
        ephemeral: true
      });
      logger.info('UI', 'advanced account selector used', { purpose: 'sell' });
    } catch (_e: any) {
      await interaction.reply({ content: '계좌 목록을 불러오지 못했습니다.', ephemeral: true }).catch(() => {});
    }
    return true;
  }

  if (cid === 'panel:portfolio:add') {
    d.pendingBuyAccountId.delete(uid(d, interaction));
    d.pendingSellAccountId.delete(uid(d, interaction));
    logger.info('UI', 'trade modal opened', { flow: 'buy_default' });
    const modal = new ModalBuilder().setCustomId('modal:portfolio:add').setTitle('➕ 종목 추가 (일반계좌)');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('symbol').setLabel('심볼 (티커)').setStyle(TextInputStyle.Short)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('qty').setLabel('수량').setStyle(TextInputStyle.Short)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('price').setLabel('평균 매수 단가').setStyle(TextInputStyle.Short)
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  if (cid === 'panel:portfolio:view' || cid === 'panel:portfolio:view:all') {
    const isAll = cid === 'panel:portfolio:view:all';
    const discordUserId = uid(d, interaction);
    try {
      await d.runPortfolioQueryFromButton(interaction, discordUserId, isAll ? 'all' : 'default', {
        orchestratorCustomId: cid
      });
    } catch (e: any) {
      (interaction as any).__localErrorHandled = true;
      logger.error('INTERACTION', 'portfolio view local catch', {
        message: e?.message,
        stack: e?.stack,
        customId: interaction.customId,
        interactionUserId: interaction.user.id
      });
      if (interaction.deferred || interaction.replied) {
        await d.safeEditReply(interaction, '포트폴리오 조회 처리 중 오류가 발생했습니다.', 'panel:portfolio:view:exception');
      } else {
        await d.safeReplyOrFollowUp(
          interaction,
          { content: '포트폴리오 조회 처리 중 오류가 발생했습니다.', flags: 64 },
          'panel:portfolio:view:exception_unacked'
        );
      }
    }
    return true;
  }

  if (cid === 'panel:portfolio:delete') {
    d.pendingBuyAccountId.delete(uid(d, interaction));
    d.pendingSellAccountId.delete(uid(d, interaction));
    logger.info('UI', 'trade modal opened', { flow: 'sell_default' });
    const modal = new ModalBuilder().setCustomId('modal:portfolio:delete').setTitle('➖ 종목 매도 (일반계좌)');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('symbol').setLabel('심볼 (티커)').setStyle(TextInputStyle.Short)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('qty')
          .setLabel('매도 수량 (비우면 전량)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('sell_price')
          .setLabel('매도 단가 (비우면 평단가)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  return false;
}

export async function tryHandlePortfolioStringSelect(interaction: any, d: PortfolioInteractionDeps): Promise<boolean> {
  const sid = interaction.customId as string;
  const discordUserId = uid(d, interaction);

  if (sid === 'select:portfolio:account') {
    const accountId = interaction.values[0];
    try {
      await d.runPortfolioQueryFromAccountSelect(interaction, discordUserId, accountId);
    } catch (e: any) {
      logger.error('INTERACTION', 'select portfolio account failed', e);
      await interaction.editReply({ content: '조회 중 오류가 발생했습니다.', components: [] }).catch(() => {});
    }
    return true;
  }

  if (sid === 'select:portfolio:buy') {
    const accountId = interaction.values[0];
    d.pendingBuyAccountId.set(discordUserId, accountId);
    logger.info('UI', 'trade modal opened', { flow: 'buy_advanced' });
    const modal = new ModalBuilder().setCustomId('modal:portfolio:add').setTitle('➕ 종목 추가 (선택 계좌)');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('symbol').setLabel('심볼 (티커)').setStyle(TextInputStyle.Short)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('qty').setLabel('수량').setStyle(TextInputStyle.Short)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('price').setLabel('평균 매수 단가').setStyle(TextInputStyle.Short)
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  if (sid === 'select:portfolio:sell') {
    const accountId = interaction.values[0];
    d.pendingSellAccountId.set(discordUserId, accountId);
    logger.info('UI', 'trade modal opened', { flow: 'sell_advanced' });
    const modal = new ModalBuilder().setCustomId('modal:portfolio:delete').setTitle('➖ 종목 매도 (선택 계좌)');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('symbol').setLabel('심볼 (티커)').setStyle(TextInputStyle.Short)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('qty')
          .setLabel('매도 수량 (비우면 전량)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('sell_price')
          .setLabel('매도 단가 (비우면 평단가)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  return false;
}

export async function tryHandlePortfolioModalSubmit(interaction: any, d: PortfolioModalDeps): Promise<boolean> {
  const cid = interaction.customId as string;

  if (cid === 'modal:portfolio:add') {
    logger.info('INTERACTION', 'handler branch entered', {
      interactionId: interaction.id,
      customId: interaction.customId
    });
    return handlePortfolioAddModalSubmit(interaction, d);
  }

  if (cid === 'modal:portfolio:delete') {
    await d.safeDeferReply(interaction, { flags: 64 });
    try {
      const symbol = d.normalizeSymbol(interaction.fields.getTextInputValue('symbol'));
      const qtyRaw = (interaction.fields.getTextInputValue('qty') || '').trim();
      const priceRaw = (interaction.fields.getTextInputValue('sell_price') || '').trim();
      const discordUserId = d.getDiscordUserId(interaction.user);

      const sellOverride = d.pendingSellAccountId.get(discordUserId);
      if (sellOverride) d.pendingSellAccountId.delete(discordUserId);

      const found = sellOverride
        ? await d.findPortfolioRowInAccount(discordUserId, symbol, sellOverride)
        : await d.findPortfolioRowForSymbol(discordUserId, symbol);
      if (!found) {
        logger.warn('PORTFOLIO', 'sell target not found', { discordUserId, symbol });
        await d.safeEditReply(interaction, '해당 심볼은 현재 등록되어 있지 않습니다.', 'modal:portfolio:delete:not_found');
        return true;
      }

      const maxQty = Number(found.row.quantity || 0);
      if (!Number.isFinite(maxQty) || maxQty <= 0) {
        await d.safeEditReply(interaction, '보유 수량이 없습니다.', 'modal:portfolio:delete:empty');
        return true;
      }
      let finalQty: number;
      if (qtyRaw) {
        const pq = d.parsePositiveAmount(qtyRaw);
        if (pq === null) {
          await d.safeEditReply(interaction, '매도 수량은 0보다 큰 숫자여야 합니다.', 'modal:portfolio:delete:bad_qty');
          return true;
        }
        finalQty = pq;
      } else {
        finalQty = maxQty;
      }
      if (!finalQty || finalQty <= 0 || !Number.isFinite(finalQty)) {
        await d.safeEditReply(interaction, '매도 수량을 확인해 주세요.', 'modal:portfolio:delete:bad_qty');
        return true;
      }
      if (finalQty > maxQty) {
        await d.safeEditReply(
          interaction,
          `매도 수량이 보유(${maxQty})를 초과합니다.`,
          'modal:portfolio:delete:qty_overflow'
        );
        return true;
      }

      const avg = Number(found.row.avg_purchase_price || 0);
      const sellPrice = priceRaw ? d.parsePositiveAmount(priceRaw) : avg;
      if (sellPrice === null || sellPrice <= 0) {
        await d.safeEditReply(interaction, '매도 단가를 확인해 주세요.', 'modal:portfolio:delete:bad_price');
        return true;
      }

      const { realizedPnlKrw } = await d.recordSellTrade({
        discordUserId,
        accountId: found.accountId,
        symbol,
        sellQuantity: finalQty,
        sellPricePerUnit: sellPrice,
        fee: 0,
        memo: 'modal:portfolio:delete'
      });
      void d.learnBehaviorFromTrades(discordUserId);

      const { count } = await d.supabase
        .from('portfolio')
        .select('id', { count: 'exact', head: true })
        .or(`discord_user_id.eq.${discordUserId},user_id.eq.${discordUserId}`);

      logger.info('PORTFOLIO', 'portfolio sell completed', {
        discordUserId,
        symbol,
        sellQty: finalQty,
        realizedPnlKrw,
        remainPositions: count ?? 0
      });

      const accRows = await d.listUserAccounts(discordUserId);
      const sellAccName =
        accRows.find((a: any) => a.id === found.accountId)?.account_name ?? d.GENERAL_ACCOUNT_NAME;

      await d.safeEditReply(
        interaction,
        `✅ **${sellAccName}**에서 매도 반영\n**${symbol}** ${finalQty}주 · 실현손익(추정) **${Math.round(realizedPnlKrw).toLocaleString('ko-KR')}원**`,
        'modal:portfolio:delete:success'
      );
    } catch (e: any) {
      logger.error('PORTFOLIO', 'portfolio sell failed', { message: e?.message });
      await d.safeEditReply(interaction, `❌ 매도 처리 실패: ${e?.message || 'unknown'}`, 'modal:portfolio:delete:failure');
    }
    return true;
  }

  return false;
}
