import { afterEach, describe, expect, it, vi } from "vitest";
import {
  preparePersonaChatMessageRequest,
  resolvePersonaSlugForIdempotency,
} from "./personaChatRouteRequest";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/persona-chat/message", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("personaChatRouteRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects an empty message before provider or DB work", async () => {
    const result = await preparePersonaChatMessageRequest(
      jsonRequest({ content: "  ", idempotencyKey: "idem-1" }),
      "user-1",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({ error: "Missing content." });
    }
  });

  it("rejects missing idempotency keys", async () => {
    const result = await preparePersonaChatMessageRequest(jsonRequest({ content: "hello" }), "user-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toMatchObject({
        error: expect.stringContaining("idempotencyKey is required"),
      });
    }
  });

  it("prepares trimmed content and stable hash for valid Gemini persona requests", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test");
    const result = await preparePersonaChatMessageRequest(
      jsonRequest({ content: "  hello  ", idempotencyKey: "idem-1" }),
      "user-1",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.content).toBe("hello");
      expect(result.prepared.idempotencyKey).toBe("idem-1");
      expect(result.prepared.geminiKey).toBe("gemini-test");
      expect(result.prepared.contentHash).toBe(`${"user-1"}::${result.prepared.personaSlug}::hello`);
    }
  });

  it("resolves the default persona slug for idempotency", () => {
    expect(resolvePersonaSlugForIdempotency({ content: "hello" })).toBeTruthy();
  });
});
