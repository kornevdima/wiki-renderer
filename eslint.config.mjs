// Flat config — ESLint 10 dropped .eslintrc.* entirely.
//
// ── Running this config ──────────────────────────────────────────────────────
// Use `npm run lint`, which goes through `scripts/eslint-ts6.cjs`. Plain `eslint .`
// will NOT work: typescript-eslint hard-throws on any TypeScript major >= 7
// (typescript-eslint#10940) and this project is on TypeScript 7. The wrapper feeds
// typescript-eslint the side-by-side `@typescript/typescript6` build — which it
// supports (`typescript-estree` peers on `typescript: ">=4.8.4 <6.1.0"`) — while
// tsc, Next.js and the editor continue to use TypeScript 7. See that file for detail.
//
// ── Why this is hand-built instead of `eslint-config-next` ─────────────────────
// `eslint-config-next` 16.3.5 bundles `eslint-plugin-react`, `eslint-plugin-import`
// and `eslint-plugin-jsx-a11y`. Their latest releases peer ESLint <= 9, and
// `eslint-plugin-react` calls the `context.getFilename()` API that ESLint 10
// removed, so it crashes on load. Given the "latest versions" policy, the operator
// chose ESLint 10 + a hand-built config over ESLint 9 + `eslint-config-next`
// (SA-G3 §3.2, amended 2026-09-16). Accessibility is still gated at runtime by the
// axe scan in e2e; `eslint-plugin-react-hooks` (which supports ESLint 10 and
// carries the rules that actually catch bugs — rules-of-hooks, exhaustive-deps) is
// kept.
//
// No Prettier config exists here and none is added (SA-G3 §3.2 / operator ruling).
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// The `*.testing` ban (BUG-006/BUG-007). ESLint flat config REPLACES a rule's options when a later block sets
// the same rule for the same file — it never merges them — so every block below that sets
// `no-restricted-imports` must include this group, or it silently exempts its files from the ban (US-046/US-047
// review round 2; the pre-existing `content/*` block had the same hole, BUG-011). Pinned by
// `scripts/eslint-restricted-imports.test.ts`, which resolves the real config per file.
const TESTING_MODULES_PATTERN = {
  group: ["**/*.testing", "**/*.testing.*"],
  message:
    "*.testing modules are test-only seams (they take injectable deps). Shipped code must use the production export, which takes no deps — see BUG-006/BUG-007.",
};

// US-159 (BUG-014): `instanceof` against the typed GitHub errors is false across the instrumentation/page bundles
// on a production build (each carries its own copy of `@/lib/wiki-connection`). Shipped code must use the
// branded guards. Same replacement caveat as above: `no-restricted-syntax` options are REPLACED by a later block
// setting the rule for the same file, so the `access.ts` block below spreads this selector in too.
const TYPED_ERROR_INSTANCEOF_SELECTOR = {
  selector: "BinaryExpression[operator='instanceof'][right.name=/^(WikiRevokedError|WikiFetchError|WikiTooLargeError)$/]",
  message:
    "Don't use instanceof with WikiRevokedError/WikiFetchError/WikiTooLargeError: it is false across bundles on a production build (BUG-014). Use isWikiRevokedError / isWikiFetchError / isWikiTooLargeError from @/lib/wiki-connection.",
};

