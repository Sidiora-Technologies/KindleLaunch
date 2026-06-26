'use client';

import { Toaster } from 'sonner';

export default function ToastProvider() {
  return (
    <Toaster
      position="bottom-center"
      toastOptions={{
        style: {
          background: '#1a1a1e',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#fff',
          fontSize: '13px',
          fontFamily: 'var(--font-manrope), system-ui, sans-serif',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(12px)',
          maxWidth: 'calc(100vw - 32px)',
        },
        classNames: {
          success: '[&>div>svg]:text-emerald-400',
          error: '[&>div>svg]:text-red-400',
          warning: '[&>div>svg]:text-amber-400',
          info: '[&>div>svg]:text-blue-400',
        },
      }}
      gap={8}
      expand={false}
      richColors={false}
      closeButton
      mobileOffset={88}
    />
  );
}
