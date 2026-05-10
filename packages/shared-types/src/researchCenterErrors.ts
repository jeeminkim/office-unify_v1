/**
 * Research Center / Infographic / Trend-adjacent stages — naming stays extensible (not RC-only).
 */

export type ResearchCenterStage =
  | 'input'
  | 'provider'
  | 'timeout'
  | 'sheets'
  | 'memory_compare'
  | 'context_cache'
  | 'response_parse'
  | 'ops_logging'
  | 'unknown';

/** Mirrors runtime strings used in API responses and ops detail. */
export const RESEARCH_CENTER_ERROR_CODE = {
  INPUT_INVALID: 'research_input_invalid',
  PROVIDER_CALL_FAILED: 'research_provider_call_failed',
  PROVIDER_TIMEOUT: 'research_provider_timeout',
  RESPONSE_PARSE_FAILED: 'research_response_parse_failed',
  SHEETS_SAVE_FAILED: 'research_sheets_save_failed',
  CONTEXT_CACHE_SAVE_FAILED: 'research_context_cache_save_failed',
  MEMORY_COMPARE_FAILED: 'trend_memory_compare_failed',
  OPS_LOGGING_FAILED: 'research_ops_logging_failed',
  GENERATION_FAILED: 'research_report_generation_failed',
  UNKNOWN_FAILED: 'research_unknown_failed',
} as const;

export type ResearchCenterErrorCode =
  (typeof RESEARCH_CENTER_ERROR_CODE)[keyof typeof RESEARCH_CENTER_ERROR_CODE];
