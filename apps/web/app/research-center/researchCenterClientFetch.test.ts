import { describe, expect, it } from "vitest";
import { parseResearchGenerateResponse } from "./researchCenterClientFetch";

describe("researchCenterClientFetch", () => {
  it("classifies non-json response as parse failure", async () => {
    const res = new Response("<html>error</html>", {
      status: 500,
      headers: { "content-type": "text/html" },
    });
    const parsed = await parseResearchGenerateResponse(res);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe("response_json_parse_failed");
  });

  it("uses api_error when server returns structured json", async () => {
    const res = new Response(
      JSON.stringify({
        ok: false,
        requestId: "rc_123",
        errorCode: "research_provider_call_failed",
        message: "provider failed",
      }),
      {
        status: 502,
        headers: { "content-type": "application/json" },
      },
    );
    const parsed = await parseResearchGenerateResponse(res);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe("api_error");
    expect(parsed.error.requestId).toBe("rc_123");
  });
});
