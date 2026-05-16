/** 브라우저 세션에 마지막 ticker resolver requestId를 남겨 대시보드 실사용 점검과 공유합니다. */

export const LAST_TICKER_RESOLVER_REQUEST_ID_KEY = "office_unify_last_ticker_resolver_request_id";

export function readLastTickerResolverRequestId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(LAST_TICKER_RESOLVER_REQUEST_ID_KEY)?.trim();
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}
