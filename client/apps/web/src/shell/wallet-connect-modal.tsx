'use client';

/**
 * WalletConnectModal — entry point for both the embedded Paxeer wallet
 * (Supabase auth: Email / Google / GitHub / X) and any browser-injected
 * wallet (MetaMask, Rabby, Coinbase, etc.).
 *
 * Design:
 *   - Top section: "Sign in with Paxeer" — magic-link email + four OAuth buttons.
 *   - Divider.
 *   - Bottom section: "Other wallets" — list of installed injected connectors.
 *
 * Once the user picks an embedded sign-in method, control either redirects
 * (OAuth) or dispatches a magic-link (email). Wagmi auto-connects via
 * `PaxeerWagmiBridge` once Supabase reports a session.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useConnect } from 'wagmi';
import {
  usePaxeer,
  useEmbeddedWalletAvailable,
  PAXEER_CONNECTOR_ID,
  type SignInProvider,
} from '@/core/wallet-sdk';

interface WalletConnectModalProps {
  open: boolean;
  onClose: () => void;
}

export default function WalletConnectModal({ open, onClose }: WalletConnectModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const embeddedAvailable = useEmbeddedWalletAvailable();
  const { signInWithEmail, signInWithOAuth, authBusy, authError } = usePaxeer();
  const { connectors, connect, status: connectStatus, error: connectError } = useConnect();

  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<SignInProvider | 'email' | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Lock body scroll while open so the page can't scroll behind the modal.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      // Reset transient state every time modal closes.
      setEmailSent(false);
      setPendingProvider(null);
      setLocalError(null);
    }
  }, [open]);

  if (!open) return null;
  // SSR guard — createPortal needs `document`.
  if (typeof document === 'undefined') return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!email || !email.includes('@')) {
      setLocalError('Enter a valid email');
      return;
    }
    setPendingProvider('email');
    const r = await signInWithEmail(email.trim());
    setPendingProvider(null);
    if (r.ok) {
      setEmailSent(true);
    } else {
      setLocalError(r.error ?? 'Failed to send magic link');
    }
  };

  const handleOAuth = async (provider: SignInProvider) => {
    setLocalError(null);
    setPendingProvider(provider);
    try {
      await signInWithOAuth(provider);
      // Browser redirects on success — control rarely returns here.
    } catch (err) {
      setPendingProvider(null);
      setLocalError((err as Error).message);
    }
  };

  // Filter connectors: skip the Paxeer embedded one (handled in the top section)
  // and de-duplicate any auto-detected EIP-6963 injected providers that wagmi
  // surfaces alongside the generic "injected" connector.
  const otherConnectors = connectors
    .filter((c) => c.id !== PAXEER_CONNECTOR_ID)
    .filter((c, i, arr) => {
      // wagmi v2 surfaces both `injected()` and discovered EIP-6963 providers;
      // dedupe by name when both exist.
      if (c.id === 'injected') {
        const hasNamed = arr.some((other) => other.id !== 'injected' && other.type === 'injected');
        return !hasNamed;
      }
      return true;
    });

  const errorMessage = localError ?? authError ?? connectError?.message ?? null;

  return createPortal(
    <motion.div
      ref={overlayRef}
      onClick={handleOverlayClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      style={{ minHeight: '100dvh' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="bg-dark-gray4 border border-dark-gray rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden my-auto">
        <div className="relative px-5 pt-5 pb-3">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-dark-gray hover:bg-dark-gray7 transition flex items-center justify-center text-half-enabled"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <div className="flex flex-col items-center gap-2">
            <Image
              src="/sidiora_fun_logo_offwhite.png"
              alt="Sidiora"
              width={140}
              height={36}
              className="h-9 w-auto"
              priority
            />
            <div className="text-center">
              <h2 className="text-size-14 font-manrope-bold text-half-enabled">Connect Wallet</h2>
              <p className="text-size-11 text-dark-disabled mt-0.5">Sign in to start trading</p>
            </div>
          </div>
        </div>

        {/* ─── Embedded (Paxeer) section ─────────────────────────────────── */}
        {embeddedAvailable ? (
          <div className="px-5 pb-4">
            <div className="text-size-10 text-dark-disabled font-manrope-bold uppercase tracking-wider mb-2">
              Paxeer Embedded Wallet
            </div>

            {emailSent ? (
              <div className="rounded-xl bg-green-opacity-015 border border-green-middle/30 p-3 mb-3">
                <p className="text-size-12 text-green-middle font-manrope-bold">Magic link sent</p>
                <p className="text-size-11 text-half-enabled mt-1">
                  Check <span className="text-green-middle">{email}</span> and click the link to sign in.
                </p>
                <button
                  onClick={() => {
                    setEmailSent(false);
                    setEmail('');
                  }}
                  className="text-size-10 text-dark-disabled hover:text-half-enabled mt-2 underline"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={handleEmail} className="mb-3">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    disabled={authBusy}
                    className="flex-1 bg-dark-gray border border-dark-gray rounded-lg px-3 py-2 text-size-12 text-half-enabled placeholder:text-dark-disabled focus:outline-none focus:border-green-middle/50 transition disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={authBusy || !email}
                    className="rounded-lg px-3 py-2 bg-green-middle hover:bg-green-middle2 transition text-size-12 font-manrope-bold text-black-gray disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {pendingProvider === 'email' ? '…' : 'Send'}
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-3 gap-2">
              <OAuthButton
                label="Google"
                provider="google"
                disabled={authBusy}
                pending={pendingProvider === 'google'}
                onClick={() => handleOAuth('google')}
                icon={<GoogleIcon />}
              />
              <OAuthButton
                label="GitHub"
                provider="github"
                disabled={authBusy}
                pending={pendingProvider === 'github'}
                onClick={() => handleOAuth('github')}
                icon={<GitHubIcon />}
              />
              <OAuthButton
                label="X"
                provider="twitter"
                disabled={authBusy}
                pending={pendingProvider === 'twitter'}
                onClick={() => handleOAuth('twitter')}
                icon={<XIcon />}
              />
            </div>
          </div>
        ) : (
          <div className="px-5 pb-3">
            <p className="text-size-11 text-dark-disabled">
              Embedded wallet is unavailable. Set <code className="text-half-enabled">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to enable.
            </p>
          </div>
        )}

        {/* ─── Divider ───────────────────────────────────────────────────── */}
        {embeddedAvailable && otherConnectors.length > 0 && (
          <div className="flex items-center gap-3 px-5 my-1">
            <div className="flex-1 h-px bg-dark-gray" />
            <span className="text-size-10 text-dark-disabled font-manrope-bold uppercase">or</span>
            <div className="flex-1 h-px bg-dark-gray" />
          </div>
        )}

        {/* ─── Injected wallets section ──────────────────────────────────── */}
        {otherConnectors.length > 0 && (
          <div className="px-5 pt-3 pb-5">
            <div className="text-size-10 text-dark-disabled font-manrope-bold uppercase tracking-wider mb-2">
              Other Wallets
            </div>
            <div className="flex flex-col gap-1.5">
              {otherConnectors.map((c) => (
                <button
                  key={c.uid}
                  onClick={() => connect({ connector: c })}
                  disabled={connectStatus === 'pending'}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-dark-gray hover:bg-dark-gray7 transition border border-transparent hover:border-dark-gray text-left disabled:opacity-50"
                >
                  <ConnectorIcon connector={c} />
                  <span className="text-size-12 font-manrope-bold text-half-enabled flex-1">
                    {c.name}
                  </span>
                  {connectStatus === 'pending' && (
                    <span className="text-size-10 text-dark-disabled">…</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mx-5 mb-5 rounded-lg bg-red-opacity-015 border border-red-middle/30 p-2.5">
            <p className="text-size-11 text-red-middle">{errorMessage}</p>
          </div>
        )}

        <div className="px-5 pb-4 pt-0">
          <p className="text-size-10 text-dark-disabled text-center">
            By connecting you agree to the{' '}
            <a href="/terms" className="underline hover:text-half-enabled">Terms</a>
          </p>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function OAuthButton({
  label,
  pending,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  provider: SignInProvider;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-lg bg-dark-gray hover:bg-dark-gray7 transition border border-transparent hover:border-dark-gray disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="w-5 h-5 flex items-center justify-center">
        {pending ? (
          <span className="block w-3 h-3 rounded-full border-2 border-half-enabled border-t-transparent animate-spin" />
        ) : (
          icon
        )}
      </div>
      <span className="text-size-10 font-manrope-bold text-half-enabled">{label}</span>
    </motion.button>
  );
}

function ConnectorIcon({ connector }: { connector: { icon?: string; name: string } }) {
  if (connector.icon) {
     
    return <img src={connector.icon} alt="" width={24} height={24} className="rounded" />;
  }
  return (
    <div className="w-6 h-6 rounded bg-dark-gray7 flex items-center justify-center text-size-11 font-manrope-bold text-half-enabled">
      {connector.name.charAt(0)}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-half-enabled">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-half-enabled">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}
