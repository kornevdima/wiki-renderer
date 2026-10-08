"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

import { ErrorPage } from "@/components/error-page";
import { retrySegment } from "@/lib/error-retry";

/**
 * The root segment's error boundary (US-205): any render failure below the root layout shows the ESG error page instead of
 * Next's built-in card. The `error` prop is deliberately unused: its message, stack and `digest` never reach the page
 * (Next has already logged it on the server). "Try again" is `router.refresh()` plus `reset()` in one transition, because
 * `reset()` alone never refetches a server component that threw. A failure in the root layout itself lands in `global-error.tsx`.
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return <ErrorPage onRetry={() => retrySegment({ refresh: () => router.refresh(), reset, startTransition })} />;
}
