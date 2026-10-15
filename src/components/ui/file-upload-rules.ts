export interface FileLike {
  name: string
  size: number
  /** The MIME type; may be "" when the browser does not know it (common for .csv on Windows). */
  type: string
}

export type FileRejectReason = "type" | "size"

export interface FileRule {
  /** The input's `accept` list: extensions (".csv"), MIME types ("text/csv") and wildcards ("image/*"), comma-separated. */
  accept?: string
  /** The size limit in bytes. */
  maxSize?: number
}

/** The `accept` list as lower-cased tokens. */
export function parseAccept(accept: string | undefined): string[] {
  return (accept ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
}

/** Does the file match the `accept` list? An empty list accepts everything, as the native input does. */
export function matchesAccept(file: Pick<FileLike, "name" | "type">, accept: string | undefined): boolean {
  const tokens = parseAccept(accept)
  if (tokens.length === 0) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token)
    if (token.endsWith("/*")) return type !== "" && type.startsWith(token.slice(0, -1))
    return type === token
  })
}

/** Why a file is refused, or null when it may be uploaded. The type is checked before the size. */
export function validateFile(file: FileLike, rule: FileRule): FileRejectReason | null {
  if (!matchesAccept(file, rule.accept)) return "type"
  if (rule.maxSize !== undefined && file.size > rule.maxSize) return "size"
  return null
}

/** Split picked or dropped files into the ones to upload and the ones refused, with the reason. */
export function partitionFiles<F extends FileLike>(files: readonly F[], rule: FileRule): { accepted: F[]; rejected: { file: F; reason: FileRejectReason }[] } {
  const accepted: F[] = []
  const rejected: { file: F; reason: FileRejectReason }[] = []
  for (const file of files) {
    const reason = validateFile(file, rule)
    if (reason) rejected.push({ file, reason })
    else accepted.push(file)
  }
  return { accepted, rejected }
}

const KB = 1024
const MB = KB * 1024
const GB = MB * 1024

/**
 * A size as the spec writes it: "340 KB", "1.9 MB", "14.2 MB", "820 B". Binary units (1 KB = 1024 B), KB as a whole number,
 * MB and GB to one decimal. `locale` sets the decimal separator.
 */
export function formatBytes(bytes: number, locale = "en"): string {
  const n = Math.max(0, bytes)
  const one = (value: number) => value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (n < KB) return `${Math.round(n)} B`
  if (n < MB) {
    const kb = Math.round(n / KB)
    return kb >= 1024 ? `${one(n / MB)} MB` : `${kb} KB`
  }
  if (n < GB) {
    const mb = Math.round((n / MB) * 10) / 10
    return mb >= 1024 ? `${one(n / GB)} GB` : `${one(mb)} MB`
  }
  return `${one(n / GB)} GB`
}

/** The upload's progress as a whole percentage, 0 to 100 (0 when the total is unknown). */
export function uploadPercent(loaded: number, total: number): number {
  if (!(total > 0)) return 0
  return Math.min(100, Math.max(0, Math.round((loaded / total) * 100)))
}

/**
 * The uploading row's progress line: "1.2 of 1.9 MB · 64%". When both sizes share a unit the first drops it, as the spec
 * writes it; otherwise both carry theirs ("820 KB of 1.9 MB · 42%"). `of` is the word between them (translate it).
 */
export function formatProgress(loaded: number, total: number, of = "of", locale = "en"): string {
  const done = formatBytes(loaded, locale)
  const all = formatBytes(total, locale)
  const unit = (s: string) => s.slice(s.lastIndexOf(" ") + 1)
  const head = unit(done) === unit(all) ? done.slice(0, done.lastIndexOf(" ")) : done
  return `${head} ${of} ${all} · ${uploadPercent(loaded, total)}%`
}
