// Unit-test stub for the `server-only` package (US-006, SA-G3 §4.1).
//
// The real `server-only` package throws when imported outside a React
// Server Components bundler build — exactly the guard that makes it useless
// under plain Node (vitest). `vitest.config.ts` and `vitest.integration.config.ts`
// both alias the `server-only` specifier to this file instead, so any module
// that starts with `import "server-only"` (env.ts, client.ts, …) loads
// cleanly in a unit/integration spec. Deliberately empty: an import-for-
// side-effect-only marker package has no exports to stub.
export {};
