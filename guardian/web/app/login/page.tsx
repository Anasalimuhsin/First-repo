import { AuthForm } from '@/components/AuthForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;
  return (
    <main className="container">
      {expired && <p className="notice center">انتهت الجلسة. سجّل الدخول مرة أخرى.</p>}
      <AuthForm mode="login" />
    </main>
  );
}
