import { describe, expect, it } from "vitest";
import {
  buildTrendOpsFingerprint,
  evaluateSourceQuality,
  mergeBeneficiaries,
  mergeEvidenceItems,
  mergeNextWatch,
  normalizeTrendSignalKey,
  validateTrendTickers,
} from "@office-unify/ai-office-engine";

describe("normalizeTrendSignalKey", () => {
  it("returns same key for same semantic input", () => {
    const a = normalizeTrendSignalKey({ topicKey: "k-content", name: "드라마 수출 확대", summary: "OTT 수요 증가" });
    const b = normalizeTrendSignalKey({ topicKey: "k-content", name: "드라마 수출 확대", summary: "OTT 수요 증가" });
    expect(a).toBe(b);
  });

  it("creates fallback hash key when all fields empty", () => {
    const k = normalizeTrendSignalKey({ topicKey: "", name: "", summary: "" });
    expect(k.startsWith("trend-signal-")).toBe(true);
  });
});

describe("trend memory merge", () => {
  it("dedupes evidence by url and keeps latest first", () => {
    const merged = mergeEvidenceItems(
      [{ url: "https://a.com", title: "new" }],
      [{ url: "https://a.com", title: "old" }, { url: "https://b.com", title: "b" }],
    );
    expect(merged.length).toBe(2);
    expect(merged[0].title).toBe("new");
  });

  it("dedupes beneficiaries by company+ticker", () => {
    const merged = mergeBeneficiaries(
      [{ companyName: "HYBE", relationship: "x", sensitivity: "primary_sensitive", tickerStatus: "validated", yahooTicker: "352820.KS", evidence: [] }],
      [{ companyName: "HYBE", relationship: "y", sensitivity: "primary_sensitive", tickerStatus: "validated", yahooTicker: "352820.KS", evidence: [] }],
    );
    expect(merged.length).toBe(1);
  });

  it("dedupes next watch by checkpoint key", () => {
    const merged = mergeNextWatch(
      [{ checkpointKey: "cp-1", label: "매출", relatedSignalKeys: [] }],
      [{ checkpointKey: "cp-1", label: "매출2", relatedSignalKeys: [] }],
    );
    expect(merged.length).toBe(1);
  });
});

describe("ops fingerprint", () => {
  it("joins parts and trims empty values", () => {
    const fp = buildTrendOpsFingerprint(["trend", "", "u1", undefined, "topic", "warn"]);
    expect(fp).toBe("trend:u1:topic:warn");
  });
});

describe("ticker/source quality helpers", () => {
  it("classifies corrected HYBE ticker", () => {
    const rows = validateTrendTickers("HYBE 352820.KQ");
    expect(rows[0]?.status).toBe("corrected");
    expect(rows[0]?.normalizedYahooTicker).toBe("352820.KS");
  });

  it("detects low source quality when no A/B", () => {
    const quality = evaluateSourceQuality([
      { sourceType: "web", url: "https://wikipedia.org/wiki/test" },
    ]);
    const abCount = quality.filter((x: { grade: string }) => x.grade === "A" || x.grade === "B").length;
    expect(abCount).toBe(0);
  });
});
