import Link from "next/link";
import { createServerSupabaseAuthClient } from "@/lib/supabase/server";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { SignOutButton } from "@/components/SignOutButton";
import { SHOW_TREND_UI } from "@/lib/feature-flags";

export async function AuthToolbar() {
  const supabase = await createServerSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="flex flex-wrap items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 py-2 text-sm">
      <Link href="/" className="mr-auto font-medium text-slate-800 hover:underline">
        dev_support
      </Link>
      <nav className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <Link href="/persona-chat" className="hover:text-slate-900 hover:underline">
          Persona chat
        </Link>
        <Link href="/committee-discussion" className="hover:text-slate-900 hover:underline">
          위원회 토론
        </Link>
        <Link href="/research-center" className="hover:text-slate-900 hover:underline">
          Research Center
        </Link>
        <Link href="/private-banker" className="hover:text-slate-900 hover:underline">
          Private Banker
        </Link>
        <Link href="/portfolio-ledger" className="hover:text-slate-900 hover:underline">
          원장
        </Link>
        {SHOW_TREND_UI ? (
          <Link href="/trend" className="hover:text-slate-900 hover:underline">
            Trend
          </Link>
        ) : null}
      </nav>
      {user ? (
        <>
          <span className="truncate text-slate-600" title={user.email ?? undefined}>
            {user.email ?? user.id}
          </span>
          <SignOutButton />
        </>
      ) : (
        <GoogleSignInButton redirectTo="/persona-chat" />
      )}
    </header>
  );
}
