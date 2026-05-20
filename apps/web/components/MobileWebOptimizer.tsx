"use client";

import { useEffect } from "react";
import { resolveMobileWebViewportMode } from "@/lib/mobileWebDetection";

function applyMobileWebAttributes() {
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const mode = resolveMobileWebViewportMode({
    userAgent: window.navigator.userAgent,
    width: window.innerWidth,
    coarsePointer,
  });
  const isMobile = mode === "mobile_web";

  document.documentElement.dataset.viewportMode = mode;
  document.documentElement.dataset.mobileWeb = isMobile ? "true" : "false";
  document.body.classList.toggle("is-mobile-web", isMobile);
  document.body.classList.toggle("is-tablet-web", mode === "tablet_web");
}

export function MobileWebOptimizer() {
  useEffect(() => {
    applyMobileWebAttributes();
    const onViewportChange = () => applyMobileWebAttributes();

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
    };
  }, []);

  return null;
}
