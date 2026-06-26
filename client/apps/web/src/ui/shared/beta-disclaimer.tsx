'use client';

import { useState, useEffect } from 'react';

const SESSION_KEY = 'sidiora_beta_agreed';

export default function BetaDisclaimer() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem(SESSION_KEY)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function handleAgree() {
    sessionStorage.setItem(SESSION_KEY, '1');
    setVisible(false);
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-[480px] rounded-2xl border border-[var(--color-dark-gray6)] bg-[var(--color-dark-gray4)] p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-2">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-yellow-middle)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <h2 className="font-manrope-bold text-[18px] text-white">
            Beta Disclaimer
          </h2>
        </div>

        <div className="mb-6 space-y-3 text-size-13 leading-[1.6] text-[var(--color-dark-gray9)]">
          <p>
            Sidiora.fun is currently in <span className="font-manrope-bold text-[var(--color-yellow-middle)]">active beta</span>.
            By continuing, you acknowledge and accept the following:
          </p>

          <ul className="list-none space-y-2 pl-0">
            <li className="flex items-start gap-2">
              <span className="mt-[3px] block h-[6px] w-[6px] shrink-0 rounded-full bg-[var(--color-yellow-middle)]" />
              <span>
                The platform is under active development. Features, interfaces, and
                functionality may change at any time <span className="text-white">without prior notice</span>.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-[3px] block h-[6px] w-[6px] shrink-0 rounded-full bg-[var(--color-yellow-middle)]" />
              <span>
                Bugs, errors, and unexpected behavior may occur. There is a real
                <span className="text-[var(--color-red-middle)]"> risk of partial or total loss of funds</span> when
                interacting with smart contracts on this platform.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-[3px] block h-[6px] w-[6px] shrink-0 rounded-full bg-[var(--color-yellow-middle)]" />
              <span>
                Smart contracts may be upgraded, paused, or replaced without advance
                warning as part of ongoing improvements.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-[3px] block h-[6px] w-[6px] shrink-0 rounded-full bg-[var(--color-yellow-middle)]" />
              <span>
                Price data, analytics, and displayed information may be inaccurate
                or delayed. Do not rely on them as financial advice.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-[3px] block h-[6px] w-[6px] shrink-0 rounded-full bg-[var(--color-yellow-middle)]" />
              <span>
                You use this platform entirely at your own risk. The Sidiora team
                accepts no liability for any losses incurred during the beta period.
              </span>
            </li>
          </ul>
        </div>

        <button
          onClick={handleAgree}
          className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-[var(--color-green-from)] to-[var(--color-green-to)] py-3 text-size-14 font-manrope-bold text-[var(--color-black-gray)] transition-opacity hover:opacity-90 active:opacity-80"
        >
          I Understand &amp; Agree
        </button>

        <p className="mt-3 text-center text-size-11 text-[var(--color-dark-gray6)]">
          This notice appears once per browser session.
        </p>
      </div>
    </div>
  );
}
