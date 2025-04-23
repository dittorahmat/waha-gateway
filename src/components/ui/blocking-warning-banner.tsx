import React from 'react';
import { AlertTriangle } from 'lucide-react'; // Using lucide icon for visual cue
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // Using the newly added shadcn Alert component

export function BlockingWarningBanner() {
  return (
    // Using destructive variant for warning, but overriding colors for a yellow warning theme
    <Alert variant="destructive" className="container mx-auto mb-6 border-yellow-500 bg-yellow-50 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
      <AlertTriangle className="h-4 w-4 !text-yellow-600 dark:!text-yellow-400" /> {/* Adjusted icon color */}
      <AlertTitle className="font-semibold !text-yellow-700 dark:!text-yellow-200">Usage Warning</AlertTitle> {/* Adjusted title color */}
      <AlertDescription className="!text-yellow-700 dark:!text-yellow-300"> {/* Adjusted description color */}
        Automating WhatsApp messages carries a significant risk of your number being blocked by WhatsApp,
        especially when sending to many contacts or those who haven't interacted with you recently.
        Use this tool responsibly and at your own risk. Ensure you comply with WhatsApp's Terms of Service.
      </AlertDescription>
    </Alert>
  );
}