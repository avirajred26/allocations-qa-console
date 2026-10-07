'use client';

import { InfoIcon, RotateCcwIcon } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useTriage } from '@/components/providers/triage-provider';

export function UnsavedTriageNotice() {
  const { dirtyIds, resetTriage } = useTriage();
  if (dirtyIds.length === 0) return null;
  return (
    <Alert role="status" className="border-warning/40">
      <InfoIcon className="text-warning" />
      <AlertTitle>Unsaved local triage edits ({dirtyIds.join(', ')})</AlertTitle>
      <AlertDescription>
        Edits live in this tab only, are not saved anywhere, and are lost on reload. The verdict, cards and Slack update
        reflect them.
      </AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline" onClick={() => resetTriage()}>
          <RotateCcwIcon data-icon="inline-start" />
          Reset all
        </Button>
      </AlertAction>
    </Alert>
  );
}
