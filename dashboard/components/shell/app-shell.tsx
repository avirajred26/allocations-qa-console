'use client';

import type { ReactNode } from 'react';
import { TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RunsProvider } from '@/components/providers/runs-provider';
import { TriageProvider } from '@/components/providers/triage-provider';
import { AppSidebar } from '@/components/shell/app-sidebar';
import { SiteFooter } from '@/components/shell/site-footer';
import { TopBar } from '@/components/shell/top-bar';

export function AppShell({ children, testSeamsActive }: { children: ReactNode; testSeamsActive: string[] }) {
  return (
    <TooltipProvider delay={200}>
      <TriageProvider>
        <RunsProvider>
          <SidebarProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
            >
              Skip to content
            </a>
            <AppSidebar />
            <SidebarInset className="min-w-0">
              <TopBar />
              {testSeamsActive.length > 0 && (
                <div className="px-4 pt-4 md:px-6">
                  <Alert variant="destructive">
                    <TriangleAlertIcon />
                    <AlertTitle>Test seams enabled on this deployment</AlertTitle>
                    <AlertDescription>
                      {testSeamsActive.join(', ')} must never be set on the public deployment. Remove them from the
                      project environment and redeploy.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
              <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6 outline-none md:px-7 md:py-7">
                {children}
              </main>
              <SiteFooter />
            </SidebarInset>
          </SidebarProvider>
          <Toaster position="bottom-right" closeButton />
        </RunsProvider>
      </TriageProvider>
    </TooltipProvider>
  );
}
