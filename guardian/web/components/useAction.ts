'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Runs a mutation, then refreshes server data. Tracks busy/error state. */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>, { confirm: question }: { confirm?: string } = {}) {
    if (question && !window.confirm(question)) return false;
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error };
}
