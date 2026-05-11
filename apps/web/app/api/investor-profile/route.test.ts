import { describe, expect, it, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("@/lib/server/persona-chat-auth", () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: "u1" })),
}));

vi.mock("@/lib/server/supabase-service", () => ({
  getServiceSupabase: vi.fn(() => ({
    from: hoisted.fromMock,
  })),
}));

describe("/api/investor-profile", () => {
  beforeEach(() => {
    hoisted.fromMock.mockReset();
  });

  it("GET returns defaults when no row", async () => {
    hoisted.fromMock.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    }));
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.ok).toBe(true);
    const j = (await res.json()) as { profileStatus?: string; profile?: { riskTolerance?: string } };
    expect(j.profileStatus).toBe("missing");
    expect(j.profile?.riskTolerance).toBe("unknown");
  });

  it("GET returns table missing contract", async () => {
    hoisted.fromMock.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: null,
            error: { code: "42P01", message: "relation missing" },
          })),
        })),
      })),
    }));
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(503);
    const j = (await res.json()) as { code?: string; actionHint?: string };
    expect(j.code).toBe("investor_profile_table_missing");
    expect(j.actionHint).toContain("append_investor_profile.sql");
  });

  it("POST upserts profile", async () => {
    hoisted.fromMock.mockImplementation(() => ({
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: {
              risk_tolerance: "low",
              time_horizon: "long",
              leverage_policy: "not_allowed",
              concentration_limit: "strict",
              preferred_sectors: [],
              avoid_sectors: [],
              notes: null,
              updated_at: new Date().toISOString(),
            },
            error: null,
          })),
        })),
      })),
    }));
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://local/api/investor-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riskTolerance: "low",
          timeHorizon: "long",
          leveragePolicy: "not_allowed",
          concentrationLimit: "strict",
        }),
      }),
    );
    expect(res.ok).toBe(true);
    const j = (await res.json()) as { savedProfile?: { riskTolerance?: string } };
    expect(j.savedProfile?.riskTolerance).toBe("low");
  });
});
