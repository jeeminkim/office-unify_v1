import type { Metadata } from "next";
import { AuthToolbar } from "@/components/AuthToolbar";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pkgSmoke = getOfficeUnifyWorkspaceSmoke();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <span
          hidden
          aria-hidden
          data-office-unify-committee-count={pkgSmoke.committeeCount}
          data-office-unify-version={pkgSmoke.decisionEngineVersion}
        />
        <AuthToolbar />
        {children}
      </body>
    </html>
  );
}
