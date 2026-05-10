/** Research Center — “다음에 확인할 것” 추출 및 PB 후속 고찰 (additive). */

export type ResearchFollowupPriority = 'high' | 'medium' | 'low';

export type ResearchFollowupCategory =
  | 'contract'
  | 'competition'
  | 'financials'
  | 'pipeline'
  | 'regulatory'
  | 'management'
  | 'valuation'
  | 'other';

export type ResearchFollowupStatus = 'open' | 'tracking' | 'discussed' | 'dismissed' | 'archived';

export type ResearchFollowupItem = {
  id: string;
  title: string;
  detailBullets: string[];
  sourceSection: string;
  symbol?: string;
  companyName?: string;
  priority: ResearchFollowupPriority;
  category: ResearchFollowupCategory;
  extractedAt: string;
};

export type ResearchFollowupRowDto = {
  id: string;
  user_key: string;
  research_request_id: string | null;
  research_report_id: string | null;
  symbol: string | null;
  company_name: string | null;
  title: string;
  detail_json: Record<string, unknown>;
  category: string;
  priority: string;
  status: string;
  selected_for_pb: boolean;
  pb_session_id: string | null;
  pb_turn_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};
