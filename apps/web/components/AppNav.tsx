"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const PRIMARY = [
  { href: "/", label: "홈", short: "홈" },
  { href: "/action-items", label: "Action", short: "작업" },
  { href: "/daily-review", label: "Daily", short: "일일" },
  { href: "/research-center", label: "Research", short: "리서치" },
] as const;

const MORE_LINKS = [
  { href: "/sector-radar", label: "Sector" },
  { href: "/trade-journal", label: "Journal" },
  { href: "/portfolio-ledger", label: "Portfolio" },
  { href: "/committee-discussion", label: "위원회" },
  { href: "/ops/sql-readiness", label: "SQL" },
  { href: "/judgment-review", label: "30일 복기" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

export function AppNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_LINKS.some((l) => isActive(pathname, l.href));

  return (
    <>
      <nav className="hidden border-b border-slate-200 bg-white px-3 py-2 md:block">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 text-xs">
          {PRIMARY.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded px-2.5 py-1.5 font-medium ${
                isActive(pathname, item.href) ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <span className="text-slate-300">|</span>
          {MORE_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded px-2 py-1 ${isActive(pathname, item.href) ? "bg-slate-200 font-medium" : "text-slate-500 hover:bg-slate-50"}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <div className="flex justify-around px-1 py-2">
          {PRIMARY.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[3rem] flex-col items-center rounded-lg px-2 py-1 text-[10px] ${
                isActive(pathname, item.href) ? "font-semibold text-slate-900" : "text-slate-600"
              }`}
            >
              <span>{item.short}</span>
            </Link>
          ))}
          <button
            type="button"
            className={`flex min-w-[3rem] flex-col items-center rounded-lg px-2 py-1 text-[10px] ${
              moreActive || moreOpen ? "font-semibold text-slate-900" : "text-slate-600"
            }`}
            onClick={() => setMoreOpen((v) => !v)}
          >
            More
          </button>
        </div>
        {moreOpen ? (
          <div className="border-t bg-white px-3 py-2">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {MORE_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded border px-2 py-1.5 text-center ${isActive(pathname, item.href) ? "border-slate-800 bg-slate-100 font-medium" : ""}`}
                  onClick={() => setMoreOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </nav>
    </>
  );
}
