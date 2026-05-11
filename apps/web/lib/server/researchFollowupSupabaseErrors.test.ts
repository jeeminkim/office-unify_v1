import { describe, expect, it } from "vitest";
import {
  isPostgresUniqueViolationError,
  isResearchFollowupTableMissingError,
  researchFollowupTableMissingJson,
} from "./researchFollowupSupabaseErrors";

describe("researchFollowupSupabaseErrors", () => {
  it("detects Postgres undefined_table", () => {
    expect(isResearchFollowupTableMissingError({ code: "42P01", message: "relation missing" })).toBe(true);
  });

  it("detects PostgREST relation missing message", () => {
    expect(
      isResearchFollowupTableMissingError({
        message: 'relation "public.web_research_followup_items" does not exist',
      }),
    ).toBe(true);
  });

  it("returns stable JSON contract", () => {
    const j = researchFollowupTableMissingJson();
    expect(j.ok).toBe(false);
    expect(j.code).toBe("research_followup_table_missing");
    expect(j.actionHint).toContain("append_research_followup_items.sql");
  });

  it("detects unique_violation", () => {
    expect(isPostgresUniqueViolationError({ code: "23505" })).toBe(true);
    expect(isPostgresUniqueViolationError({ code: "42P01" })).toBe(false);
  });
});
