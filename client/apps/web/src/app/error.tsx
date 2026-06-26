'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 p-8">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="relative"
      >
        <div className="w-20 h-20 rounded-3xl bg-red-500/5 border border-red-500/10 flex items-center justify-center">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="text-red-400/70">
            <path d="M18 11V19M18 25H18.015" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M15.5 5.3L3.4 26.7C2.6 28.1 3.6 29.8 5.2 29.8H30.8C32.4 29.8 33.4 28.1 32.6 26.7L20.5 5.3C19.7 3.9 17.7 3.9 16.9 5.3H15.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="absolute -inset-8 bg-red-500/5 rounded-full blur-3xl" />
      </motion.div>

      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-center space-y-2 relative"
      >
        <h2 className="text-xl font-manrope-bold text-white/90">Something went wrong</h2>
        <p className="text-size-13 text-dark-disabled max-w-sm">
          An unexpected error occurred. Your funds and data are safe — this is just a display issue.
        </p>
        {error.digest && (
          <p className="text-size-10 text-dark-disabled/50 font-mono mt-3">
            Reference: {error.digest}
          </p>
        )}
      </motion.div>

      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex gap-3"
      >
        <button
          onClick={reset}
          className="px-6 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-manrope-bold text-size-13 hover:bg-emerald-500/20 transition-all active:scale-[0.97]"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.href = '/'}
          className="px-6 py-2.5 rounded-xl border border-dark-gray text-half-enabled font-manrope-bold text-size-13 hover:bg-dark-gray2 transition-all active:scale-[0.97]"
        >
          Go home
        </button>
      </motion.div>
    </div>
  );
}
