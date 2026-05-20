import type { Metadata, Viewport } from "next";
import { AuthToolbar } from "@/components/AuthToolbar";
import { AppNav } from "@/components/AppNav";
import { MobileWebOptimizer } from "@/components/MobileWebOptimizer";
import { getOfficeUnifyWorkspaceSmoke } from "@/lib/office-unify-packages";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "dev_support",
    template: "%s · dev_support",
  },
  description:
    "dev_support — 자연어로 순서도(Mermaid), SQL, TypeScript 초안을 생성하는 개발 보조 도구",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pkgSmoke = getOfficeUnifyWorkspaceSmoke();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <MobileWebOptimizer />
        <span
          hidden
          aria-hidden
          data-office-unify-committee-count={pkgSmoke.committeeCount}
          data-office-unify-version={pkgSmoke.decisionEngineVersion}
        />
        <AuthToolbar />
        <AppNav />
        <main className="mobile-web-shell pb-16 md:pb-0">{children}</main>
      </body>
    </html>
  );
}
