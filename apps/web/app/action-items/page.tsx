import { createServerSupabaseAuthClient } from '@/lib/supabase/server';
import { isAllowedPersonaChatEmail } from '@/lib/server/allowed-user';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import Link from 'next/link';
import { ActionItemsClient } from './ActionItemsClient';

export default async function ActionItemsPage() {
  const supabase = await createServerSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 p-8">
        <h1 className="text-xl font-bold">Action Items</h1>
        <GoogleSignInButton redirectTo="/action-items" />
      </div>
    );
  }

  if (!isAllowedPersonaChatEmail(user.email)) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <p>접근 불가</p>
        <Link href="/">← 홈</Link>
      </div>
    );
  }

  return <ActionItemsClient />;
}
