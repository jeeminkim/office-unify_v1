import Link from 'next/link';
import { createServerSupabaseAuthClient } from '@/lib/supabase/server';
import { isAllowedPersonaChatEmail } from '@/lib/server/allowed-user';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { StockDiscoverClient } from './StockDiscoverClient';

export default async function StockDiscoverPage() {
  const supabase = await createServerSupabaseAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAllowedPersonaChatEmail(user.email)) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-md flex-col justify-center gap-5 px-6">
        <div>
          <p className="text-sm font-semibold text-blue-500">종목 탐색</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">로그인이 필요해요</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">로그인하면 내 보유·관심종목을 반영한 검색과 관찰 후보를 볼 수 있습니다.</p>
        </div>
        <GoogleSignInButton redirectTo="/discover" />
        <Link href="/" className="text-center text-sm text-slate-500">홈으로 돌아가기</Link>
      </div>
    );
  }
  return <StockDiscoverClient />;
}
