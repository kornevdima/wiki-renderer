// US-277 the Settings page adds, renames, reorders and removes wikis: verification contract rows R1-R8, R10, R11 and the R12
// screenshots (wiki/contracts/US-277-settings-page-contract.md). R9 and the validator kinds are unit tests. These run through
// playwright.config-file.config.ts (npm run build, then npm run test:e2e:config):
//   :3300 file source (WIKI_DIRS unset, WIKI_MAX_BYTES small)   :3301 WIKI_DIRS and WIKI_PRINT_FILE_TITLE set
// Every test starts by writing the server's temp config file directly (the app rechecks by mtime, WIKI_RECHECK_MS=0), so no test
// depends on another. Wiki folders the tests add are made under a temp folder; nothing is written into tests/fixtures and the
// real user config is never read or written.
import AxeBuilder from "@axe-core/playwright";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

import messages from "../../messages/en.json";

const FILE_URL = "http://127.0.0.1:3300";
const ENV_URL = "http://127.0.0.1:3301";
const CONFIG_DIR = process.env.E2E_CONFIG_DIR ?? path.join(os.tmpdir(), "wiki-renderer-e2e-us276");
const FILE_CONFIG = path.join(CONFIG_DIR, "file-source", "config.json");
const ENV_CONFIG = path.join(CONFIG_DIR, "env-override", "config.json");
const SMALL_MAX_BYTES = 2_000_000; // the same figure as playwright.config-file.config.ts gives :3300
const SAMPLE = path.resolve("tests/fixtures/sample-wiki");
const SECOND = path.resolve("tests/fixtures/second-wiki");
const SHOTS = process.env.E2E_SCREENSHOT_DIR; // R12: set to write the screenshots
const UNTITLED = "/guides/Untitled%20file%20name.md"; // no frontmatter title, no leading h1: the file name becomes the h1

const S = messages.settings;
let work = "";

interface Wiki {
  id: string;
  name: string;
  root: string;
}
interface Cfg {
  wikis: Wiki[];
  printFileTitle?: boolean;
  port?: number;
}

/** Three wikis, the first two read-only fixtures, the third a temp folder the remove test can prove is left alone. */
function threeWikis(): Wiki[] {
  return [
    { id: "esg-project", name: "ESG Project", root: SAMPLE },
    { id: "second-notes", name: "Second Notes", root: SECOND },
    { id: "third-wiki", name: "Third Wiki", root: path.join(work, "third-wiki") },
  ];
}

function writeConfig(file: string, content: Cfg | string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
}
const bytes = (file: string): string | null => (existsSync(file) ? readFileSync(file, "utf8") : null);
const readCfg = (file: string): Cfg => JSON.parse(readFileSync(file, "utf8")) as Cfg;
const ids = (file: string): string[] => readCfg(file).wikis.map((w) => w.id);

function makeFolder(...parts: string[]): string {
  const dir = path.join(...parts);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.md"), "# Notes\n\nHello.\n");
  return dir;
}

/** The English message for `settings.errors.<reason>` as a regex, its {placeholders} matching any word. Text comes from the source of truth, not a copy of it here. */
function errorPattern(reason: keyof typeof S.errors): RegExp {
  const template = S.errors[reason];
  const escaped = template.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{\w+\}/g, ".+?");
  return new RegExp(`^${escaped}$`);
}

