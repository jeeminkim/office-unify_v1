import type { ActionItemDetailJson, ActionItemRowDto, ActionItemSourceType } from '@office-unify/shared-types';
import { ACTION_ITEM_SOURCE_LABELS } from '@office-unify/shared-types';

/** detail_json.sourceLabel when source_type is manual (DB enum 보완). */
export const DETAIL_SOURCE_LABEL_DISPLAY: Record<string, string> = {
  pb_response: 'PB 응답',
  pb_weekly_review: 'PB 주간 점검',
  pb_daily_note: 'PB 일일 점검',
  trend_report: 'Trend 리포트',
  google_finance_setup: 'Google Finance 설정',
  long_response: '긴 응답 요약',
  committee_partial_recovery: '위원회 발언 복구',
  committee_line_regenerate: '위원회 발언 재생성',
  daily_review: 'Daily Review',
  sector_match: '섹터 매칭',
  watchlist: '관심종목',
};

export function resolveActionItemSourceDisplay(
  row: Pick<ActionItemRowDto, 'source_type' | 'source_label'>,
  detail?: Pick<ActionItemDetailJson, 'sourceLabel'>,
): string {
  const semantic = detail?.sourceLabel?.trim() || row.source_label?.trim();
  if (row.source_type === 'manual' && semantic && DETAIL_SOURCE_LABEL_DISPLAY[semantic]) {
    return DETAIL_SOURCE_LABEL_DISPLAY[semantic];
  }
  if (semantic && row.source_type !== 'manual' && DETAIL_SOURCE_LABEL_DISPLAY[semantic]) {
    return `${ACTION_ITEM_SOURCE_LABELS[row.source_type as ActionItemSourceType] ?? row.source_type} · ${DETAIL_SOURCE_LABEL_DISPLAY[semantic]}`;
  }
  return ACTION_ITEM_SOURCE_LABELS[row.source_type as ActionItemSourceType] ?? row.source_type;
}
