import type {
  MonthlyJudgmentReview,
  MonthlyJudgmentReviewPrimaryPattern,
} from '@office-unify/shared-types';
import type { MonthlyJudgmentReviewSources } from '@/lib/server/monthlyJudgmentReviewSources';

const STALE_OPEN_DAYS = 14;

function isRiskReviewImpression(row: MonthlyJudgmentReviewSources['impressions']['rows'][0]): boolean {
  const trace = row.decision_trace ?? {};
  const flags = Array.isArray(trace.riskFlags) ? trace.riskFlags : [];
  const bucket = String(row.candidate_bucket ?? '');
  return bucket.includes('risk') || flags.some((f) => String((f as { code?: string }).code ?? '').includes('risk'));
}

function countBySymbol(
  symbols: Array<string | null | undefined>,
): Array<{ symbol: string; count: number }> {
  const m = new Map<string, number>();
  for (const s of symbols) {
    const sym = (s ?? '').trim().toUpperCase();
    if (!sym) continue;
    m.set(sym, (m.get(sym) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([symbol, count]) => ({ symbol, count }))
    .sort((a, b) => b.count - a.count);
}

export function detectRepeatedJudgmentPatterns(
  sources: MonthlyJudgmentReviewSources,
): MonthlyJudgmentReview['repeatedPatterns'] {
  const patterns: MonthlyJudgmentReview['repeatedPatterns'] = [];
  const { impressions, feedback, actionItems, tradeJournal, retrospectives, researchRuns, dailyReviewNotes } =
    sources;

  const symbolCounts = countBySymbol([
    ...impressions.rows.map((r) => r.symbol),
    ...actionItems.rows.map((r) => r.symbol),
    ...tradeJournal.rows.map((r) => r.symbol),
  ]);
  const topSymbol = symbolCounts[0];
  if (topSymbol && topSymbol.count >= 4) {
    patterns.push({
      patternKey: 'sector_concentration',
      label: '동일 종목·테마 반복 노출',
      evidenceCount: topSymbol.count,
      examples: [
        { sourceType: 'today_candidate', symbol: topSymbol.symbol, title: '후보/액션 반복', date: sources.window.endDate },
      ],
      interpretation: `최근 ${sources.window.days}일 동안 ${topSymbol.symbol} 관련 기록이 여러 채널에서 반복되었습니다. 집중도 점검이 필요할 수 있습니다.`,
      suggestedRule: '같은 종목을 다시 검토하기 전에 기존 포지션·리스크·복기 기록을 먼저 확인합니다.',
    });
  }

  const hide7d = feedback.rows.filter((r) => r.feedback_action === 'hide_7d').length;
  const markReviewed = feedback.rows.filter((r) => r.feedback_action === 'mark_reviewed').length;
  const riskImpressions = impressions.rows.filter(isRiskReviewImpression);
  if (riskImpressions.length >= 3 && markReviewed < Math.max(1, Math.floor(riskImpressions.length * 0.3))) {
    patterns.push({
      patternKey: 'risk_review_ignored',
      label: '리스크 점검 후보 대비 확인 부족 가능성',
      evidenceCount: riskImpressions.length,
      examples: riskImpressions.slice(0, 2).map((r) => ({
        sourceType: 'today_candidate',
        symbol: r.symbol ?? undefined,
        title: r.name ?? '리스크 점검 후보',
        date: r.run_date,
      })),
      interpretation: '리스크 점검 후보가 반복 노출되었으나 mark_reviewed·후속 액션이 상대적으로 적습니다. 점검 누락 가능성을 검토하세요.',
      suggestedRule: '리스크 점검 후보는 mark_reviewed 또는 Action Item으로 한 번은 기록한 뒤 다음 관찰로 넘깁니다.',
    });
  }

  const openCount = actionItems.rows.filter((r) => r.status === 'open' || r.status === 'in_progress').length;
  const doneCount = actionItems.rows.filter((r) => r.status === 'done').length;
  if (openCount >= 5 && doneCount < openCount * 0.4) {
    patterns.push({
      patternKey: 'action_queue_stall',
      label: 'Action Item 큐 정체 가능성',
      evidenceCount: openCount,
      examples: actionItems.rows
        .filter((r) => r.status === 'open')
        .slice(0, 2)
        .map((r) => ({
          sourceType: r.source_type,
          symbol: r.symbol ?? undefined,
          title: r.title,
          date: r.created_at.slice(0, 10),
        })),
      interpretation: '열린 Action Item이 완료보다 많습니다. 우선순위 재정렬이나 dismiss 검토가 필요할 수 있습니다.',
      suggestedRule: '주 1회 Action Item을 열어 완료·보류·취소 중 하나로 상태를 바꿉니다.',
    });
  }

  if (researchRuns.rows.length >= 5 && doneCount + retrospectives.rows.filter((r) => r.status === 'learned').length < 3) {
    patterns.push({
      patternKey: 'over_researching',
      label: '리서치 대비 실행·복기 부족 가능성',
      evidenceCount: researchRuns.rows.length,
      examples: researchRuns.rows.slice(0, 2).map((r) => ({
        sourceType: 'research_report',
        symbol: r.symbol,
        date: r.report_date,
      })),
      interpretation: '리서치 리포트는 많지만 Action Item 완료·복기 learned가 상대적으로 적습니다. 과잉 조사 패턴을 점검하세요.',
      suggestedRule: '리서치 1건당 후속 Action Item 또는 복기 1건을 연결하는 규칙을 시도합니다.',
    });
  }

  if (tradeJournal.rows.length >= 2 && retrospectives.rows.length < Math.max(1, Math.floor(tradeJournal.rows.length * 0.5))) {
    patterns.push({
      patternKey: 'under_reviewing',
      label: '거래 기록 대비 복기 부족',
      evidenceCount: tradeJournal.rows.length,
      examples: tradeJournal.rows.slice(0, 2).map((r) => ({
        sourceType: 'trade_journal',
        symbol: r.symbol,
        date: r.tradeDate,
      })),
      interpretation: 'Trade Journal은 있으나 Decision Retrospective가 적습니다. 판단 복기 루프를 보강할 여지가 있습니다.',
      suggestedRule: '거래 기록 후 7일 이내에 복기 초안을 1건 작성합니다.',
    });
  }

  if (hide7d >= 3 && topSymbol && topSymbol.count >= 2) {
    patterns.push({
      patternKey: 'repeated_hidden_candidates',
      label: '숨김 후보와 반복 테마',
      evidenceCount: hide7d,
      examples: [{ sourceType: 'today_candidate_feedback', title: 'hide_7d', date: sources.window.endDate }],
      interpretation: 'hide_7d가 많은데 유사 테마가 다시 나타났을 수 있습니다. 숨김 이유와 반복 노출을 대조해 보세요.',
      suggestedRule: 'hide_7d한 테마가 다시 나오면 왜 다시 보이는지 메모 없이는 추가 관찰을 하지 않습니다.',
    });
  }

  const usDataNotes = (dailyReviewNotes?.rows ?? []).filter((r) => r.subject_type === 'us_data');
  if (usDataNotes.length >= 3) {
    patterns.push({
      patternKey: 'repeated_us_data_notes',
      label: '미국 데이터 점검 메모 반복',
      evidenceCount: usDataNotes.length,
      examples: usDataNotes.slice(0, 2).map((r) => ({
        sourceType: 'daily_review_note',
        date: r.review_date,
        title: r.note_summary.slice(0, 80),
      })),
      interpretation:
        '최근 기간 미국 anchor·시세 문제를 일일 메모로 반복 기록했습니다. 근본 원인(시트·ticker)을 한 번 정리하는 것이 좋습니다.',
      suggestedRule: 'US data degraded가 3일 이상이면 anchor·시트 점검 Action Item을 완료할 때까지 신규 US 관찰을 확대하지 않습니다.',
    });
  }

  const sectorNotes = (dailyReviewNotes?.rows ?? []).filter((r) => r.subject_type === 'sector');
  if (sectorNotes.length >= 2) {
    patterns.push({
      patternKey: 'repeated_sector_mismatch_notes',
      label: '섹터 매칭 점검 메모 반복',
      evidenceCount: sectorNotes.length,
      examples: sectorNotes.slice(0, 2).map((r) => ({
        sourceType: 'daily_review_note',
        date: r.review_date,
        title: r.note_summary.slice(0, 80),
      })),
      interpretation: '섹터 registry·매칭 검토 메모가 반복되었습니다. 수동 override 또는 registry 보강을 검토하세요.',
      suggestedRule: 'no_match/low_confidence가 반복되면 registry 보강 후에만 자동 매칭을 신뢰합니다.',
    });
  }

  const savedDailyNotes = (dailyReviewNotes?.rows ?? []).filter((r) => r.status === 'saved');
  const notesWithoutFollowup = savedDailyNotes.filter((n) => {
    const noteKey = n.idempotency_key;
    const actionKey = noteKey ? `daily-note-action:${noteKey}` : null;
    const sym = (n.symbol ?? '').toUpperCase();
    const hasAction = actionItems.rows.some((a) => {
      if (actionKey && a.idempotency_key === actionKey) return true;
      return sym.length > 0 && (a.symbol ?? '').toUpperCase() === sym;
    });
    return !hasAction;
  });
  if (notesWithoutFollowup.length >= 2) {
    patterns.push({
      patternKey: 'daily_note_without_action_followup',
      label: '일일 메모 후 Action Item 미연결',
      evidenceCount: notesWithoutFollowup.length,
      examples: notesWithoutFollowup.slice(0, 2).map((r) => ({
        sourceType: 'daily_review_note',
        date: r.review_date,
        title: r.note_summary.slice(0, 80),
        symbol: r.symbol ?? undefined,
      })),
      interpretation:
        '저장된 Daily Review Note가 Action Inbox 후속 작업으로 이어지지 않은 경우가 있습니다. 점검 메모를 Action Item으로 연결해 보세요.',
      suggestedRule: '저장한 일일 점검 메모는 같은 날 Action Item 1건으로 연결하거나 보류 사유를 남깁니다.',
    });
  }

  const notesWithDoneAction = savedDailyNotes.filter((n) => {
    const noteKey = n.idempotency_key;
    const actionKey = noteKey ? `daily-note-action:${noteKey}` : null;
    const sym = (n.symbol ?? '').toUpperCase();
    return actionItems.rows.some((a) => {
      if (a.status !== 'done') return false;
      if (actionKey && a.idempotency_key === actionKey) return true;
      return sym.length > 0 && (a.symbol ?? '').toUpperCase() === sym;
    });
  });
  if (notesWithDoneAction.length >= 1) {
    patterns.push({
      patternKey: 'improved_daily_note_to_action_done',
      label: '일일 메모 → Action Item 완료',
      evidenceCount: notesWithDoneAction.length,
      examples: notesWithDoneAction.slice(0, 2).map((r) => ({
        sourceType: 'daily_review_note',
        date: r.review_date,
        title: r.note_summary.slice(0, 80),
        symbol: r.symbol ?? undefined,
      })),
      interpretation: 'Daily Review Note에서 Action Item으로 이어져 완료된 흐름이 보입니다.',
      suggestedRule: '점검 메모 → Action Item → 완료 루프를 유지합니다.',
    });
  }

  if (markReviewed >= 2 && doneCount >= 2) {
    patterns.push({
      patternKey: 'good_behavior',
      label: '리스크 확인 후 Action Item 완료',
      evidenceCount: markReviewed + doneCount,
      examples: [
        { sourceType: 'today_candidate_feedback', title: 'mark_reviewed' },
        { sourceType: 'action_item', title: 'done' },
      ],
      interpretation: '리스크 후보를 확인하고 Action Item까지 완료한 흐름이 보입니다. 이 패턴을 유지하세요.',
      suggestedRule: '리스크 점검 → Action Item → 완료/복기 연결 루프를 유지합니다.',
    });
  }

  return patterns.slice(0, 8);
}

export function buildImprovedBehaviors(sources: MonthlyJudgmentReviewSources): MonthlyJudgmentReview['improvedBehaviors'] {
  const out: MonthlyJudgmentReview['improvedBehaviors'] = [];
  const markReviewed = sources.feedback.rows.filter((r) => r.feedback_action === 'mark_reviewed').length;
  const doneItems = sources.actionItems.rows.filter((r) => r.status === 'done').length;
  if (markReviewed >= 1 && doneItems >= 1) {
    out.push({
      label: '리스크 확인 후 작업 완료',
      evidence: `mark_reviewed ${markReviewed}건, Action Item 완료 ${doneItems}건`,
      whyItMatters: '확인만 하고 끝나지 않고 후속 작업까지 이어진 흐름입니다.',
    });
  }
  const notesWithDone = (sources.dailyReviewNotes?.rows ?? []).filter((n) => {
    const sym = (n.symbol ?? '').toUpperCase();
    return sym && sources.actionItems.rows.some((a) => a.symbol?.toUpperCase() === sym && a.status === 'done');
  });
  if (notesWithDone.length >= 1) {
    out.push({
      label: '일일 메모 후 Action Item 완료',
      evidence: `${notesWithDone.length}건의 Daily Review Note와 연결된 Action Item 완료`,
      whyItMatters: '매일 점검 메모가 실제 후속 작업으로 이어진 사례입니다.',
    });
  }
  if (sources.researchDiffs.rows.length >= 1) {
    out.push({
      label: '리서치 diff 활용',
      evidence: `7일 diff ${sources.researchDiffs.rows.length}건`,
      whyItMatters: '이전 리포트와 비교하며 판단 근거를 갱신한 흔적입니다.',
    });
  }
  const learned = sources.retrospectives.rows.filter((r) => r.status === 'learned').length;
  if (learned >= 1) {
    out.push({
      label: '복기 learned 기록',
      evidence: `learned 복기 ${learned}건`,
      whyItMatters: '판단을 문서화하고 다음 규칙으로 연결한 기록입니다.',
    });
  }
  return out.slice(0, 5);
}

export function buildMissedChecks(
  sources: MonthlyJudgmentReviewSources,
  staleOpen: MonthlyJudgmentReview['actionQueueReview']['staleOpenItems'],
): MonthlyJudgmentReview['missedChecks'] {
  const checks: MonthlyJudgmentReview['missedChecks'] = [];
  const riskImpressions = sources.impressions.rows.filter(isRiskReviewImpression);
  const markReviewed = sources.feedback.rows.filter((r) => r.feedback_action === 'mark_reviewed').length;
  if (riskImpressions.length >= 2 && markReviewed === 0) {
    checks.push({
      checkKey: 'risk_review_unconfirmed',
      label: '리스크 점검 후보 미확인',
      sourceType: 'today_candidate',
      evidence: `리스크 성격 후보 ${riskImpressions.length}건, mark_reviewed 0건`,
      nextAction: '리스크 후보 1건을 선택해 mark_reviewed 또는 Action Item으로 기록합니다.',
    });
  }
  for (const item of staleOpen.slice(0, 3)) {
    checks.push({
      checkKey: `stale_action_${item.id}`,
      label: '방치된 Action Item',
      sourceType: item.sourceType,
      evidence: `${item.title} · ${item.ageDays}일 경과`,
      nextAction: '완료·진행·dismiss 중 하나로 상태를 갱신합니다.',
    });
  }
  if (sources.researchDiffs.rows.length >= 1 && sources.actionItems.rows.filter((r) => r.source_type === 'research_report').length === 0) {
    checks.push({
      checkKey: 'diff_without_followup',
      label: '리포트 diff 후속 미연결',
      sourceType: 'research_report',
      evidence: `diff ${sources.researchDiffs.rows.length}건, research 출처 Action Item 없음`,
      nextAction: 'diff에서 나온 리스크·촉매를 Action Item 또는 복기에 연결합니다.',
    });
  }
  if (sources.tradeJournal.rows.length >= 2 && sources.retrospectives.rows.length === 0) {
    checks.push({
      checkKey: 'journal_without_retro',
      label: '거래 기록 대비 복기 누락',
      sourceType: 'trade_journal',
      evidence: `저널 ${sources.tradeJournal.rows.length}건, 복기 0건`,
      nextAction: '대표 거래 1건을 골라 복기 초안을 작성합니다.',
    });
  }
  return checks.slice(0, 8);
}

export function buildNextMonthRules(
  patterns: MonthlyJudgmentReview['repeatedPatterns'],
): MonthlyJudgmentReview['nextMonthRules'] {
  const rules: MonthlyJudgmentReview['nextMonthRules'] = [];
  const mapAction: Record<string, MonthlyJudgmentReview['nextMonthRules'][0]['actionType']> = {
    sector_concentration: 'limit_repeated_exposure',
    risk_review_ignored: 'review_risk_before_adding',
    action_queue_stall: 'check_before_trade',
    over_researching: 'create_research_before_action',
    under_reviewing: 'write_retrospective',
    repeated_hidden_candidates: 'limit_repeated_exposure',
    good_behavior: 'manual',
  };

  for (const p of patterns) {
    if (p.patternKey === 'good_behavior') continue;
    const actionType = mapAction[p.patternKey] ?? 'manual';
    rules.push({
      ruleTitle: p.suggestedRule.slice(0, 120),
      reason: p.interpretation.slice(0, 200),
      triggerCondition: `${p.label} 패턴이 다시 감지될 때`,
      actionType,
      notTradeInstruction: true,
    });
  }

  if (rules.length === 0) {
    rules.push({
      ruleTitle: '주간 Action Item 상태 점검',
      reason: '반복 실수를 줄이려면 미완료 작업을 정기적으로 정리하는 것이 도움이 됩니다.',
      triggerCondition: '매주 월요일',
      actionType: 'check_before_trade',
      notTradeInstruction: true,
    });
  }

  return rules.slice(0, 6);
}

export function buildMonthlyReviewActionItems(
  rules: MonthlyJudgmentReview['nextMonthRules'],
): NonNullable<MonthlyJudgmentReview['actionItemsToCreate']> {
  const categoryMap: Record<
    MonthlyJudgmentReview['nextMonthRules'][0]['actionType'],
    NonNullable<MonthlyJudgmentReview['actionItemsToCreate']>[0]['actionCategory']
  > = {
    check_before_trade: 'check_now',
    create_research_before_action: 'research_needed',
    limit_repeated_exposure: 'monitor',
    review_risk_before_adding: 'risk_review',
    write_retrospective: 'retrospective_needed',
    manual: 'check_now',
  };

  return rules.map((r) => ({
    title: r.ruleTitle,
    actionCategory: categoryMap[r.actionType],
    priority: 'medium' as const,
    reason: r.reason.slice(0, 200),
  }));
}

export function pickPrimaryPattern(
  patterns: MonthlyJudgmentReview['repeatedPatterns'],
): { primaryPattern: MonthlyJudgmentReviewPrimaryPattern; confidence: 'high' | 'medium' | 'low' | 'unknown' } {
  const negative = patterns.filter((p) => p.patternKey !== 'good_behavior');
  if (negative.length === 0) {
    return { primaryPattern: patterns.some((p) => p.patternKey === 'good_behavior') ? 'balanced' : 'unknown', confidence: 'low' };
  }
  const top = negative.sort((a, b) => b.evidenceCount - a.evidenceCount)[0];
  const key = top.patternKey as MonthlyJudgmentReviewPrimaryPattern;
  const valid: MonthlyJudgmentReviewPrimaryPattern[] = [
    'sector_concentration',
    'momentum_chasing',
    'loss_cut_rotation',
    'risk_review_ignored',
    'over_researching',
    'under_reviewing',
    'data_quality_issue',
    'balanced',
    'unknown',
  ];
  const primaryPattern = valid.includes(key) ? key : 'unknown';
  const confidence = top.evidenceCount >= 5 ? 'high' : top.evidenceCount >= 3 ? 'medium' : 'low';
  return { primaryPattern, confidence };
}

export function computeStaleOpenItems(
  sources: MonthlyJudgmentReviewSources,
  nowMs: number,
): MonthlyJudgmentReview['actionQueueReview']['staleOpenItems'] {
  return sources.actionItems.rows
    .filter((r) => r.status === 'open' || r.status === 'in_progress')
    .map((r) => {
      const created = new Date(r.created_at).getTime();
      const ageDays = Number.isFinite(created) ? Math.floor((nowMs - created) / 86400000) : 0;
      return {
        id: r.id,
        title: r.title,
        sourceType: r.source_type,
        ageDays,
        priority: (r.priority === 'high' || r.priority === 'low' ? r.priority : 'medium') as 'high' | 'medium' | 'low',
      };
    })
    .filter((r) => r.ageDays >= STALE_OPEN_DAYS)
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 10);
}
