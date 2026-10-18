/** Limits the Settings page and its action share; client-safe (no Node imports). */
export const MAX_NAME_LENGTH = 100;
export const MAX_FOLDER_LENGTH = 1000;
/** Default total bytes one wiki may load (`WIKI_MAX_BYTES`): 50 MiB. The server's env schema and the CLI share it. */
export const DEFAULT_MAX_BYTES = 52_428_800;

/** The app's own port (US-278): the default, how many ports after it the launcher tries, and what a chosen port may be (not a privileged one). */
export const DEFAULT_APP_PORT = 4700;
export const APP_PORT_FALLBACKS = 9;
export const MIN_APP_PORT = 1024;
export const MAX_APP_PORT = 65535;
