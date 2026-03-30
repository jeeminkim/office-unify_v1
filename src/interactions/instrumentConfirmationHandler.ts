import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';
import { logger } from '../../logger';
import {
  buildInstrumentConfirmationMessage,
  resolveInstrumentCandidates,
  type InstrumentMetadata
} from '../../instrumentRegistry';
import { validateConfirmedInstrument } from '../services/instrumentValidation';
import {
  insertInstrumentCandidate,
  getInstrumentCandidateById,
  updateInstrumentCandidatePick,
  finalizeInstrumentCandidate
} from '../repositories/instrumentCandidateRepository';
import type { PortfolioModalDeps } from './portfolioInteractionHandler';

function embedFromCandidates(candidates: InstrumentMetadata[]): EmbedBuilder {
  const desc = candidates
    .map((_, i) => `**${i + 1}.** ${buildInstrumentConfirmationMessage(candidates, i)}`)
    .join('\n\n')
    .slice(0, 3900);
  return new EmbedBuilder()
    .setTitle('종목 등록 후보')
    .setDescription(desc)
    .setFooter({ text: '자동 확정 없음 — 확인을 눌러야만 portfolio/trade에 반영됩니다.' });
}

function candidatesToOptions(candidates: InstrumentMetadata[]) {
  return candidates.slice(0, 25).map((c, i) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`${i + 1}. ${c.displayName} (${c.symbol})`.slice(0, 100))
      .setDescription(`${c.market} ${c.quoteSymbol ?? ''}`.slice(0, 100))
      .setValue(String(i))
  );
}

export async function handlePortfolioAddModalSubmit(interaction: any, d: PortfolioModalDeps): Promise<boolean> {
  const cid = interaction.customId as string;
  if (cid !== 'modal:portfolio:add') return false;

  await d.safeDeferReply(interaction, { flags: 64 });
  try {
    const rawInput = interaction.fields.getTextInputValue('symbol');
    const qty = d.parsePositiveAmount(interaction.fields.getTextInputValue('qty'));
    const price = d.parsePositiveAmount(interaction.fields.getTextInputValue('price'));
    if (!qty || !price) {
      await d.safeEditReply(interaction, '❌ 수량과 평단가는 0보다 큰 숫자여야 합니다.', 'modal:portfolio:add:validation_failure');
      return true;
    }

    const candidates = resolveInstrumentCandidates(rawInput, undefined);
    if (!candidates.length) {
      await d.safeEditReply(
        interaction,
        '❌ 등록 가능한 후보를 찾지 못했습니다. 6자리 코드, 티커(NOW 등), 또는 한글 종목명을 입력해 주세요.',
        'modal:portfolio:add:no_candidates'
      );
      return true;
    }

    const discordUserId = d.getDiscordUserId(interaction.user);
    const buyOverride = d.pendingBuyAccountId.get(discordUserId);
    if (buyOverride) d.pendingBuyAccountId.delete(discordUserId);

    const payload = { version: 1 as const, candidates };
    const pendingPick = candidates.length === 1 ? 0 : null;

    const { id: candidateId, error } = await insertInstrumentCandidate({
      discordUserId,
      rawInput,
      requestedMarketHint: null,
      candidatePayload: payload,
      tradeQty: qty,
      tradePrice: price,
      accountId: buyOverride ?? null,
      pendingPickIndex: pendingPick
    });

    if (error || !candidateId) {
      logger.info('INSTRUMENT_CONFIRMATION', 'candidate_created', { ok: false, discordUserId, message: error });
      await d.safeEditReply(
        interaction,
        `❌ 후보 저장 실패: ${error || 'unknown'}\n(Supabase에 \`instrument_registration_candidates\` 테이블·마이그레이션을 적용했는지 확인하세요.)`,
        'modal:portfolio:add:candidate_db_fail'
      );
      return true;
    }

    logger.info('INSTRUMENT_CONFIRMATION', 'candidate_created', {
      candidateId,
      discordUserId,
      candidateCount: candidates.length
    });

    const embed = embedFromCandidates(candidates);
    const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`instr:confirm:${candidateId}`).setLabel('확인').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`instr:cancel:${candidateId}`).setLabel('취소').setStyle(ButtonStyle.Secondary)
    );

    const components: ActionRowBuilder<any>[] = [];
    if (candidates.length > 1) {
      const select = new StringSelectMenuBuilder()
        .setCustomId(`instr:pick:${candidateId}`)
        .setPlaceholder('등록할 후보를 선택하세요')
        .addOptions(candidatesToOptions(candidates));
      components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
    }
    components.push(rowButtons);

    await interaction.editReply({
      content:
        candidates.length > 1
          ? '_여러 후보가 있습니다. 드롭다운에서 선택한 뒤 **확인**을 눌러주세요._'
          : '_후보 1건입니다. 내용을 확인한 뒤 **확인**을 눌러주세요 (자동 확정 없음)._',
      embeds: [embed],
      components
    });
    return true;
  } catch (e: any) {
    logger.error('INSTRUMENT_CONFIRMATION', 'modal_submit_failed', { message: e?.message || String(e) });
    await d.safeEditReply(interaction, `❌ 처리 실패: ${e?.message || 'unknown'}`, 'modal:portfolio:add:instr_exception');
    return true;
  }
}

