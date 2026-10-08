import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/alert";

import { formatUtcHm } from "./stale-notice-format";

/**
 * The staleness notice (US-101, SA-MOD Reader UI and print §3; US-195). A server component: the time is formatted in
 * UTC by `formatUtcHm` on the server, so the sentence is deterministic. It takes only the `since` time: no
 * cause reaches it, so it can never name GitHub or tell a size refusal from an outage (US-101 sc.3-4, T13).
 * The kit's warning `Alert` (`role="status"`); it is page chrome, so it does not print.
 */
export function StaleNotice({ since }: { since: Date }) {
  const t = useTranslations("staleNotice");
  return (
    <Alert variant="warning" data-testid="stale-notice" className="print:hidden">
      {t("message", { time: formatUtcHm(since) })}
    </Alert>
  );
}