async function open(page: Page, base: string, pathname = "/settings") {
  const res = await page.goto(`${base}${pathname}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("settings-table")).toBeVisible();
}
const row = (page: Page, id: string): Locator => page.locator(`[data-testid="wiki-row"][data-wiki-id="${id}"]`);
const rowIds = (page: Page) => page.getByTestId("wiki-row").evaluateAll((els) => els.map((el) => el.getAttribute("data-wiki-id")));

async function add(page: Page, folder: string) {
  await page.getByTestId("settings-add-input").fill(folder);
  await page.getByTestId("settings-add-button").click();
}

// @axe-core/playwright types its Page against its own playwright-core copy, which differs in two members from ours.
function axe(page: Page): AxeBuilder {
  return new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] });
}

/** Posts a server action as a client would, with any Host. Node's http, because a fetch client sets Host from the URL. */
function postAction(port: number, actionId: string, host: string | null, args: unknown[], extra: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(args);
    const headers: Record<string, string | number> = {
      "next-action": actionId,
      "content-type": "text/plain;charset=UTF-8",
      "content-length": Buffer.byteLength(payload),
      ...extra,
    };
    if (host !== null) headers.host = host;
    // `setHost: false` with no Host header sends no Host at all (HTTP/1.1 request without one).
    const req = http.request({ host: "127.0.0.1", port, path: "/settings", method: "POST", headers, setHost: false }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

/** The id Next gave the Settings action in this build: read off a real click's request. */
async function captureActionId(page: Page): Promise<string> {
  const seen = page.waitForRequest((r) => r.method() === "POST" && r.headers()["next-action"] !== undefined);
  await row(page, "second-notes").getByTestId("wiki-up").click();
  const id = (await seen).headers()["next-action"];
  if (!id) throw new Error("PRECONDITION MISSING: no Next-Action header on the move request");
  await expect.poll(() => ids(FILE_CONFIG)).toEqual(["second-notes", "esg-project", "third-wiki"]);
  writeConfig(FILE_CONFIG, { wikis: threeWikis() }); // put the order back
  return id;
}

/** Tabs until `target` has focus (max `limit` presses). */
async function tabTo(page: Page, target: Locator, limit = 40) {
  for (let i = 0; i < limit; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("not reachable by Tab");
}

test.describe("US-277 Settings page", () => {
  test.beforeAll(async ({ request }) => {
    // Guard: the servers come from playwright.config-file.config.ts. Fail fast, not as a fake app failure.
    for (const url of [FILE_URL, ENV_URL]) {
      const res = await request.get(`${url}/api/health`).catch(() => null);
      if (!res?.ok()) throw new Error(`PRECONDITION MISSING: server on ${url} (run with -c playwright.config-file.config.ts after npm run build)`);
    }
    work = mkdtempSync(path.join(os.tmpdir(), "us277-"));
    makeFolder(work, "third-wiki");
  });

  test.beforeEach(() => {
    writeConfig(FILE_CONFIG, { wikis: threeWikis() });
    rmSync(ENV_CONFIG, { force: true });
  });

  test.afterAll(() => {
    rmSync(work, { recursive: true, force: true });
    rmSync(FILE_CONFIG, { force: true });
    rmSync(ENV_CONFIG, { force: true });
  });

  for (const target of [
    { name: "home", path: "/" },
    { name: "reader", path: "/w/esg-project/index.md" },
  ]) {
    test(`R1: the settings menu on ${target.name} has a Settings item below Language that opens /settings`, async ({ page }) => {
      await page.goto(`${FILE_URL}${target.path}`);
      await page.getByTestId("settings-menu").click();
      const language = page.getByTestId("settings-language-en");
      const item = page.getByTestId("settings-link");
      await expect(language).toBeVisible();
      await expect(item).toBeVisible();
      const [l, i] = [await language.boundingBox(), await item.boundingBox()];
      if (!l || !i) throw new Error("PRECONDITION MISSING: menu rows have no box");
      expect(i.y).toBeGreaterThan(l.y + l.height - 1);
      await expect(item).toHaveAttribute("href", "/settings");
      await item.click();
      await expect(page).toHaveURL(`${FILE_URL}/settings`);
      await expect(page.getByTestId("settings-table")).toBeVisible();
      // The same top bar as home: the settings menu is there too.
      await expect(page.getByTestId("settings-menu")).toBeVisible();
    });
  }

  test("R2: add a folder by absolute path and by ~/ path: saved as typed with derived id and name, on home and Settings, no restart", async ({ page }) => {
    const absolute = makeFolder(work, "added-abs");
    // A `~/` path that reaches the temp folder with `..` segments, so nothing is made in the real home.
    const homeFolder = makeFolder(work, "notes-tilde");
    const tilde = `~/${path.relative(os.homedir(), homeFolder)}`;
    await open(page, FILE_URL);

    await add(page, absolute);
    await expect(row(page, "added-abs")).toBeVisible();
    await expect(page.getByTestId("settings-add-input")).toHaveValue("");
    await add(page, tilde);
    await expect(row(page, "notes-tilde")).toBeVisible();

    const saved = readCfg(FILE_CONFIG).wikis;
    expect(saved.map((w) => w.id)).toEqual(["esg-project", "second-notes", "third-wiki", "added-abs", "notes-tilde"]);
    expect(saved[3]).toEqual({ id: "added-abs", name: "Added Abs", root: absolute });
    expect(saved[4]).toEqual({ id: "notes-tilde", name: "Notes Tilde", root: tilde });
    expect(existsSync(homeFolder)).toBe(true);
    await expect(row(page, "notes-tilde").getByTestId("wiki-folder")).toHaveAttribute("title", tilde);

    await page.goto(`${FILE_URL}/`);
    await expect(page.locator('[data-testid="wiki-list"] a[href="/w/added-abs"]')).toBeVisible();
    await expect(page.locator('[data-testid="wiki-list"] a[href="/w/notes-tilde"]')).toBeVisible();
    expect((await page.request.get(`${FILE_URL}/w/notes-tilde`)).status()).toBe(200);
    await open(page, FILE_URL);
    expect(await rowIds(page)).toEqual(saved.map((w) => w.id));
  });

  test("R3: a folder that is not there is refused with the not-found reason and the file is untouched", async ({ page }) => {
    await open(page, FILE_URL);
    const before = bytes(FILE_CONFIG);
    await add(page, path.join(work, "no-such-folder"));
    const error = page.getByTestId("settings-add-error");
    await expect(error).toBeVisible();
    await expect(error).toHaveText(errorPattern("not_found"));
    expect(bytes(FILE_CONFIG)).toBe(before);
    await expect(page.getByTestId("wiki-row")).toHaveCount(3);
    // Typing again clears the error.
    await page.getByTestId("settings-add-input").fill(path.join(work, "no-such-folder-2"));
    await expect(error).toHaveCount(0);
  });

  test("R3: a folder already listed is refused with the already-listed reason (same path, trailing slash, a symlink to it) and the file is untouched", async ({ page }) => {
    const alias = path.join(work, "alias-to-second");
    symlinkSync(SECOND, alias);
    await open(page, FILE_URL);
    const before = bytes(FILE_CONFIG);
    for (const typed of [SECOND, `${SECOND}/`, alias]) {
      await add(page, typed);
      await expect(page.getByTestId("settings-add-error")).toHaveText(errorPattern("already_listed"));
      expect(bytes(FILE_CONFIG), typed).toBe(before);
    }
    await expect(page.getByTestId("wiki-row")).toHaveCount(3);
  });

  test("R3: a folder over WIKI_MAX_BYTES is refused with its size and the limit, and the file is untouched", async ({ page }) => {
    const big = makeFolder(work, "big-folder");
    writeFileSync(path.join(big, "huge.md"), "x".repeat(SMALL_MAX_BYTES + 500_000));
    await open(page, FILE_URL);
    const before = bytes(FILE_CONFIG);
    await add(page, big);
    const error = page.getByTestId("settings-add-error");
    await expect(error).toHaveText(errorPattern("too_large"));
    await expect(error).toHaveText(/\d/); // names the size and the limit as figures
    expect(bytes(FILE_CONFIG)).toBe(before);
  });

  test("R3: a file path and an unreadable folder are refused with their own reasons, the file untouched", async ({ page }) => {
    const aFile = path.join(work, "just-a-file.md");
    writeFileSync(aFile, "# not a folder");
    const locked = makeFolder(work, "locked");
    test.skip(process.getuid?.() === 0, "root can read a chmod 000 folder");
    chmodSync(locked, 0o000);
    try {
      await open(page, FILE_URL);
      const before = bytes(FILE_CONFIG);
      await add(page, aFile);
      await expect(page.getByTestId("settings-add-error")).toHaveText(errorPattern("not_a_folder"));
      await add(page, locked);
      await expect(page.getByTestId("settings-add-error")).toHaveText(errorPattern("unreadable"));
      await add(page, "relative/path");
      await expect(page.getByTestId("settings-add-error")).toHaveText(errorPattern("not_absolute"));
      expect(bytes(FILE_CONFIG)).toBe(before);
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  test("R4: up, down, rename and remove update the file and home follows; remove says the folder is not touched and leaves it", async ({ page }) => {
    await open(page, FILE_URL);
    const ORDER = ["esg-project", "second-notes", "third-wiki"];
    const homeOrder = async () => {
      await page.goto(`${FILE_URL}/`);
      const hrefs = await page.locator('[data-testid="wiki-list"] a').evaluateAll((els) => els.map((el) => el.getAttribute("href")));
      await open(page, FILE_URL);
      return hrefs;
    };

    // First row cannot go up, last cannot go down: disabled, not hidden.
    await expect(row(page, ORDER[0]!).getByTestId("wiki-up")).toBeDisabled();
    await expect(row(page, ORDER[2]!).getByTestId("wiki-down")).toBeDisabled();
    await expect(row(page, ORDER[1]!).getByTestId("wiki-up")).toBeEnabled();
    await expect(row(page, ORDER[1]!).getByTestId("wiki-down")).toBeEnabled();

    // Up (the control is named for the wiki).
    await page.getByRole("button", { name: S.wikis.moveUp.replace("{name}", "Second Notes") }).click();
    await expect.poll(() => ids(FILE_CONFIG)).toEqual(["second-notes", "esg-project", "third-wiki"]);
    await expect.poll(() => rowIds(page)).toEqual(["second-notes", "esg-project", "third-wiki"]);
    expect((await homeOrder()).map((h) => h?.replace("/w/", ""))).toEqual(["second-notes", "esg-project", "third-wiki"]);

    // Down.
    await page.getByRole("button", { name: S.wikis.moveDown.replace("{name}", "Second Notes") }).click();
    await expect.poll(() => ids(FILE_CONFIG)).toEqual(ORDER);
    await expect.poll(() => rowIds(page)).toEqual(ORDER);

    // Rename.
    await row(page, "second-notes").getByTestId("wiki-menu").click();
    await page.getByTestId("wiki-rename").click();
    await expect(page.getByTestId("rename-dialog")).toBeVisible();
    await expect(page.getByTestId("rename-input")).toHaveValue("Second Notes");
    await page.getByTestId("rename-input").fill("Renamed Wiki");
    await page.getByTestId("rename-save").click();
    await expect(page.getByTestId("rename-dialog")).toHaveCount(0);
    await expect.poll(() => readCfg(FILE_CONFIG).wikis.find((w) => w.id === "second-notes")?.name).toBe("Renamed Wiki");
    await expect(row(page, "second-notes")).toContainText("Renamed Wiki");
    expect(readCfg(FILE_CONFIG).wikis.map((w) => w.root)).toEqual(threeWikis().map((w) => w.root)); // only the name moved
    await page.goto(`${FILE_URL}/`);
    await expect(page.locator('[data-testid="wiki-list"] a[href="/w/second-notes"]')).toContainText("Renamed Wiki");
    await open(page, FILE_URL);

    // An empty name is refused and writes nothing.
    await row(page, "second-notes").getByTestId("wiki-menu").click();
    await page.getByTestId("wiki-rename").click();
    const before = bytes(FILE_CONFIG);
    await page.getByTestId("rename-input").fill("   ");
    await page.getByTestId("rename-save").click();
    await expect(page.getByTestId("rename-error")).toHaveText(errorPattern("name_empty"));
    expect(bytes(FILE_CONFIG)).toBe(before);
    await page.getByTestId("rename-cancel").click();
    await expect(page.getByTestId("rename-dialog")).toHaveCount(0);

    // Remove: the dialog says the folder is not touched; confirm; the folder stays.
    const third = path.join(work, "third-wiki");
    await row(page, "third-wiki").getByTestId("wiki-menu").click();
    await page.getByTestId("wiki-remove").click();
    const dialog = page.getByTestId("remove-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(S.removeDialog.text.replace("{name}", "Third Wiki")); // "... The folder on disk is not touched."
    await page.getByTestId("remove-confirm").click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => ids(FILE_CONFIG)).toEqual(["esg-project", "second-notes"]);
    await expect(row(page, "third-wiki")).toHaveCount(0);
    expect(existsSync(path.join(third, "index.md"))).toBe(true);
    expect((await homeOrder()).map((h) => h?.replace("/w/", ""))).toEqual(["esg-project", "second-notes"]);
  });

  test("R4: a rename or remove of a wiki that left the file meanwhile is refused as not listed and writes nothing", async ({ page }) => {
    await open(page, FILE_URL);
    await row(page, "third-wiki").getByTestId("wiki-menu").click();
    await page.getByTestId("wiki-remove").click();
    await expect(page.getByTestId("remove-dialog")).toBeVisible();
    writeConfig(FILE_CONFIG, { wikis: threeWikis().slice(0, 2) }); // removed on disk since the page loaded
    const before = bytes(FILE_CONFIG);
    await page.getByTestId("remove-confirm").click();
    await expect(page.getByTestId("remove-error")).toHaveText(errorPattern("not_listed"));
    expect(bytes(FILE_CONFIG)).toBe(before);
  });

  test("R5: the print switch saves on change and the next print follows it", async ({ page }) => {
    await open(page, FILE_URL);
    const sw = page.getByTestId("print-switch");
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("print-env-note")).toHaveCount(0);

    const h1 = page.locator("h1");
    const printed = async () => {
      await page.goto(`${FILE_URL}/w/esg-project${UNTITLED}`);
      await expect(page.getByTestId("reader-content")).toBeVisible();
      await page.emulateMedia({ media: "print" });
      const visible = await h1.isVisible();
      await page.emulateMedia({ media: "screen" });
      await expect(h1).toBeVisible(); // on screen the file-name heading is always there
      return visible;
    };

    expect(await printed()).toBe(false); // off: the file-name heading is left out of print
    await page.goto(`${FILE_URL}/settings`);
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => readCfg(FILE_CONFIG).printFileTitle).toBe(true);
    expect(readCfg(FILE_CONFIG).wikis).toEqual(threeWikis()); // the list is kept
    expect(await printed()).toBe(true); // on: it prints

    await page.goto(`${FILE_URL}/settings`);
    await expect(sw).toHaveAttribute("aria-checked", "true"); // the page shows what the file says
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await expect.poll(() => readCfg(FILE_CONFIG).printFileTitle).toBe(false);
    expect(await printed()).toBe(false);
    await expect(page.getByTestId("print-error")).toHaveCount(0);
  });

  test("R6: WIKI_DIRS set: the list is read-only with the notice, no Add field, arrows or row menu, and an action is refused with the file untouched", async ({ page }) => {
    writeConfig(ENV_CONFIG, { wikis: [{ id: "fileone", name: "File One", root: SAMPLE }] });
    const before = bytes(ENV_CONFIG);
    await open(page, ENV_URL);
    await expect(page.getByTestId("env-notice")).toBeVisible();
    await expect(page.getByTestId("wiki-row")).toHaveCount(1);
    await expect(row(page, "envwiki")).toBeVisible(); // WIKI_DIRS wins; the file's wiki is not shown
    for (const id of ["settings-add", "settings-add-input", "settings-add-button", "wiki-up", "wiki-down", "wiki-menu", "wiki-rename", "wiki-remove"]) {
      await expect(page.getByTestId(id), id).toHaveCount(0);
    }
    // The print switch shows the env value, disabled, with its note (WIKI_PRINT_FILE_TITLE=true on this server).
    await expect(page.getByTestId("print-switch")).toBeDisabled();
    await expect(page.getByTestId("print-switch")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("print-env-note")).toBeVisible();

    // Actions refuse even when called directly with a good Host: the action id comes from the file-source server (same build).
    await open(page, FILE_URL);
    const actionId = await captureActionId(page);
    const attempts: unknown[][] = [
      [{ kind: "add", folder: SECOND }],
      [{ kind: "remove", id: "envwiki" }],
      [{ kind: "rename", id: "envwiki", name: "Hijacked" }],
      [{ kind: "printFileTitle", value: false }],
    ];
    for (const args of attempts) {
      const res = await postAction(3301, actionId, "127.0.0.1:3301", args);
      expect(res.status).toBe(200);
      expect(res.body, JSON.stringify(args)).toContain('"reason":"managed_by_env"');
      expect(res.body).not.toContain('"ok":true');
    }
    expect(bytes(ENV_CONFIG)).toBe(before);
  });

  test("R7: an action called with a forged Host is refused and writes nothing; the same call with the real Host works", async ({ page }) => {
    // Method: the action id is read off a real click's request, then the action is POSTed with node:http so the Host header can
    // be set. Next's own Origin check passes when no Origin is sent; the app's Host check is what refuses.
    await open(page, FILE_URL);
    const actionId = await captureActionId(page);
    const folder = makeFolder(work, "forged-target");
    const before = bytes(FILE_CONFIG);

    for (const host of ["evil.example:3300", "evil.example", "127.0.0.1:9999", "localhost:9999", "127.0.0.1.evil.example:3300", "localhost.:3300", "127.0.0.1.:3300"]) {
      const res = await postAction(3300, actionId, host, [{ kind: "add", folder }]);
      expect(res.body, host).toContain('"reason":"forbidden_host"');
      expect(res.body, host).not.toContain('"ok":true');
      expect(bytes(FILE_CONFIG), host).toBe(before);
    }
    // Other change kinds are checked first by Host too.
    for (const args of [[{ kind: "remove", id: "third-wiki" }], [{ kind: "printFileTitle", value: true }], [{ kind: "move", id: "third-wiki", direction: "up" }]]) {
      const res = await postAction(3300, actionId, "evil.example:3300", args);
      expect(res.body, JSON.stringify(args)).toContain('"reason":"forbidden_host"');
      expect(bytes(FILE_CONFIG)).toBe(before);
    }
    // Control: the method works. Same call, real Host (127.0.0.1 and localhost on the app's port): written.
    const ok = await postAction(3300, actionId, "127.0.0.1:3300", [{ kind: "add", folder }]);
    expect(ok.body).toContain('"ok":true');
    await expect.poll(() => ids(FILE_CONFIG)).toEqual(["esg-project", "second-notes", "third-wiki", "forged-target"]);
    const viaName = await postAction(3300, actionId, "localhost:3300", [{ kind: "remove", id: "forged-target" }]);
    expect(viaName.body).toContain('"ok":true');
    await expect.poll(() => ids(FILE_CONFIG)).toEqual(["esg-project", "second-notes", "third-wiki"]);
  });

  test("R7: a request with no Host header is refused and writes nothing", async ({ page }) => {
    await open(page, FILE_URL);
    const actionId = await captureActionId(page);
    const folder = makeFolder(work, "no-host-target");
    const before = bytes(FILE_CONFIG);
    const res = await postAction(3300, actionId, null, [{ kind: "add", folder }]).catch(() => ({ status: 0, body: "" })); // the server may also drop the connection
    expect(res.body).not.toContain('"ok":true');
    if (res.status === 200) expect(res.body).toContain('"reason":"forbidden_host"');
    expect(bytes(FILE_CONFIG)).toBe(before);
  });

  test("R7: X-Forwarded-Host is ignored: a good Host with a forged forwarded host still works (the control)", async ({ page }) => {
    await open(page, FILE_URL);
    const actionId = await captureActionId(page);
    const folder = makeFolder(work, "forwarded-target");
    const res = await postAction(3300, actionId, "127.0.0.1:3300", [{ kind: "add", folder }], { "x-forwarded-host": "evil.example" });
    expect(res.body).toContain('"ok":true');
    await expect.poll(() => ids(FILE_CONFIG)).toEqual(["esg-project", "second-notes", "third-wiki", "forwarded-target"]);
    // And the reverse: a forged Host is not rescued by a good X-Forwarded-Host.
    const before = bytes(FILE_CONFIG);
    const other = makeFolder(work, "forwarded-other");
    const refused = await postAction(3300, actionId, "evil.example:3300", [{ kind: "add", folder: other }], { "x-forwarded-host": "127.0.0.1:3300" });
    expect(refused.body).toContain('"reason":"forbidden_host"');
    expect(bytes(FILE_CONFIG)).toBe(before);
  });

  test("R4: a Move on a stale page (the wiki left the file meanwhile) shows its refusal in settings-move-error and writes nothing", async ({ page }) => {
    await open(page, FILE_URL);
    writeConfig(FILE_CONFIG, { wikis: threeWikis().filter((w) => w.id !== "second-notes") }); // removed on disk since the page loaded
    const before = bytes(FILE_CONFIG);
    await expect(page.getByTestId("settings-move-error")).toHaveCount(0);
    await row(page, "second-notes").getByTestId("wiki-down").click();
    await expect(page.getByTestId("settings-move-error")).toHaveText(errorPattern("not_listed"));
    expect(bytes(FILE_CONFIG)).toBe(before);
  });

  test("R9: an add while the file changed on disk after the page loaded keeps the other change (re-read before write)", async ({ page }) => {
    const onDisk = makeFolder(work, "disk-added");
    const typed = makeFolder(work, "ui-added");
    await open(page, FILE_URL);
    writeConfig(FILE_CONFIG, { printFileTitle: true, wikis: [...threeWikis(), { id: "disk-added", name: "Disk Added", root: onDisk }] }); // edited by hand after load
    await add(page, typed);
    await expect(row(page, "ui-added")).toBeVisible();
    const saved = readCfg(FILE_CONFIG);
    expect(saved.wikis.map((w) => w.id)).toEqual(["esg-project", "second-notes", "third-wiki", "disk-added", "ui-added"]);
    expect(saved.printFileTitle).toBe(true);
    await expect(row(page, "disk-added")).toBeVisible(); // the page now shows the file as it is
  });

  test("R11: at 375 x 667 the empty list shows its empty row, no table scroll and no phantom column", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    writeConfig(FILE_CONFIG, { wikis: [] });
    await open(page, FILE_URL);
    const table = page.getByTestId("settings-table");
    const cell = table.locator("tbody td:visible");
    await expect(cell).toHaveCount(1);
    await expect(cell).toBeVisible();
    const m = await table.evaluate((el) => {
      const td = Array.from(el.querySelectorAll("tbody td")).find((c) => (c as HTMLElement).offsetParent !== null) as HTMLElement;
      return { cell: td.getBoundingClientRect().width, table: el.getBoundingClientRect().width, scroll: el.scrollWidth, client: el.parentElement!.clientWidth, wrapperScroll: el.parentElement!.scrollWidth };
    });
    expect(Math.abs(m.cell - m.table), "the empty cell spans the table").toBeLessThanOrEqual(1);
    expect(m.wrapperScroll).toBeLessThanOrEqual(m.client);
    expect(m.scroll).toBeLessThanOrEqual(m.client);
    const page_ = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    expect(page_.s).toBeLessThanOrEqual(page_.c);
  });

  test("R8: with no config file the home empty state links to Settings, which opens", async ({ page }) => {
    rmSync(FILE_CONFIG, { force: true });
    await page.goto(`${FILE_URL}/`);
    await expect(page.getByTestId("no-wikis")).toBeVisible();
    await page.getByTestId("open-settings").click();
    await expect(page).toHaveURL(`${FILE_URL}/settings`);
    await expect(page.getByTestId("settings-add")).toBeVisible();
    await expect(page.getByTestId("wiki-row")).toHaveCount(0);
    // Adding the first wiki from here creates the file; one wiki makes `/` redirect to it.
    const folder = makeFolder(work, "first-wiki");
    await add(page, folder);
    await expect(row(page, "first-wiki")).toBeVisible();
    expect(ids(FILE_CONFIG)).toEqual(["first-wiki"]);
    const res = await page.request.get(`${FILE_URL}/`, { maxRedirects: 0 });
    expect(res.headers()["location"]).toContain("/w/first-wiki");
  });

  test("R10: axe finds nothing serious on /settings, file-source and env-managed", async ({ page }) => {
    const serious = async () =>
      (await axe(page).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
    for (const scheme of ["light", "dark"] as const) {
      await page.context().addCookies([{ name: "theme", value: scheme, url: FILE_URL }, { name: "theme", value: scheme, url: ENV_URL }]);
      await open(page, FILE_URL);
      expect(await serious(), `file source, ${scheme}`).toEqual([]);
      await add(page, path.join(work, "no-such-folder")); // the error state
      await expect(page.getByTestId("settings-add-error")).toBeVisible();
      expect(await serious(), `add error, ${scheme}`).toEqual([]);
      await open(page, ENV_URL);
      expect(await serious(), `env managed, ${scheme}`).toEqual([]);
    }
    // And with the dialogs open.
    await open(page, FILE_URL);
    await row(page, "esg-project").getByTestId("wiki-menu").click();
    await page.getByTestId("wiki-rename").click();
    await expect(page.getByTestId("rename-dialog")).toBeVisible();
    expect(await serious(), "rename dialog").toEqual([]);
    await page.getByTestId("rename-cancel").click();
    await row(page, "esg-project").getByTestId("wiki-menu").click();
    await page.getByTestId("wiki-remove").click();
    await expect(page.getByTestId("remove-dialog")).toBeVisible();
    expect(await serious(), "remove dialog").toEqual([]);
  });

  test("R10: every control is reachable by Tab and the arrows and menu buttons are named for their wiki", async ({ page }) => {
    await open(page, FILE_URL);
    const stops = new Set<string>();
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press("Tab");
      stops.add(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return el?.getAttribute("data-testid") === "wiki-menu" || el?.getAttribute("data-testid")?.startsWith("wiki-") ? (el.getAttribute("aria-label") ?? "") : (el?.getAttribute("data-testid") ?? el?.tagName ?? "");
        }),
      );
    }
    const name = (key: "moveUp" | "moveDown" | "rowMenu", wiki: string) => S.wikis[key].replace("{name}", wiki);
    for (const expected of [
      "settings-add-input",
      "settings-add-button",
      name("moveDown", "ESG Project"),
      name("rowMenu", "ESG Project"),
      name("moveUp", "Second Notes"),
      name("moveDown", "Second Notes"),
      name("rowMenu", "Third Wiki"),
      name("moveUp", "Third Wiki"),
      "print-switch",
    ]) {
      expect(stops.has(expected), `Tab reaches ${expected}`).toBe(true);
    }
    // The disabled ends are skipped by Tab, not trapped on.
    expect(stops.has(name("moveUp", "ESG Project"))).toBe(false);
    expect(stops.has(name("moveDown", "Third Wiki"))).toBe(false);
  });

  test("R10: a keyboard pass through add, rename and remove completes, and the dialogs trap Tab", async ({ page }) => {
    const folder = makeFolder(work, "keys-wiki");
    await open(page, FILE_URL);
    const hasFocusInside = (sel: string) => page.evaluate((s) => !!document.activeElement?.closest(s), sel);

    // Add: Tab to the field, type, Enter.
    await tabTo(page, page.getByTestId("settings-add-input"));
    await page.keyboard.type(folder);
    await page.keyboard.press("Enter");
    await expect(row(page, "keys-wiki")).toBeVisible();
    await expect.poll(() => ids(FILE_CONFIG)).toContain("keys-wiki");

    const menu = row(page, "keys-wiki").getByTestId("wiki-menu");
    // Rename: Tab to the row's menu, Enter opens it, Enter picks Rename.
    await tabTo(page, menu);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByTestId("wiki-rename")).toBeFocused(); // a keyboard open lands on the first item
    await page.keyboard.press("Enter"); // Rename
    const rename = page.getByTestId("rename-dialog");
    await expect(rename).toBeVisible();
    await expect.poll(() => hasFocusInside('[data-testid="rename-dialog"]')).toBe(true); // focus moved into the dialog
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      expect(await hasFocusInside('[data-testid="rename-dialog"]'), `Tab ${i} stays in the rename dialog`).toBe(true);
    }
    await page.getByTestId("rename-input").focus();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Keys Renamed");
    await page.keyboard.press("Enter");
    await expect(rename).toHaveCount(0);
    await expect.poll(() => readCfg(FILE_CONFIG).wikis.find((w) => w.id === "keys-wiki")?.name).toBe("Keys Renamed");

    // Remove: open from the menu with the keyboard; Tab stays in the dialog; Escape cancels; then confirm with the keyboard.
    const remove = page.getByTestId("remove-dialog");
    const openRemove = async () => {
      await tabTo(page, menu);
      await page.keyboard.press("Enter");
      await expect(page.getByRole("menu")).toBeVisible();
      await expect(page.getByTestId("wiki-rename")).toBeFocused();
      await page.keyboard.press("ArrowDown"); // Remove
      await expect(page.getByTestId("wiki-remove")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(remove).toBeVisible();
    };
    await openRemove();
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      expect(await hasFocusInside('[data-testid="remove-dialog"]'), `Tab ${i} stays in the remove dialog`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(remove).toHaveCount(0);
    expect(ids(FILE_CONFIG)).toContain("keys-wiki"); // cancelled: still listed

    await openRemove();
    await tabTo(page, page.getByTestId("remove-confirm"));
    await page.keyboard.press("Enter");
    await expect(remove).toHaveCount(0);
    await expect.poll(() => ids(FILE_CONFIG)).not.toContain("keys-wiki");
    expect(existsSync(folder)).toBe(true);
  });

  test("R10: after rename and after a cancelled remove the page still takes clicks (no pointer-events: none left on the body)", async ({ page }) => {
    await open(page, FILE_URL);
    const body = () => page.evaluate(() => getComputedStyle(document.body).pointerEvents);
    const menu = row(page, "second-notes").getByTestId("wiki-menu");

    await menu.click();
    await page.getByTestId("wiki-rename").click();
    await page.getByTestId("rename-input").fill("Second Renamed");
    await page.getByTestId("rename-save").click();
    await expect(page.getByTestId("rename-dialog")).toHaveCount(0);
    await expect.poll(() => readCfg(FILE_CONFIG).wikis[1]?.name).toBe("Second Renamed");
    await expect.poll(body).not.toBe("none");
    await page.getByTestId("settings-add-input").click(); // a plain click lands
    await expect(page.getByTestId("settings-add-input")).toBeFocused();

    await menu.click();
    await page.getByTestId("wiki-remove").click();
    await expect(page.getByTestId("remove-dialog")).toBeVisible();
    await page.getByTestId("remove-cancel").click();
    await expect(page.getByTestId("remove-dialog")).toHaveCount(0);
    await expect.poll(body).not.toBe("none");
    expect(ids(FILE_CONFIG)).toContain("second-notes");
    await page.getByTestId("settings-add-input").click();
    await expect(page.getByTestId("settings-add-input")).toBeFocused();
    // The page's own controls still act after the dialogs.
    await row(page, "second-notes").getByTestId("wiki-up").click();
    await expect.poll(() => ids(FILE_CONFIG)).toEqual(["second-notes", "esg-project", "third-wiki"]);
  });

  test("R10: a dialog closed by Save, Cancel, Escape or Remove-cancel returns focus to the row's menu button", async ({ page }) => {
    await open(page, FILE_URL);
    const menu = row(page, "second-notes").getByTestId("wiki-menu");
    const closers: Array<[string, string, (p: Page) => Promise<void>]> = [
      ["wiki-rename", "rename-dialog", (p) => p.getByTestId("rename-cancel").click()],
      ["wiki-rename", "rename-dialog", (p) => p.keyboard.press("Escape")],
      ["wiki-rename", "rename-dialog", async (p) => {
        await p.getByTestId("rename-input").fill("Focus Check");
        await p.getByTestId("rename-save").click();
      }],
      ["wiki-remove", "remove-dialog", (p) => p.getByTestId("remove-cancel").click()],
      ["wiki-remove", "remove-dialog", (p) => p.keyboard.press("Escape")],
    ];
    for (const [item, dialog, close] of closers) {
      await menu.click();
      await page.getByTestId(item).click();
      await expect(page.getByTestId(dialog)).toBeVisible();
      await close(page);
      await expect(page.getByTestId(dialog), `${dialog} closes`).toHaveCount(0);
      await expect(menu, `focus returns to the menu button after ${dialog}`).toBeFocused();
    }
  });

  test("R10: after a confirmed Remove focus lands on the next row's menu button, else the previous one's, else the add input", async ({ page }) => {
    await open(page, FILE_URL);
    const menuOf = (id: string) => row(page, id).getByTestId("wiki-menu");
    const removeRow = async (id: string) => {
      await menuOf(id).click();
      await page.getByTestId("wiki-remove").click();
      await expect(page.getByTestId("remove-dialog")).toBeVisible();
      await page.getByTestId("remove-confirm").click();
      await expect(page.getByTestId("remove-dialog")).toHaveCount(0);
      await expect(row(page, id)).toHaveCount(0);
    };
    await removeRow("second-notes"); // middle: the next row
    await expect(menuOf("third-wiki")).toBeFocused();
    await removeRow("third-wiki"); // last: the previous row
    await expect(menuOf("esg-project")).toBeFocused();
    await removeRow("esg-project"); // only row: the add field
    await expect(page.getByTestId("settings-add-input")).toBeFocused();
    expect(ids(FILE_CONFIG)).toEqual([]);
  });

  test("R11: at 375 x 667 /settings does not scroll sideways, the Folder column is a secondary line with the full path in a title, file-source and env-managed", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const long = makeFolder(work, "a-very-long-folder-name-that-would-push-the-table-wider-than-a-phone-screen-if-it-could", "and-another-long-level-below-it");
    writeConfig(FILE_CONFIG, { wikis: [...threeWikis(), { id: "long-one", name: "A wiki with a rather long display name too", root: long }] });
    const fit = () => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    for (const base of [FILE_URL, ENV_URL]) {
      await open(page, base);
      const fits = await fit();
      expect(fits.scroll, base).toBeLessThanOrEqual(fits.client);
    }
    await open(page, FILE_URL);
    await expect(row(page, "long-one").locator(`[title="${long}"]:visible`)).toHaveCount(1); // the full path in a title
    await expect(row(page, "long-one").getByTestId("wiki-folder")).toBeHidden(); // the Folder column is gone below sm
    await row(page, "long-one").getByTestId("wiki-menu").click();
    await page.getByTestId("wiki-remove").click();
    await expect(page.getByTestId("remove-dialog")).toBeVisible();
    const dialog = await fit();
    expect(dialog.scroll).toBeLessThanOrEqual(dialog.client);
    await page.getByTestId("remove-cancel").click();
    await add(page, path.join(work, "no-such-folder")); // the error state fits too
    await expect(page.getByTestId("settings-add-error")).toBeVisible();
    const withError = await fit();
    expect(withError.scroll).toBeLessThanOrEqual(withError.client);
  });

  // US-278 R13: the Server section's Port field writes `port` to the config file (the launcher reads it at the next start).
  test("R13: a port typed in Settings is saved to the file with the Saved status; an emptied field removes it; the other keys stay", async ({ page }) => {
    await open(page, FILE_URL);
    const input = page.getByTestId("settings-port");
    await expect(input).toHaveValue("");
    await input.fill("4711");
    await page.getByTestId("settings-port-save").click();
    await expect(page.getByTestId("settings-port-status")).toHaveText(messages.settings.server.saved);
    await expect.poll(() => readCfg(FILE_CONFIG).port).toBe(4711);
    expect(ids(FILE_CONFIG)).toEqual(["esg-project", "second-notes", "third-wiki"]);
    await page.reload();
    await expect(page.getByTestId("settings-port")).toHaveValue("4711"); // the saved value is what the page loads with

    await page.getByTestId("settings-port").fill("");
    await page.getByTestId("settings-port-save").click();
    await expect(page.getByTestId("settings-port-status")).toHaveText(messages.settings.server.saved);
    await expect.poll(() => "port" in readCfg(FILE_CONFIG)).toBe(false);
    expect(ids(FILE_CONFIG)).toEqual(["esg-project", "second-notes", "third-wiki"]);
  });

  test("R13: 80, 70000 and abc show the port error and leave the file byte for byte unchanged", async ({ page }) => {
    writeConfig(FILE_CONFIG, { wikis: threeWikis(), port: 4720 });
    const before = bytes(FILE_CONFIG);
    await open(page, FILE_URL);
    await expect(page.getByTestId("settings-port")).toHaveValue("4720");
    for (const value of ["80", "70000", "abc", "1023", "4700.5"]) {
      await page.getByTestId("settings-port").fill(value);
      await page.getByTestId("settings-port-save").click();
      await expect(page.getByTestId("settings-port-error"), value).toBeVisible();
      await expect(page.getByTestId("settings-port-status"), value).toHaveText("");
      expect(bytes(FILE_CONFIG), value).toBe(before);
    }
    await page.getByTestId("settings-port").fill("4721"); // typing again clears the error; a valid value then saves
    await expect(page.getByTestId("settings-port-error")).toHaveCount(0);
    await page.getByTestId("settings-port-save").click();
    await expect.poll(() => readCfg(FILE_CONFIG).port).toBe(4721);
  });

  test("R13: with WIKI_DIRS managing the list the Port field is still editable and saves to the config file", async ({ page }) => {
    await open(page, ENV_URL);
    await expect(page.getByTestId("settings-add-input")).toHaveCount(0); // control: the wiki list is read-only here
    const input = page.getByTestId("settings-port");
    await expect(input).toBeEnabled();
    await expect(page.getByTestId("settings-port-save")).toBeEnabled();
    await input.fill("4733");
    await page.getByTestId("settings-port-save").click();
    await expect(page.getByTestId("settings-port-status")).toHaveText(messages.settings.server.saved);
    await expect.poll(() => (existsSync(ENV_CONFIG) ? readCfg(ENV_CONFIG).port : undefined)).toBe(4733);
    await page.reload();
    await expect(page.getByTestId("settings-port")).toHaveValue("4733");
  });

  test("R13: a port change called with a forged Host is refused and writes nothing; the same call with the real Host works", async ({ page }) => {
    await open(page, FILE_URL);
    const actionId = await captureActionId(page);
    const before = bytes(FILE_CONFIG);
    for (const host of ["evil.example:3300", "127.0.0.1:9999", "localhost:9999", "127.0.0.1.evil.example:3300"]) {
      const res = await postAction(3300, actionId, host, [{ kind: "port", value: 4799 }]);
      expect(res.body, host).toContain('"reason":"forbidden_host"');
      expect(bytes(FILE_CONFIG), host).toBe(before);
    }
    const none = await postAction(3300, actionId, null, [{ kind: "port", value: 4799 }]).catch(() => ({ status: 0, body: "" })); // the server may drop a request with no Host
    expect(none.body).not.toContain('"ok":true');
    if (none.status === 200) expect(none.body).toContain('"reason":"forbidden_host"');
    expect(bytes(FILE_CONFIG)).toBe(before);
    const ok = await postAction(3300, actionId, "127.0.0.1:3300", [{ kind: "port", value: 4799 }]);
    expect(ok.body).toContain('"ok":true'); // control: the method works
    await expect.poll(() => readCfg(FILE_CONFIG).port).toBe(4799);
    // The server-side range check holds without the form: 80 is refused even with the real Host.
    const low = await postAction(3300, actionId, "127.0.0.1:3300", [{ kind: "port", value: 80 }]);
    expect(low.body).not.toContain('"ok":true');
    expect(readCfg(FILE_CONFIG).port).toBe(4799);
  });

  // US-278 R6 / R12: the Settings footer shows "Wiki Renderer {version}" and the version is the one in package.json (what `wiki-renderer --version` prints).
  for (const size of [
    { name: "1440", width: 1440, height: 900 },
    { name: "375", width: 375, height: 667 },
  ]) {
    test(`US-278 R6: at ${size.name} px /settings ends with the version footer from package.json and does not scroll sideways, file-source and env-managed`, async ({ page }) => {
      const { version } = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as { version?: string };
      if (!version) throw new Error("PRECONDITION MISSING: a version in package.json");
      await page.setViewportSize({ width: size.width, height: size.height });
      for (const base of [FILE_URL, ENV_URL]) {
        await open(page, base);
        const footer = page.getByTestId("settings-version");
        await expect(footer).toHaveCount(1);
        await expect(footer).toHaveText(messages.settings.version.replace("{version}", version));
        await footer.scrollIntoViewIfNeeded();
        await expect(footer).toBeInViewport();
        const box = await footer.boundingBox();
        expect(box && box.x >= 0 && box.x + box.width <= size.width, base).toBe(true);
        const fits = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
        expect(fits.scroll, base).toBeLessThanOrEqual(fits.client);
      }
    });
  }

  test("R11: at 375 x 667 the row menu is in the viewport, Move up and down live in it, and name and folder show without a table scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await open(page, FILE_URL);
    const inside = async (loc: Locator, label: string) => {
      const box = await loc.boundingBox();
      expect(box, label).not.toBeNull();
      expect(box!.x, `${label} starts inside the viewport`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${label} ends inside the viewport`).toBeLessThanOrEqual(375);
    };
    const first = row(page, "esg-project");
    await inside(first.getByTestId("wiki-menu"), "wiki-menu");
    await expect(first.getByTestId("wiki-up")).toBeHidden();
    await expect(first.getByTestId("wiki-down")).toBeHidden();

    // Name and folder (as a secondary line, full path in its title) are visible and inside the viewport.
    await inside(first.getByText("ESG Project"), "name");
    const folder = first.locator(`[title="${SAMPLE}"]:visible`);
    await expect(folder).toHaveCount(1);
    await inside(folder, "folder line");

    // No horizontal scroll on the table's wrapper or the page.
    const wrap = await page.getByTestId("settings-table").evaluate((el) => {
      const box = el.parentElement!;
      return { table: el.scrollWidth, wrapper: box.scrollWidth, client: box.clientWidth };
    });
    expect(wrap.wrapper).toBeLessThanOrEqual(wrap.client);
    expect(wrap.table).toBeLessThanOrEqual(wrap.client);

    // The menu: Move up and Move down are items, named for the wiki, inside the viewport; disabled at the ends.
    await first.getByTestId("wiki-menu").click();
    const up = page.getByTestId("wiki-move-up");
    const down = page.getByTestId("wiki-move-down");
    await expect(up).toBeVisible();
    await expect(down).toBeVisible();
    await expect(up).toHaveAccessibleName(S.wikis.moveUp.replace("{name}", "ESG Project"));
    await expect(down).toHaveAccessibleName(S.wikis.moveDown.replace("{name}", "ESG Project"));
    await inside(up, "wiki-move-up");
    await inside(down, "wiki-move-down");
    await expect(up).toHaveAttribute("aria-disabled", "true"); // first row: no Move up
    await expect(down).not.toHaveAttribute("aria-disabled", "true");
    await down.click();
    await expect.poll(() => ids(FILE_CONFIG)).toEqual(["second-notes", "esg-project", "third-wiki"]);
    await expect.poll(() => rowIds(page)).toEqual(["second-notes", "esg-project", "third-wiki"]);

    // The last row: Move down is disabled.
    await row(page, "third-wiki").getByTestId("wiki-menu").click();
    await expect(page.getByTestId("wiki-move-down")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("wiki-move-up")).not.toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
  });

  test("R11: at 1440 a long folder path is shown whole (no ellipsis) and the row controls are visible", async ({ page }) => {
    // Seeded roots need not exist: Settings lists the file as written. Realistic long paths, 36 and 47 characters.
    const roots = ["/srv/wikis/engineering-handbook/docs", "/home/someone/projects/client-engagements/notes"];
    writeConfig(FILE_CONFIG, { wikis: roots.map((root, i) => ({ id: `long-${i}`, name: `Long ${i}`, root })) });
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, FILE_URL);
    for (const [i, root] of roots.entries()) {
      const r = row(page, `long-${i}`);
      const folder = r.getByTestId("wiki-folder");
      await expect(folder).toBeVisible();
      await expect(folder).toHaveText(root);
      const clipped = await folder.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(clipped, `${root} is not cut with an ellipsis`).toBe(false);
      for (const id of ["wiki-up", "wiki-down", "wiki-menu"]) {
        const box = await r.getByTestId(id).boundingBox();
        expect(box, id).not.toBeNull();
        expect(box!.x + box!.width, `${id} inside the viewport`).toBeLessThanOrEqual(1440);
      }
      await expect(r.getByTestId("wiki-move-up")).toHaveCount(0); // the menu's arrow items only render when the menu is open
    }
    const wrap = await page.getByTestId("settings-table").evaluate((el) => ({ w: el.parentElement!.scrollWidth, c: el.parentElement!.clientWidth }));
    expect(wrap.w).toBeLessThanOrEqual(wrap.c);
  });

  test("R12: screenshots of /settings, the add error, the remove dialog and the env-managed state, 1440 and 375, light and dark", async ({ browser }) => {
    test.skip(!SHOTS, "set E2E_SCREENSHOT_DIR to write the R12 screenshots");
    mkdirSync(SHOTS!, { recursive: true });
    const sizes = [
      { name: "1440", width: 1440, height: 900 },
      { name: "375", width: 375, height: 667 },
    ];
    const settle = (page: Page) => expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    for (const size of sizes) {
      for (const scheme of ["light", "dark"] as const) {
        const context: BrowserContext = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: scheme });
        for (const url of [FILE_URL, ENV_URL]) await context.addCookies([{ name: "theme", value: scheme, url }]);
        const page = await context.newPage();
        const shot = async (state: string) => {
          await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
          await settle(page);
          await page.screenshot({ path: path.join(SHOTS!, `us277-${state}-${size.name}-${scheme}.png`), fullPage: state !== "remove-dialog" && state !== "row-menu" });
        };
        writeConfig(FILE_CONFIG, { wikis: threeWikis() });
        await open(page, FILE_URL);
        await shot("settings");
        await add(page, path.join(work, "no-such-folder"));
        await expect(page.getByTestId("settings-add-error")).toBeVisible();
        await shot("add-error");
        await open(page, FILE_URL);
        await row(page, "second-notes").getByTestId("wiki-menu").click();
        await page.getByTestId("wiki-remove").click();
        await expect(page.getByTestId("remove-dialog")).toBeVisible();
        await shot("remove-dialog");
        if (size.name === "375") {
          await open(page, FILE_URL);
          await row(page, "second-notes").getByTestId("wiki-menu").click();
          await expect(page.getByTestId("wiki-move-up")).toBeVisible();
          await shot("row-menu");
        }
        await open(page, ENV_URL);
        await expect(page.getByTestId("env-notice")).toBeVisible();
        await shot("env");
        await context.close();
      }
    }
  });
});
