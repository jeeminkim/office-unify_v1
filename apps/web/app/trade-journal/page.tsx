import Link from 'next/link';
import { Suspense } from 'react';
import { createServerSupabaseAuthClient } from '@/lib/supabase/server';
import { isAllowedPersonaChatEmail } from '@/lib/server/allowed-user';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { SignOutButton } from '@/components/SignOutButton';
import { TradeJournalClient } from './TradeJournalClient';

export default async function TradeJournalPage() {
  const supabase = await createServerSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 p-8 text-slate-800">
        <h1 className="text-xl font-bold">Trade Journal</h1>
        <p className="text-sm text-slate-600">이 페이지는 Google 로그인 후 사용할 수 있습니다.</p>
        <GoogleSignInButton redirectTo="/trade-journal" />
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
        <p className="text-sm text-slate-600">이 서비스는 허용된 Google 계정만 사용할 수 있습니다.</p>
        <SignOutButton />
        <Link href="/" className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800">
          ← dev_support 홈
        </Link>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl p-6 text-sm text-slate-600">로딩…</div>}>
      <TradeJournalClient />
    </Suspense>
  );
}

