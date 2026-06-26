'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const COOKIE_KEY = 'sidiora_cookie_consent';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(COOKIE_KEY)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const accept = () => { localStorage.setItem(COOKIE_KEY, 'accepted'); setVisible(false); };
  const decline = () => { localStorage.setItem(COOKIE_KEY, 'declined'); setVisible(false); };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9997] border-t border-dark-gray7 bg-dark-gray4/97 backdrop-blur-sm px-4 py-3">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-start gap-2.5 flex-1">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0 mt-[1px] text-dark-gray9"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
          </svg>
          <p className="text-size-12 text-dark-gray9 leading-[1.5]">
            We use cookies to improve your experience and analyse platform usage. See our{' '}
            <Link href="/docs/privacy" className="text-green-middle underline hover:opacity-80 transition">
              Privacy Policy
            </Link>{' '}
            for details.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-5 sm:ml-0">
          <button
            onClick={decline}
            className="px-4 py-1.5 rounded-lg border border-dark-gray6 text-size-12 text-dark-disabled hover:text-half-enabled hover:border-dark-gray9 transition"
          >
            Decline
          </button>
          <button
            onClick={accept}
            className="px-4 py-1.5 rounded-lg bg-green-middle text-size-12 font-manrope-bold text-black-gray hover:opacity-90 transition"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
