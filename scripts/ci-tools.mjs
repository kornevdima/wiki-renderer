// Two steps of the release workflow that must work the same on every runner (US-278):
//   node scripts/ci-tools.mjs fetch-node <version> <platform> <arch> <destDir>   download + verify + unpack Node
//   node scripts/ci-tools.mjs unpack <archive> <destDir>                         unpack one of our archives
// `platform` is darwin | linux | win. fetch-node prints the unpacked Node folder.
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { extractArchive, fetchNodeChecked } from "./lib/node-dist.mjs";

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "fetch-node" && args.length === 4) {
    const [version, platform, arch, destDir] = args;
    console.log(await fetchNodeChecked({ version, platform, arch, destDir: path.resolve(destDir) }));
  } else if (command === "unpack" && args.length === 2) {
    const dest = path.resolve(args[1]);
    await mkdir(dest, { recursive: true });
    extractArchive(path.resolve(args[0]), dest);
  } else {
    throw new Error("Usage: ci-tools.mjs fetch-node <version> <platform> <arch> <destDir> | unpack <archive> <destDir>");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
