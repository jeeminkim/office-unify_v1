import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { getTradeJournalAnalytics, listTradeJournalEntries } from '@office-unify/supabase-access';

type Severity = 'info' | 'warn' | 'danger';

function severityFromCount(count: number): Severity {
  if (count >= 5) return 'danger';
  if (count >= 3) return 'warn';
  return 'info';
}

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  }

  try {
    const [analytics, entries] = await Promise.all([
      getTradeJournalAnalytics(supabase, auth.userKey),
      listTradeJournalEntries(supabase, auth.userKey, 80),
    ]);

    const topPatterns = [
      ...analytics.topReflectionFailurePatterns.map((p) => ({
        code: `reflection_${p.label.slice(0, 24)}`,
        title: '반복 반성 패턴',
        count: p.count,
        severity: severityFromCount(p.count),
        description: p.label,
        improvementHint: '다음 거래 체크리스트에 동일 실수 방지 규칙을 추가하세요.',
      })),
      ...analytics.topViolatedPrinciples.map((p) => ({
        code: `principle_${p.principleId}`,
        title: `위반 원칙: ${p.title}`,
        count: p.count,
        severity: severityFromCount(p.count),
        description: `${p.title} 위반이 반복되었습니다.`,
        improvementHint: '해당 원칙을 blocking으로 강화하거나 측정 지표를 명시하세요.',
      })),
    ]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const recent = entries.slice(0, 12);
    const currentRiskMatches = [];
    if (analytics.blockingViolationRate >= 0.3) {
      currentRiskMatches.push({
        code: 'blocking_violation_rate_high',
        title: 'blocking 위반률 높음',
        reason: `최근 평균 blocking 위반률 ${(analytics.blockingViolationRate * 100).toFixed(1)}%`,
      });
    }
    if (analytics.buySellChecklistGap > 8) {
      currentRiskMatches.push({
        code: 'sell_quality_gap',
        title: 'buy/sell 품질 격차',
        reason: `buy-sell 체크리스트 점수 격차 ${analytics.buySellChecklistGap.toFixed(1)}pt`,
      });
    }
    const chaseCount = recent.filter((e) => e.side === 'buy' && e.entryType === 'trend_follow').length;
    if (chaseCount >= 3) {
      currentRiskMatches.push({
        code: 'trend_follow_cluster',
        title: '추격매수 경향',
        reason: `최근 거래 중 trend_follow 매수 ${chaseCount}회`,
      });
    }
    const stopMissing = recent.filter((e) => e.side === 'sell' && e.exitType === 'stop_loss' && !e.invalidationCondition).length;
    if (stopMissing >= 2) {
      currentRiskMatches.push({
        code: 'stop_loss_no_invalidation',
        title: '손절 기준 불명확',
        reason: `stop_loss 거래 중 무효화 조건 미기재 ${stopMissing}건`,
      });
    }

    return NextResponse.json({
      ok: true,
      topPatterns,
      currentRiskMatches,
      degraded: false,
      warnings: topPatterns.length === 0 ? ['pattern_no_data'] : [],
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}

