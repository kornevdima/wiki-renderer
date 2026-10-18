/**
 * Quiet start (US-278): `wiki-renderer start` shows its own lines, not Next's banner or the app's INFO log. The server is
 * started with `LOG_LEVEL=warn` (the app's logger honours it), so INFO never prints; this filter hides the banner and, as a
 * second guard, any INFO or DEBUG JSON log line on the child's stdout. Everything else (warnings, errors, a crash's output)
 * passes, and stderr is never filtered. `--verbose` skips both.
 */
const BANNER = [/^\s*▲ Next\.js/, /^\s*- (Local|Network|Environments|Experiments):?/, /^\s*[✓✔] (Ready|Starting|Running next\.config)/, /^\s*· \w+/];

/** True when a line of the server's stdout should be shown. */
export function shouldShowLine(line: string): boolean {
  if (line.trim() === "") return true;
  if (BANNER.some((pattern) => pattern.test(line))) return false;
  if (line.startsWith("{")) {
    try {
      const severity = (JSON.parse(line) as { severity?: unknown }).severity;
      if (severity === "INFO" || severity === "DEBUG") return false;
    } catch {
      // not a log line
    }
  }
  return true;
}

/** Splits a stream into lines (a chunk may end mid-line), writes the ones to show, and `flush()` writes a last unfinished line. */
export function createLineFilter(write: (line: string) => void): { push(chunk: string): void; flush(): void } {
  let rest = "";
  const emit = (line: string) => {
    if (shouldShowLine(line)) write(line);
  };
  return {
    push(chunk) {
      const parts = (rest + chunk).split(/\r?\n/);
      rest = parts.pop() ?? "";
      parts.forEach(emit);
    },
    flush() {
      if (rest !== "") emit(rest);
      rest = "";
    },
  };
}
