/** The `--help` text. */
export function helpText(version: string): string {
  return `Wiki Renderer ${version}: read and edit Markdown wikis in your browser.

Usage:
  wiki-renderer [start] [--port <n>] [--no-open] [--verbose]
  wiki-renderer add <folder> [--id <id>]
  wiki-renderer remove <id>
  wiki-renderer list
  wiki-renderer --version | --help

Commands:
  start     Start the app on 127.0.0.1 and open it in your browser. This is the default.
  add       Add a wiki folder to the list. A relative folder starts from where you typed the command.
  remove    Take a wiki off the list. The folder on disk is not touched.
  list      Show the wikis: id, name and folder.

Options:
  --port <n>   Listen on port <n>. A port you choose is never moved.
  --no-open    Do not open the browser.
  --verbose    Show the server's own output.
  --id <id>    The wiki's id for add: lowercase letters, digits and dashes.
  --version    Print the version.
  --help       Print this text.

Port: 4700 by default; when it is taken the next free one up to 4709 is used and the app says so.
The order is --port, then WIKI_RENDERER_PORT, then "port" in config.json (also set in Settings, Server), then that default.

The list is kept in config.json in your user config folder. WIKI_RENDERER_CONFIG names another file.
When WIKI_DIRS is set it decides the list, and add and remove refuse.
Exit codes: 0 done, 1 refused or failed, 2 wrong usage.
`;
}
