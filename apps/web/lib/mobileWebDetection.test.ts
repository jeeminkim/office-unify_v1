import { describe, expect, it } from "vitest";
import { isMobileWeb, resolveMobileWebViewportMode } from "@/lib/mobileWebDetection";

describe("mobileWebDetection", () => {
  it("detects narrow mobile web viewports", () => {
    expect(isMobileWeb({ width: 390, userAgent: "Mozilla/5.0 iPhone Mobile" })).toBe(true);
  });

  it("keeps tablet web distinct from phone layouts", () => {
    expect(resolveMobileWebViewportMode({ width: 900, userAgent: "Mozilla/5.0 iPad", coarsePointer: true })).toBe(
      "tablet_web",
    );
  });

  it("keeps desktop web as desktop", () => {
    expect(resolveMobileWebViewportMode({ width: 1440, userAgent: "Mozilla/5.0 Chrome" })).toBe("desktop_web");
  });
});
