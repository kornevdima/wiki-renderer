#!/usr/bin/env node
/**
 * Runs ESLint with TypeScript 6 supplied to typescript-eslint, while the project
 * itself stays on TypeScript 7.
 *
 * Why this exists
 * ---------------
 * typescript-eslint hard-throws on any TypeScript major >= 7
 * (https://github.com/typescript-eslint/typescript-eslint/issues/10940), and
 * ESLint's built-in parser handles JS/JSX but not TypeScript syntax. So with
 * `typescript@7` hoisted at the root, `eslint .` cannot lint this codebase at all.
 *
 * Microsoft publishes TypeScript 6 as `@typescript/typescript6` precisely so it can
 * sit alongside `typescript@7` (see the TS 7.0 release notes, "Running side by side
 * with TypeScript 6.0"). typescript-eslint supports it —
 * `@typescript-eslint/typescript-estree` declares `peerDependencies.typescript:
 * ">=4.8.4 <6.1.0"` — but every module reaches it through a bare
 * `require("typescript")`, and there is no option or env var to redirect that.
 *
 * This shim installs a CommonJS resolution hook that maps the bare specifier
 * `typescript` to `@typescript/typescript6`, then hands off to ESLint's CLI. It
 * touches only this process: `tsc`, Next.js, and the editor keep using TypeScript 7.
 * Nothing under node_modules/ is modified, so it survives `npm install`.
 *
 * Remove this file, and the `lint` indirection in package.json, once
 * typescript-eslint supports TypeScript >= 7.1 natively.
 */
const Module = require('module');

const TS6 = '@typescript/typescript6';

// Fail loudly rather than silently linting with the wrong compiler.
try {
  const ts6 = require(TS6);
  if (!/^6\./.test(ts6.version)) {
    console.error(`[eslint-ts6] expected ${TS6} to be TypeScript 6.x, got ${ts6.version}`);
    process.exit(1);
  }
} catch {
  console.error(`[eslint-ts6] ${TS6} is not installed. Run: npm install --save-dev ${TS6}`);
  process.exit(1);
}

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  // Redirect both the bare specifier and deep subpaths. typescript-eslint reaches
  // for `typescript/lib/tsserverlibrary` as well as `typescript`, and TS 7's
  // `exports` map does not expose ./lib/* — so missing the subpath case produces
  // "Package subpath './lib/tsserverlibrary' is not defined by exports".
  // @typescript/typescript6 has no exports map, so its lib/* is reachable.
  if (request === 'typescript') {
    return originalResolve.call(this, TS6, ...rest);
  }
  if (request.startsWith('typescript/')) {
    return originalResolve.call(this, TS6 + request.slice('typescript'.length), ...rest);
  }
  return originalResolve.call(this, request, ...rest);
};

// ESLint 10 ships CommonJS, so requiring the CLI runs it against process.argv.
// Its `exports` map does not expose ./bin, so resolve the package root from its
// main entry and require the CLI by absolute path. `package.json`'s `lint` script
// passes no path argument, so ESLint's flat-config CLI falls back to its default
// of linting the current working directory — confirmed against ESLint 10's CLI docs.
const path = require('path');
const eslintRoot = path.resolve(path.dirname(require.resolve('eslint')), '..');
require(path.join(eslintRoot, 'bin', 'eslint.js'));