export async function handleInstrumentPick(interaction: any, d: PortfolioModalDeps): Promise<boolean> {
  const sid = interaction.customId as string;
  if (!sid.startsWith('instr:pick:')) return false;
  const candidateId = sid.replace('instr:pick:', '');
  const discordUserId = d.getDiscordUserId(interaction.user);
  const idx = parseInt(interaction.values[0], 10);
  if (!Number.isFinite(idx) || idx < 0) return false;

  const { row, error } = await getInstrumentCandidateById(candidateId, discordUserId);
  if (error || !row || row.status !== 'PENDING') {
    await interaction.update({ content: '유효하지 않은 후보입니다.', embeds: [], components: [] }).catch(() => {});
    return true;
  }

  await updateInstrumentCandidatePick(candidateId, discordUserId, idx);
  const payload = row.candidate_payload as { candidates: InstrumentMetadata[] };
  const candidates = payload.candidates || [];
  const embed = embedFromCandidates(candidates);
  const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`instr:confirm:${candidateId}`).setLabel('확인').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`instr:cancel:${candidateId}`).setLabel('취소').setStyle(ButtonStyle.Secondary)
  );
  const select = new StringSelectMenuBuilder()
    .setCustomId(`instr:pick:${candidateId}`)
    .setPlaceholder('등록할 후보를 선택하세요')
    .addOptions(candidatesToOptions(candidates));
  await interaction.update({
    content: `후보 **${idx + 1}**번이 선택되었습니다. **확인**을 눌러주세요.`,
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      rowButtons
    ]
  });
  return true;
}

