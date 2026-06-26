'use client';

/**
 * Supabase OAuth callback landing page.
 *
 * Two redirect shapes can land here:
 *   - PKCE flow (default for supabase-js v2): `?code=...&state=...`
 *     We call `exchangeCodeForSession(code)` explicitly. The Supabase client
 *     will also try to do this via `detectSessionInUrl: true`, but doing it
 *     ourselves removes the race and surfaces errors directly to the user.
 *   - Implicit flow (magic-link OTP): `#access_token=...`
 *     `detectSessionInUrl: true` parses the hash on client boot. We just wait.
 *
 * In both cases we end up with a hydrated session, at which point
 * `PaxeerWagmiBridge` auto-connects wagmi to the `paxeer-embedded` connector.
 *
 * Errors from the OAuth provider arrive as `?error=...&error_description=...`
 * and are surfaced verbatim.
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePaxeer } from '@/core/wallet-sdk';

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackShell loading />}>
      <AuthCallbackInner />
    </Suspense>
  );
}

function AuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { wallet, session, isLoading } = usePaxeer();
  const [error, setError] = useState<string | null>(null);
  const [exchangeStatus, setExchangeStatus] = useState<'idle' | 'pending' | 'done'>('idle');
  const exchangedRef = useRef(false);

  // ── 1. Surface OAuth provider errors ────────────────────────────────────────
  useEffect(() => {
    const errParam = params.get('error_description') ?? params.get('error');
    if (errParam) setError(errParam);
  }, [params]);

  // ── 2. PKCE: explicitly exchange `?code=` for a session ─────────────────────
  useEffect(() => {
    if (error) return;
    if (!wallet) return;
    if (exchangedRef.current) return;

    const code = params.get('code');
    if (!code) {
      // No code → either implicit hash flow or already-cleaned URL. Fall
      // through to the wait-for-session effect below.
      setExchangeStatus('done');
      return;
    }

    exchangedRef.current = true;
    setExchangeStatus('pending');

    void (async () => {
      const { error: xchgErr } = await wallet.supabase.auth.exchangeCodeForSession(code);
      if (xchgErr) {
        setError(xchgErr.message);
      }
      setExchangeStatus('done');
    })();
  }, [wallet, params, error]);

  // ── 3. Once we have a hydrated session, redirect ────────────────────────────
  useEffect(() => {
    if (error) return;
    if (!wallet) return;
    if (exchangeStatus !== 'done') return;
    if (isLoading) return;
    if (!session) return;

    const next = params.get('next') ?? '/';
    router.replace(next);
  }, [wallet, session, isLoading, error, exchangeStatus, router, params]);

  return <CallbackShell loading={!error} error={error} onBack={() => router.replace('/')} />;
}

function CallbackShell({
  loading,
  error,
  onBack,
}: {
  loading: boolean;
  error?: string | null;
  onBack?: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="bg-dark-gray4 border border-dark-gray rounded-2xl p-6 max-w-sm w-full text-center">
        {error ? (
          <>
            <h1 className="text-size-14 font-manrope-bold text-red-middle">Sign-in failed</h1>
            <p className="text-size-12 text-half-enabled mt-2 break-words">{error}</p>
            {onBack && (
              <button
                onClick={onBack}
                className="mt-4 rounded-lg px-4 py-2 bg-dark-gray hover:bg-dark-gray7 transition text-size-12 text-half-enabled"
              >
                Back to app
              </button>
            )}
          </>
        ) : loading ? (
          <>
            <div className="w-8 h-8 mx-auto rounded-full border-2 border-green-middle border-t-transparent animate-spin" />
            <h1 className="text-size-14 font-manrope-bold text-half-enabled mt-4">
              Completing sign-in…
            </h1>
            <p className="text-size-11 text-dark-disabled mt-1">
              Provisioning your Paxeer wallet
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
