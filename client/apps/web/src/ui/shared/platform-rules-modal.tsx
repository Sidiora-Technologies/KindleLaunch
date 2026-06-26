'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'sidiora_rules_agreed_v1';

const RULES: { text: React.ReactNode }[] = [
  {
    text: (
      <>
        User-generated tokens are <strong className="text-half-enabled">not endorsed</strong> by
        Sidiora. Always do your own research before buying, selling, or holding any Digital Asset.
      </>
    ),
  },
  {
    text: (
      <>
        Smart contracts carry inherent risk. You may experience{' '}
        <span className="text-red-middle">partial or total loss of funds</span>. Use only what you
        can afford to lose.
      </>
    ),
  },
  {
    text: (
      <>
        Market manipulation, pump-and-dump schemes, wash trading, and deceptive conduct are{' '}
        <strong className="text-half-enabled">strictly prohibited</strong>.
      </>
    ),
  },
  {
    text: (
      <>
        No harassment, hate speech, impersonation, or synthetic/AI-generated voice misuse in the
        Voice Chat Feature.
      </>
    ),
  },
  {
    text: (
      <>
        Access from sanctioned or prohibited jurisdictions (including Russia, Iran, North Korea,
        Cuba, and Syria) is not permitted.
      </>
    ),
  },
  {
    text: (
      <>
        By continuing, you confirm you have read and accept our{' '}
        <Link href="/docs/terms" className="text-green-middle underline hover:opacity-80 transition">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/docs/privacy" className="text-green-middle underline hover:opacity-80 transition">
          Privacy Policy
        </Link>
        .
      </>
    ),
  },
];

export default function PlatformRulesModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function handleAgree() {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setVisible(false);
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-[520px] max-h-[92vh] overflow-y-auto rounded-2xl border border-dark-gray6 bg-dark-gray4 p-6 shadow-2xl">
        <div className="-mx-6 -mt-6 mb-5 overflow-hidden rounded-t-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Welcome_banner.png" alt="Welcome to Kindle Launch" className="w-full h-auto object-cover" />
        </div>
        <div className="mb-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-opacity-015 border border-green-middle/20 flex items-center justify-center flex-shrink-0">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-green-middle)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <h2 className="font-manrope-bold text-[17px] text-half-enabled leading-tight">
              Platform Rules
            </h2>
            <p className="text-size-11 text-dark-disabled mt-0.5">
              Please review before continuing
            </p>
          </div>
        </div>

        <ul className="mb-5 space-y-3">
          {RULES.map((rule, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-[6px] block h-[5px] w-[5px] shrink-0 rounded-full bg-green-middle" />
              <span className="text-size-12 text-dark-gray9 leading-[1.65]">{rule.text}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={handleAgree}
          className="w-full rounded-xl bg-gradient-to-r from-green-from to-green-to py-3 text-size-13 font-manrope-bold text-black-gray transition-opacity hover:opacity-90 active:opacity-80"
        >
          I Understand &amp; Agree
        </button>

        <p className="mt-3 text-center text-size-10 text-dark-disabled">
          This notice appears once. You can review all policies in the site footer at any time.
        </p>
      </div>
    </div>
  );
}
