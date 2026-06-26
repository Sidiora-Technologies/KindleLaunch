import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 p-8">
      <div className="relative">
        <div className="text-[120px] font-manrope-extra-bold leading-none text-dark-gray/30 select-none">
          404
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-dark-gray2/50 border border-dark-gray/40 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-dark-disabled">
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
              <path d="M18 18L24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M9 12H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-size-16 font-manrope-bold text-white/80">Page not found</h2>
        <p className="text-size-12 text-dark-disabled max-w-xs">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>

      <Link
        href="/"
        className="px-6 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-manrope-bold text-size-13 hover:bg-emerald-500/20 transition-all active:scale-[0.97]"
      >
        Back to home
      </Link>
    </div>
  );
}
