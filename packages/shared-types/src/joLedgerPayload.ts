/**
 * 조일현(persona-chat) 원장 구조화 입력 — 사용자 메시지 본문에 JSON으로 실어 보낸다.
 */

export type JoLedgerLedgerTarget = 'holding' | 'watchlist';

export type JoLedgerActionType = 'upsert' | 'delete';

/** 보유 upsert일 때만. 제거(DELETE)에는 사용하지 않음 */
/**
 * 보유 전용 빠른 수정 모드.
 * 향후 관심 부분 수정(이유만/우선순위만 등)을 넣을 때는
 * `ledgerTarget === 'watchlist'` 일 때만 의미 있는 값을 추가하는 방식으로 확장하는 것을 권장한다.
 */
export type JoLedgerEditMode = 'full' | 'memo_only' | 'target_only' | 'memo_target';

export type JoLedgerMarket = 'KR' | 'US';

export type JoLedgerPriority = '상' | '중' | '하';

/**
 * schema는 `jo_ledger_v1` 고정.
 * 부분 수정이어도 반영 엔진은 INSERT upsert이므로, 서버 적용 가능한 SQL을 만들려면
 * 보유의 경우 가능한 한 qty·avg_price·target_price·judgment_memo 등이 채워져 있어야 한다(원장 스냅샷 병합 권장).
 */
export type JoLedgerPayloadV1 = {
  schema: 'jo_ledger_v1';
  ledgerTarget: JoLedgerLedgerTarget;
  actionType: JoLedgerActionType;
  market: JoLedgerMarket;
  name: string;
  symbol: string;
  /** 보유 upsert에서만 사용. 관심은 현재 전체 필드 입력(향후 watchlist 전용 editMode 확장 여지) */
  editMode?: JoLedgerEditMode;
  sector?: string;
  investmentMemo?: string;
  qty?: number | null;
  avgPrice?: number | null;
  targetPrice?: number | null;
  judgmentMemo?: string;
  interestReason?: string;
  desiredBuyRange?: string;
  observationPoints?: string;
  priority?: JoLedgerPriority | '';
};
