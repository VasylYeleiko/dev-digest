/* Root error boundary — catches a render/runtime error in any route segment
   below the root layout, so a crash shows a retryable screen instead of a
   blank page. Deliberately no AppShell: the shell itself may be what threw. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  React.useEffect(() => {
    // Surface it in the browser console for debugging; the UI stays generic.
    console.error(error);
  }, [error]);

  return <ErrorState fullScreen title={t("errorPage.title")} body={t("errorPage.body")} onRetry={reset} />;
}
