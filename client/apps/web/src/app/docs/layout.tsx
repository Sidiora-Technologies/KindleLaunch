import Link from 'next/link';
import type { ReactNode } from 'react';

const DOC_LINKS = [
  { label: 'Terms of Service', href: '/docs/terms' },
  { label: 'Privacy Policy', href: '/docs/privacy' },
  { label: 'Trademark Guidelines', href: '/docs/trademark-guidelines' },
  { label: 'DMCA Guidelines', href: '/docs/dmca' },
  { label: 'Do Not Sell My Data', href: '/docs/do-not-sell' },
];

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-7">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-size-12 text-dark-disabled hover:text-half-enabled transition"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M9 2L4 7l5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to Sidiora
          </Link>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="lg:w-52 flex-shrink-0">
            <nav className="lg:sticky lg:top-8">
              <p className="text-size-10 text-dark-disabled font-manrope-bold uppercase tracking-wider mb-3 px-2">
                Legal
              </p>
              <div className="space-y-0.5">
                {DOC_LINKS.map(({ label, href }) => (
                  <Link
                    key={href}
                    href={href}
                    className="block text-size-12 text-dark-gray9 hover:text-half-enabled py-1.5 px-2 rounded-lg hover:bg-dark-gray7 transition"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </nav>
          </aside>

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
