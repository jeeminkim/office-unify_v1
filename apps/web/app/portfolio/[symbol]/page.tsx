import Link from 'next/link';
import { createServerSupabaseAuthClient } from '@/lib/supabase/server';
import { isAllowedPersonaChatEmail } from '@/lib/server/allowed-user';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { SignOutButton } from '@/components/SignOutButton';
import { PortfolioSymbolDetailClient } from './PortfolioSymbolDetailClient';

type Props = { params: Promise<{ symbol: string }> };

export default async function PortfolioSymbolPage({ params }: Props) {
  const supabase = await createServerSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 p-8 text-slate-800">
        <h1 className="text-xl font-bold">Portfolio Dossier</h1>
        <p className="text-sm text-slate-600">이 페이지는 Google 로그인 후 사용할 수 있습니다.</p>
        <GoogleSignInButton redirectTo={`/portfolio/${encodeURIComponent((await params).symbol)}`} />
        <Link href="/portfolio" className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800">
          ← 포트폴리오로 돌아가기
        </Link>
      </div>
    );
  }

  if (!isAllowedPersonaChatEmail(user.email)) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 p-8 text-slate-800">
        <h1 className="text-xl font-bold">접근 불가</h1>
        <p className="text-sm text-slate-600">허용된 Google 계정만 사용할 수 있습니다.</p>
        <SignOutButton />
      </div>
    );
  }

  return <PortfolioSymbolDetailClient symbolKey={decodeURIComponent((await params).symbol)} />;
}

