import Link from "next/link";
import { createServerSupabaseAuthClient } from "@/lib/supabase/server";
import { isAllowedPersonaChatEmail } from "@/lib/server/allowed-user";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { SignOutButton } from "@/components/SignOutButton";
import { SHOW_TREND_UI } from "@/lib/feature-flags";
import { TrendAnalysisClient } from "./TrendAnalysisClient";

export const metadata = {
  title: "트렌드 분석 센터",
};

export default async function TrendPage() {
  if (!SHOW_TREND_UI) {
    return (
      <div className="mx-auto max-w-lg p-8 text-slate-800">
        <h1 className="text-xl font-bold">Trend</h1>
        <p className="mt-2 text-sm text-slate-600">
          Trend 관련 기능은 현재 비활성화되어 있습니다. `lib/feature-flags.ts`의 SHOW_TREND_UI를 참고하세요.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800">
          ← 홈
        </Link>
      </div>
    );
  }

  const supabase = await createServerSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 p-8 text-slate-800">
        <h1 className="text-xl font-bold">트렌드 분석 센터</h1>
        <p className="text-sm text-slate-600">Google 로그인 후에만 사용할 수 있습니다.</p>
        <GoogleSignInButton redirectTo="/trend" />
        <Link href="/" className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800">
          ← dev_support 홈
        </Link>
      </div>
    );
  }

  if (!isAllowedPersonaChatEmail(user.email)) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 p-8 text-slate-800">
        <h1 className="text-xl font-bold">접근 불가</h1>
        <p className="text-sm text-slate-600">허용된 Google 계정만 사용할 수 있습니다.</p>
        {user.email ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-xs text-amber-950">
            현재 로그인: {user.email}
          </p>
        ) : null}
        <SignOutButton />
        <Link href="/" className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800">
          ← dev_support 홈
        </Link>
      </div>
    );
  }

  return <TrendAnalysisClient />;
}
