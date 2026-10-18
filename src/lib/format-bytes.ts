/** A byte count in human units with binary steps: 512 B, 1.5 KiB, 50 MiB, 2.3 GiB. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  const text = value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
  return `${text} ${units[unit]}`;
}
