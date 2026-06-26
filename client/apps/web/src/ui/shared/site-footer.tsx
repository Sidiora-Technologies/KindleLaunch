import Link from 'next/link';

const LEGAL_LINKS = [
  { label: 'Terms of Service', href: '/docs/terms' },
  { label: 'Privacy Policy', href: '/docs/privacy' },
  { label: 'Trademark Guidelines', href: '/docs/trademark-guidelines' },
  { label: 'DMCA Guidelines', href: '/docs/dmca' },
  { label: 'Do Not Sell My Data', href: '/docs/do-not-sell' },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-dark-gray7 mt-auto px-5 py-5">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-size-10 text-dark-disabled order-2 sm:order-1">
          © {new Date().getFullYear()} Sidiora. All rights reserved.
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 order-1 sm:order-2">
          {LEGAL_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="text-size-11 text-dark-disabled hover:text-half-enabled transition"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