const eslintConfig = defineConfig([
  js.configs.recommended,
  // Non type-checked recommended set — parity with eslint-config-next/typescript,
  // which also does not turn on type-aware linting. No `projectService`.
  ...tseslint.configs.recommended,
  nextPlugin.configs.recommended,
  nextPlugin.configs["core-web-vitals"],
  reactHooks.configs.flat["recommended-latest"],

  {
    // App/library source: Next.js code runs both in the browser (client
    // components) and in Node (server components, route handlers).
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
  },

  {
    // BUG-006 follow-up (review r4, 2026-09-22): the guard-neutering
    // property — a shipped admin action can't override
    // `requirePlatformAdminAction`'s session check — is now a TypeScript
    // compile error, not a text scan (`requirePlatformAdminAction` takes
    // exactly one parameter; see `features/identity/require-platform-admin.ts`).
    // A bare `// @ts-expect-error` on the line carrying an illegal second
    // argument silences that compile error and reopens the exact bypass
    // BUG-006 fixed — closed here with an AST-based ESLint rule, not
    // another substring scan (a text scan is what got bypassed three times
    // in a row). No suppression directive is allowed at all in these two
    // trees, regardless of whether it carries a description:
    // typescript-eslint's own default for `ts-expect-error` specifically is
    // `"allow-with-description"`, which is exactly what would have let a
    // plausible-looking description slip the probe through.
    //
    // Scope (dispatcher, 2026-09-22): ALL of `src/**`, not just `app/` and
    // `features/`. `src/components/admin/**` is shipped code the admin-action
    // scan already treats as an admin tree, so a narrower scope would just
    // move the hole one directory over. The two files below are the only
    // known-legitimate suppressions; they are exempted by name, never by a
    // blanket allowance.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": true,
          "ts-ignore": true,
          "ts-nocheck": true,
        },
      ],
    },
  },

  {
    // BUG-007 (verification, 2026-09-22): the `*.testing` import rule in
    // `admin-actions.test.ts` only walked `src/app/**` and `src/features/**`,
    // so a shipped file under `src/components/admin/**` could import the
    // deps-taking test double — and aliasing it to the production name
    // (`… as requirePlatformAdminAction`) also satisfied the action-shape
    // scan's "calls the guard first" check. Closed here, on import PATHS,
    // which is what the attack actually needs: an alias renames the binding,
    // never the module specifier. AST-based, so quoting/formatting tricks
    // don't apply, and it covers every shipped file, not two subtrees.
    // Test files legitimately import the double and are exempt.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/**/*.test.{ts,tsx}",
      "src/**/*.itest.{ts,tsx}",
      "src/**/*.typecheck.ts",
      "src/**/__test-helpers__/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [TESTING_MODULES_PATTERN],
        },
      ],
    },
  },

  {
    // US-159 (BUG-014): the typed-error `instanceof` ban, shipped code only (specs build errors from separate
    // module copies on purpose to pin the premise).
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/**/*.test.{ts,tsx}",
      "src/**/*.itest.{ts,tsx}",
      "src/**/*.typecheck.ts",
      "src/**/__test-helpers__/**",
    ],
    rules: {
      "no-restricted-syntax": ["error", TYPED_ERROR_INSTANCEOF_SELECTOR],
    },
  },

  {
    // US-059 contract E6 (S4a): `content/*` never imports `features/*` or `app/*` — the AGENTS.md dependency
    // rule, and the one property that makes the `WikiSourceAdapter` seam (`src/content/runtime/adapter.ts`)
    // dependency INVERSION rather than a layering exception. `src/instrumentation.ts` is the one file allowed
    // to import both sides, and it lives outside `src/content/**`, so it's untouched by this rule. Matches on
    // the import SPECIFIER (both the `@/...` alias form and a relative path — `**/features/**`/`**/app/**`
    // catch `../../features/wikis/registry` and `../../app/...` the same way the alias groups catch
    // `@/features/wikis/registry` and `@/app/...`), same "path, not resolved location" reasoning the
    // `*.testing` rule above uses. Test files under `src/content/**` are exempt (a spec may need to reach a
    // fake/fixture that happens to live under `features/`), matching the exemption shape above.
    files: ["src/content/**/*.{ts,tsx}"],
    ignores: ["src/content/**/*.test.{ts,tsx}", "src/content/**/*.itest.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            TESTING_MODULES_PATTERN,
            {
              group: ["@/features/*", "@/features/**", "**/features/*", "**/features/**"],
              message:
                "content/* never imports features/* (AGENTS.md dependency rule). Reach features/wikis only through the WikiSourceAdapter port registered once in src/instrumentation.ts.",
            },
            {
              group: ["@/app/*", "@/app/**", "**/app/*", "**/app/**"],
              message:
                "content/* never imports app/* (AGENTS.md dependency rule).",
            },
          ],
        },
      ],
    },
  },

  {
    // US-046 + US-047 review round 1 finding 3 (2026-09-24): access-import-boundary.test.ts's C11 scan is a
    // plain textual regex walk of access.ts's own source and only catches the `@/`-alias, straight-quote form
    // — a relative-path import or a backtick dynamic-import specifier slips past it, the same bypass class as
    // BUG-007/008. This is the structural layer (an AST-based ESLint rule) the review asked for, mirroring the
    // `content/*` rule above (alias + relative-path glob groups, one group per forbidden module) for BR-034's
    // identical boundary on `access.ts`: permission (this file) and fetchability (`content/*`, `lib/github`)
    // are separate functions on separate call paths, and `access.ts` may only reach `getWikiConnection`
    // (registry state) and its two reads. `no-restricted-imports`'s `ImportExpression` handling in this
    // ESLint/typescript-eslint combination does not fire on a dynamic `import()` call (only
    // ImportDeclaration/ExportNamedDeclaration/ExportAllDeclaration/TSImportEqualsDeclaration — confirmed by
    // reading `no-restricted-imports.js`'s own visitor keys), so the two `no-restricted-syntax` selectors below
    // close that gap: one for a plain string specifier, one for a template-literal (backtick) specifier with no
    // substitution, both regex-matching `content/` or `lib/github` preceded by a path start or a `/` — so both
    // the alias and relative-path forms are caught the same way.
    files: ["src/features/projects/access.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            TESTING_MODULES_PATTERN,
            {
              group: ["@/content/*", "@/content/**", "**/content/*", "**/content/**"],
              message:
                "access.ts never imports content/* (BR-034: permission and fetchability are separate call paths). See SA-MOD Projects and access §3.",
            },
            {
              group: [
                "@/lib/github",
                "@/lib/github/*",
                "@/lib/github/**",
                "**/lib/github",
                "**/lib/github/*",
                "**/lib/github/**",
              ],
              message:
                "access.ts never imports lib/github (BR-034: permission and fetchability are separate call paths). See SA-MOD Projects and access §3.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        TYPED_ERROR_INSTANCEOF_SELECTOR,
        {
          selector:
            "ImportExpression[source.type='Literal'][source.value=/(^|\\/)(content\\/|lib\\/github)/]",
          message:
            "access.ts never dynamically imports content/* or lib/github (BR-034), same rule as the static no-restricted-imports group above.",
        },
        {
          selector:
            "ImportExpression > TemplateLiteral > TemplateElement[value.raw=/(^|\\/)(content\\/|lib\\/github)/]",
          message:
            "access.ts never dynamically imports content/* or lib/github (BR-034), including via a template-literal (backtick) specifier.",
        },
      ],
    },
  },

  {
    // The two pre-existing, legitimate suppression sites, exempted by name:
    // `actions.typecheck.ts` exists to PIN type-level rejections (one
    // `@ts-expect-error` per case — the directive is the assertion), and
    // `auth.config.test.ts` has one. Neither is shipped admin code. Any new
    // entry here needs a stated reason.
    files: ["src/lib/audit/actions.typecheck.ts", "src/auth.config.test.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description" },
      ],
    },
  },

  {
    // ESM config/tooling files (this file, future *.mjs scripts).
    files: ["**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node },
    },
  },

  {
    // CommonJS tooling: scripts/eslint-ts6.cjs. It legitimately `require()`s —
    // that is the whole point of the shim, and cannot be expressed as an ESM
    // import — so `no-require-imports` is off here only.
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
    ".playwright/**",
    "fixtures/**",
  ]),
]);

export default eslintConfig;
