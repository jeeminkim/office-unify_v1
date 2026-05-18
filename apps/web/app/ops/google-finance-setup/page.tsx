import Link from "next/link";
import { createServerSupabaseAuthClient } from "@/lib/supabase/server";
import { isAllowedPersonaChatEmail } from "@/lib/server/allowed-user";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { SignOutButton } from "@/components/SignOutButton";
import { GoogleFinanceSetupClient } from "./GoogleFinanceSetupClient";

export const metadata = { title: "Google Finance 설정" };

export default async function GoogleFinanceSetupPage() {
  const supabase = await createServerSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 p-8">
        <h1 className="text-xl font-bold">Google Finance 설정 점검</h1>
        <GoogleSignInButton redirectTo="/ops/google-finance-setup" />
        <Link href="/">← 홈</Link>
      </div>
    );
  }

  if (!isAllowedPersonaChatEmail(user.email)) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 p-8">
        <h1 className="text-xl font-bold">접근 불가</h1>
        <SignOutButton />
      </div>
    );
  }

  return <GoogleFinanceSetupClient />;
}
