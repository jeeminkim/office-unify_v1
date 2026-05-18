import Link from "next/link";

type Variant = "holdings" | "ledger";

const COPY: Record<
  Variant,
  { title: string; body: string; links: Array<{ href: string; label: string }> }
> = {
  holdings: {
    title: "보유 현황",
    body: "현재 보유 상태, 평가금액, 시세 품질, 집중도를 보는 화면입니다. 수량/평단 수정과 매매 기록 관리는 보유/거래 원장에서 합니다.",
    links: [
      { href: "/portfolio-ledger", label: "보유/거래 원장 열기" },
      { href: "/watchlist", label: "관심종목 관리" },
      { href: "/ops/google-finance-setup", label: "시세 상태 확인" },
      { href: "/action-items", label: "액션 인박스" },
    ],
  },
  ledger: {
    title: "보유/거래 원장",
    body: "매수·매도 기록, 보유 수량/평단, ticker 매핑을 관리하는 화면입니다. 현재 평가와 요약은 보유 현황에서 확인합니다.",
    links: [
      { href: "/portfolio", label: "보유 현황 보기" },
      { href: "/watchlist", label: "관심종목 관리" },
      { href: "/portfolio-ledger#ticker", label: "ticker resolver" },
      { href: "/action-items", label: "Action Items" },
    ],
  },
};

export function PortfolioRoleBanner({ variant }: { variant: Variant }) {
  const c = COPY[variant];
  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-slate-50/90 p-3 text-xs text-slate-800">
      <p className="font-semibold text-slate-900">{c.title}</p>
      <p className="mt-1 leading-relaxed">{c.body}</p>
      {variant === "ledger" ? (
        <p className="mt-1 text-[11px] text-slate-600">
          관심종목 목록·필터·등록 후보 승인은{" "}
          <Link href="/watchlist" className="font-medium text-violet-800 underline">
            관심종목 관리
          </Link>
          화면에서 할 수 있습니다.
        </p>
      ) : null}
      <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
        {c.links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-center text-[11px] hover:bg-slate-100"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
