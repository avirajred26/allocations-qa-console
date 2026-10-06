import type { ReactNode } from 'react';

export const metadata = { title: 'Allocations QA Console' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#0f1115', color: '#e6e8ee' }}>
        {children}
      </body>
    </html>
  );
}
