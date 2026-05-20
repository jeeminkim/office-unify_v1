export type MobileWebViewportMode = "mobile_web" | "tablet_web" | "desktop_web";

export type MobileWebSignal = {
  userAgent?: string;
  width: number;
  coarsePointer?: boolean;
};

const MOBILE_UA_RE = /Android|iPhone|iPod|Mobile|IEMobile|Opera Mini/i;
const TABLET_UA_RE = /iPad|Tablet|Nexus 7|Nexus 10|SM-T|Kindle|Silk/i;

export function resolveMobileWebViewportMode(signal: MobileWebSignal): MobileWebViewportMode {
  const ua = signal.userAgent ?? "";
  const uaLooksMobile = MOBILE_UA_RE.test(ua);
  const uaLooksTablet = TABLET_UA_RE.test(ua) || (ua.includes("Macintosh") && signal.coarsePointer === true);

  if (signal.width <= 767 || (uaLooksMobile && signal.width <= 900)) return "mobile_web";
  if (signal.width <= 1024 || uaLooksTablet) return "tablet_web";
  return "desktop_web";
}

export function isMobileWeb(signal: MobileWebSignal): boolean {
  return resolveMobileWebViewportMode(signal) === "mobile_web";
}