export async function handleInstrumentConfirm(interaction: any, d: PortfolioModalDeps): Promise<boolean> {
  const cid = interaction.customId as string;
  if (!cid.startsWith('instr:confirm:')) return false;
  const candidateId = cid.replace('instr:confirm:', '');
  const discordUserId = d.getDiscordUserId(interaction.user);

  await d.safeDeferReply(interaction, { flags: 64 });
  try {
    const { row, error } = await getInstrumentCandidateById(candidateId, discordUserId);
    if (error || !row) {
      await d.safeEditReply(interaction, '후보를 찾을 수 없습니다.', 'instr:confirm:not_found');
      return true;
    }
    if (row.status !== 'PENDING') {
      await d.safeEditReply(interaction, '이미 처리된 요청입니다.', 'instr:confirm:done');
      return true;
    }
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      await finalizeInstrumentCandidate(candidateId, discordUserId, { status: 'EXPIRED' });
      await d.safeEditReply(interaction, '만료된 등록 요청입니다. 종목 추가를 다시 시도해 주세요.', 'instr:confirm:expired');
      return true;
    }

    const payload = row.candidate_payload as { candidates: InstrumentMetadata[] };
    const candidates = payload.candidates || [];
    let pick = row.pending_pick_index;
    if (pick === null || pick === undefined) {
      logger.warn('INSTRUMENT_CONFIRMATION', 'validation_failed', { reason: 'pick_required', candidateId });
      await d.safeEditReply(interaction, '여러 후보가 있을 때는 드롭다운에서 먼저 선택해 주세요.', 'instr:confirm:need_pick');
      return true;
    }
    const meta = candidates[pick];
    if (!meta) {
      await d.safeEditReply(interaction, '선택한 후보가 유효하지 않습니다.', 'instr:confirm:bad_pick');
      return true;
    }

    const v = validateConfirmedInstrument(meta);
    if (!v.ok) {
      logger.warn('INSTRUMENT_CONFIRMATION', 'validation_failed', { candidateId, reason: v.reason });
      await d.safeEditReply(interaction, `❌ 검증 실패: ${v.reason}`, 'instr:confirm:validation');
      return true;
    }

    const qty = Number(row.trade_qty);
    const price = Number(row.trade_price);
    if (!(qty > 0) || !(price > 0)) {
      await d.safeEditReply(interaction, '저장된 수량/단가가 유효하지 않습니다.', 'instr:confirm:bad_trade');
      return true;
    }

    await d.supabase.from('stocks').upsert({ symbol: meta.symbol, name: meta.displayName, sector: 'Unknown' });

    const buyOverride = row.account_id;
    const accountsForLabel = await d.listUserAccounts(discordUserId);
    const accLabel =
      buyOverride != null
        ? accountsForLabel.find((a: any) => a.id === buyOverride)?.account_name ?? '선택 계좌'
        : d.GENERAL_ACCOUNT_NAME;

    await d.recordBuyTrade({
      discordUserId,
      accountId: buyOverride ?? undefined,
      symbol: meta.symbol,
      displayName: meta.displayName,
      quoteSymbol: meta.quoteSymbol,
      exchange: meta.exchange,
      market: meta.market,
      currency: meta.currency,
      purchaseCurrency: meta.market === 'US' ? (meta.currency === 'USD' ? 'USD' : 'KRW') : 'KRW',
      quantity: qty,
      pricePerUnit: price,
      fee: 0,
      memo: `instr:confirm:${candidateId}`
    });

    void d.learnBehaviorFromTrades(discordUserId);

    await finalizeInstrumentCandidate(candidateId, discordUserId, {
      selected_symbol: meta.symbol,
      selected_display_name: meta.displayName,
      selected_market: meta.market,
      selected_exchange: meta.exchange,
      selected_quote_symbol: meta.quoteSymbol,
      selected_currency: meta.currency,
      status: 'CONFIRMED',
      confirmed_at: new Date().toISOString()
    });

    logger.info('INSTRUMENT_CONFIRMATION', 'candidate_confirmed', { candidateId, discordUserId, symbol: meta.symbol });

    await d.safeEditReply(
      interaction,
      `✅ **${accLabel}**에 반영됨\n**${meta.displayName}** · ${qty}주 · 단가 ${price}\n거래 기록 저장됨`,
      'instr:confirm:ok'
    );
    return true;
  } catch (e: any) {
    logger.error('INSTRUMENT_CONFIRMATION', 'confirm_exception', { message: e?.message || String(e) });
    await d.safeEditReply(interaction, `❌ 등록 실패: ${e?.message || 'unknown'}`, 'instr:confirm:ex');
    return true;
  }
}

export async function handleInstrumentCancel(interaction: any, d: PortfolioModalDeps): Promise<boolean> {
  const cid = interaction.customId as string;
  if (!cid.startsWith('instr:cancel:')) return false;
  const candidateId = cid.replace('instr:cancel:', '');
  const discordUserId = d.getDiscordUserId(interaction.user);
  await d.safeDeferReply(interaction, { flags: 64 });
  await finalizeInstrumentCandidate(candidateId, discordUserId, { status: 'CANCELLED' });
  logger.info('INSTRUMENT_CONFIRMATION', 'candidate_cancelled', { candidateId, discordUserId });
  await d.safeEditReply(interaction, '종목 등록을 취소했습니다.', 'instr:cancel:ok');
  return true;
}
