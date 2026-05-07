import { describe, expect, it } from "vitest";
import {
  buildSectorRadarScoreFingerprint,
  classifySectorRadarWarningPolicy,
  normalizeSectorRadarOpsKey,
  shouldSkipSectorRadarOpsByThrottle,
} from "../sectorRadarOpsPolicy";
describe("sectorRadarOpsLogger fingerprint and throttle", () => {
  it("normalizes aliases to stable sector key", () => {
    expect(normalizeSectorRadarOpsKey("조선/LNG/소재")).toBe("shipping-lng-material");
    expect(normalizeSectorRadarOpsKey("shipping_lng_material")).toBe("shipping-lng-material");
    expect(normalizeSectorRadarOpsKey("  ")).toBe("unknown-sector");
  });

  it("builds stable fingerprint for same sector/code", () => {
    const a = buildSectorRadarScoreFingerprint({
      userKey: "user123",
      sectorKey: "조선/LNG/소재",
      code: "sector_radar_score_no_data",
    });
    const b = buildSectorRadarScoreFingerprint({
      userKey: "user123",
      sectorKey: "shipping_lng_material",
      code: "sector_radar_score_no_data",
    });
    expect(a).toBe("sector_radar:user123:shipping-lng-material:sector_radar_score_no_data");
    expect(b).toBe(a);
  });

  it("applies throttle window and allows after window", () => {
    const now = Date.parse("2026-05-06T12:30:00.000Z");
    expect(
      shouldSkipSectorRadarOpsByThrottle({
        code: "sector_radar_score_no_data",
        lastSeenAt: "2026-05-06T12:10:00.000Z",
        throttleMinutes: 30,
        nowMs: now,
      }),
    ).toBe(true);
    expect(
      shouldSkipSectorRadarOpsByThrottle({
        code: "sector_radar_score_no_data",
        lastSeenAt: "2026-05-06T11:50:00.000Z",
        throttleMinutes: 30,
        nowMs: now,
      }),
    ).toBe(false);
  });

  it("classifies overheated as observation warning", () => {
    const over = classifySectorRadarWarningPolicy("sector_radar_score_overheated");
    expect(over.isOperationalError).toBe(false);
    expect(over.isObservationWarning).toBe(true);

    const noData = classifySectorRadarWarningPolicy("sector_radar_score_no_data");
    expect(noData.isOperationalError).toBe(true);
    expect(noData.isObservationWarning).toBe(false);
  });

});
