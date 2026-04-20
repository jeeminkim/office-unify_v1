import Link from 'next/link';
import { createServerSupabaseAuthClient } from '@/lib/supabase/server';
import { isAllowedPersonaChatEmail } from '@/lib/server/allowed-user';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { SignOutButton } from '@/components/SignOutButton';
import InfographicClient from './InfographicClient';

export const metadata = {
  title: 'Infographic Generator',
};

export default async function InfographicPage() {
  const supabase = await createServerSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 p-8 text-slate-800">
        <h1 className="text-xl font-bold">Infographic Generator</h1>
        <p className="text-sm text-slate-600">Google 로그인 후에만 사용할 수 있습니다.</p>
        <GoogleSignInButton redirectTo="/infographic" />
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

  return <InfographicClient />;
}

