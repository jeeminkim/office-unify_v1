export type ActionIntent =
  | 'navigate_only'
  | 'read_only_check'
  | 'confirmed_write'
  | 'save_to_inbox'
  | 'save_note'
  | 'feedback_update'
  | 'local_only'
  | 'external_manual_check';

export const ACTION_INTENT_LABELS: Record<ActionIntent, string> = {
  navigate_only: '화면 이동만 합니다. 저장은 없습니다.',
  read_only_check: '상태를 다시 확인합니다. 데이터는 변경하지 않습니다.',
  confirmed_write: '확인 후에만 데이터를 변경합니다.',
  save_to_inbox: 'Action Inbox에 작업으로 저장합니다.',
  save_note: '메모로 저장합니다.',
  feedback_update: '후보 노출 우선순위에 반영됩니다.',
  local_only: '현재 화면에서만 표시됩니다. 새로고침하면 사라질 수 있습니다.',
  external_manual_check: '외부 공시/자료를 직접 확인하는 단계입니다.',
};

export function actionIntentLabel(intent: ActionIntent): string {
  return ACTION_INTENT_LABELS[intent];
}

export function assertNoForbiddenActionIntentCopy(): boolean {
  const blob = Object.values(ACTION_INTENT_LABELS).join('\n');
  return !/자동\s*주문|자동매매|자동\s*리밸런싱/.test(blob);
}
