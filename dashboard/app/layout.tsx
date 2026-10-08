import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { AppShell } from '@/components/shell/app-shell';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const metadata: Metadata = {
  title: {
    default: 'Allocations QA Console',
    template: '%s · Allocations QA Console',
  },
  description:
    'QA console for dashboard.allocations.com (assignment by Aviraj Lall). Not an official Allocations product.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#fafbfd',
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
};

const SEAM_VARS = ['ALLOW_TEST_NAMESPACE', 'TEST_COOLDOWN_SECONDS', 'TEST_ACQUIRE_TIMEOUT_MS', 'TEST_DISPATCH_MODE'];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Names only — values are never sent to the client.
  const testSeamsActive = SEAM_VARS.filter((name) => {
    const v = process.env[name];
    return typeof v === 'string' && v.length > 0;
  });

  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="font-sans">
        <AppShell testSeamsActive={testSeamsActive}>{children}</AppShell>
      </body>
    </html>
  );
}
