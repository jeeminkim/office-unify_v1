"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  MOBILE_PRIMARY,
  NAV_HOME,
  NAV_TREE,
  flattenNavLinks,
  isGroupActive,
  isNavActive,
  type NavGroup,
} from "@/lib/navConfig";

function NavDropdown({ group, pathname }: { group: NavGroup; pathname: string }) {
  const [open, setOpen] = useState(false);
  const active = isGroupActive(pathname, group);
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`rounded px-2.5 py-1.5 font-medium ${
          active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
        }`}
        title={group.description}
        aria-expanded={open}
      >
        {group.label}
        <span className="ml-0.5 text-[10px] opacity-70">▾</span>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-0.5 min-w-[14rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {group.children.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 hover:bg-slate-50 ${
                isNavActive(pathname, item.href) ? "bg-slate-100 font-medium" : ""
              }`}
              title={item.description}
            >
              <span className="block text-xs text-slate-900">{item.label}</span>
              <span className="block text-[10px] leading-snug text-slate-500">{item.description}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AppNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const flatMore = flattenNavLinks().filter(
    (l) => !MOBILE_PRIMARY.some((p) => p.href === l.href) && l.href !== NAV_HOME.href,
  );
  const moreActive = flatMore.some((l) => isNavActive(pathname, l.href)) || NAV_TREE.some((g) => isGroupActive(pathname, g));

  return (
    <>
      <nav className="hidden border-b border-slate-200 bg-white px-3 py-2 md:block">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 text-xs">
          <Link
            href={NAV_HOME.href}
            className={`rounded px-2.5 py-1.5 font-medium ${
              isNavActive(pathname, NAV_HOME.href) ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
            title={NAV_HOME.description}
          >
            {NAV_HOME.label}
          </Link>
          {NAV_TREE.map((group) => (
            <NavDropdown key={group.id} group={group} pathname={pathname} />
          ))}
        </div>
      </nav>
      <nav
        className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
        aria-label="Mobile navigation"
      >
        <div className="flex justify-around px-1 py-2">
          {MOBILE_PRIMARY.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-nav-target flex min-w-[3rem] flex-col items-center justify-center rounded-lg px-2 py-1 text-[10px] ${
                isNavActive(pathname, item.href) ||
                (item.href === "/portfolio" &&
                  (pathname.startsWith("/portfolio-ledger") || pathname.startsWith("/watchlist")))
                  ? "font-semibold text-slate-900"
                  : "text-slate-600"
              }`}
              title={item.label}
            >
              <span>{item.short}</span>
            </Link>
          ))}
          <button
            type="button"
            className={`mobile-nav-target flex min-w-[3rem] flex-col items-center justify-center rounded-lg px-2 py-1 text-[10px] ${
              moreActive || moreOpen ? "font-semibold text-slate-900" : "text-slate-600"
            }`}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            More
          </button>
        </div>
        {moreOpen ? (
          <div className="mobile-nav-drawer max-h-[50vh] overflow-y-auto border-t bg-white px-3 py-2">
            {NAV_TREE.map((group) => (
              <details key={group.id} className="mb-2 rounded border border-slate-100" open={isGroupActive(pathname, group)}>
                <summary className="cursor-pointer select-none px-2 py-1.5 text-[11px] font-semibold text-slate-800">
                  {group.label}
                  <span className="ml-1 font-normal text-slate-500">— {group.description}</span>
                </summary>
                <ul className="grid gap-1 px-2 pb-2">
                  {group.children.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`block rounded border px-2 py-1.5 ${
                          isNavActive(pathname, item.href) ? "border-slate-800 bg-slate-100 font-medium" : "border-slate-200"
                        }`}
                        onClick={() => setMoreOpen(false)}
                      >
                        <span className="text-[11px]">{item.label}</span>
                        <span className="block text-[9px] text-slate-500">{item.description}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            <Link
              href={NAV_HOME.href}
              className="block rounded border border-slate-200 px-2 py-1.5 text-center text-[11px]"
              onClick={() => setMoreOpen(false)}
            >
              {NAV_HOME.label}
            </Link>
          </div>
        ) : null}
      </nav>
    </>
  );
}
