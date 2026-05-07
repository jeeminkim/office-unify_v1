import type {
  ResearchCenterGenerateErrorResponseBody,
  ResearchCenterGenerateResponseBody,
} from "@office-unify/shared-types";

export type ResearchCenterClientErrorCode =
  | "network_fetch_failed"
  | "http_error"
  | "response_json_parse_failed"
  | "api_error"
  | "request_timeout";

export type ResearchCenterClientErrorState = {
  code: ResearchCenterClientErrorCode;
  message: string;
  requestId?: string;
  actionHint?: string;
};

export function createResearchRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `rc_${crypto.randomUUID()}`;
  }
  return `rc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatResearchClientError(error: ResearchCenterClientErrorState): string {
  const rid = error.requestId ? ` (requestId: ${error.requestId})` : "";
  const hint = error.actionHint ? ` ${error.actionHint}` : "";
  return `${error.message}${rid}${hint}`;
}

export async function parseResearchGenerateResponse(
  res: Response,
): Promise<
  | { ok: true; data: ResearchCenterGenerateResponseBody }
  | { ok: false; error: ResearchCenterClientErrorState }
> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      error: {
        code: "response_json_parse_failed",
        message: "응답 형식이 올바르지 않습니다. 운영 로그를 확인해 주세요.",
      },
    };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "response_json_parse_failed",
        message: "응답 JSON 파싱에 실패했습니다.",
      },
    };
  }
  if (!res.ok) {
    const err = (body ?? {}) as Partial<ResearchCenterGenerateErrorResponseBody>;
    return {
      ok: false,
      error: {
        code: err.errorCode ? "api_error" : "http_error",
        message: err.message || "서버에서 오류가 발생했습니다.",
        requestId: err.requestId,
        actionHint: err.actionHint,
      },
    };
  }
  return {
    ok: true,
    data: body as ResearchCenterGenerateResponseBody,
  };
}
