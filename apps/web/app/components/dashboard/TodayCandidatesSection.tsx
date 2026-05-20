"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/**
 * Today Brief 관찰·리스크 후보 덱 및 상세 목록 래퍼.
 * 비즈니스 로직·핸들러는 DashboardClient에 유지하고 렌더 트리만 분리합니다.
 */
export function TodayCandidatesSection({ children }: Props) {
  return (
    <div className="today-candidates-section">
      <p className="mt-3 text-xs font-semibold text-violet-950">오늘의 관찰·리스크 후보</p>
      <p className="mt-0.5 text-[10px] text-violet-800/90">매수 권유 아님 · 관찰·복기·리스크 점검용입니다.</p>
      {children}
    </div>
  );
}
