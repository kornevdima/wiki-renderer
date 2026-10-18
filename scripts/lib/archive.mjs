// Deterministic archive writers for the portable build (US-278): .tar.gz and .zip in plain Node, no dependency.
// Entries are { name, file, mode } with `name` a POSIX path inside the archive and `file` the source on disk. The caller
// sorts them; the writers add nothing of their own (no uid/gid/user names, one fixed mtime), so the same input gives the
// same bytes on one platform.
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import zlib from "node:zlib";

const BLOCK = 512;

function octal(value, width) {
  return `${value.toString(8).padStart(width - 1, "0")}\0`;
}

/** Splits a long path into ustar `prefix` and `name` at a "/" (name <= 100, prefix <= 155). Throws when it cannot. */
export function splitTarName(name) {
  if (Buffer.byteLength(name) <= 100) return { prefix: "", name };
  for (let i = name.length - 1; i > 0; i -= 1) {
    if (name[i] !== "/") continue;
    const prefix = name.slice(0, i);
    const rest = name.slice(i + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(rest) <= 100) return { prefix, name: rest };
  }
  throw new Error(`Path too long for a tar archive: ${name}`);
}

/** One 512-byte ustar header for a regular file. */
export function tarHeader({ name, size, mode, mtime }) {
  const { prefix, name: short } = splitTarName(name);
  const header = Buffer.alloc(BLOCK);
  header.write(short, 0, 100, "utf8");
  header.write(octal(mode, 8), 100, 8, "ascii");
  header.write(octal(0, 8), 108, 8, "ascii");
  header.write(octal(0, 8), 116, 8, "ascii");
  header.write(octal(size, 12), 124, 12, "ascii");
  header.write(octal(mtime, 12), 136, 12, "ascii");
  header.write("        ", 148, 8, "ascii"); // checksum placeholder: eight spaces
  header.write("0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  header.write(prefix, 345, 155, "utf8");
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return header;
}

async function* tarChunks(entries, mtime) {
  for (const entry of entries) {
    const { size } = await stat(entry.file);
    yield tarHeader({ name: entry.name, size, mode: entry.mode, mtime });
    yield* createReadStream(entry.file);
    const pad = (BLOCK - (size % BLOCK)) % BLOCK;
    if (pad > 0) yield Buffer.alloc(pad);
  }
  yield Buffer.alloc(BLOCK * 2);
}

export async function writeTarGz(outFile, entries, mtime) {
  await pipeline(Readable.from(tarChunks(entries, mtime)), zlib.createGzip({ level: 9 }), createWriteStream(outFile));
}

function dosDateTime(mtime) {
  const d = new Date(mtime * 1000);
  const year = Math.max(d.getUTCFullYear(), 1980);
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1);
  const date = ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}

async function* zipChunks(entries, mtime) {
  const { time, date } = dosDateTime(mtime);
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const data = await readFile(entry.file);
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = packed.length < data.length;
    const body = useDeflate ? packed : data;
    const name = Buffer.from(entry.name, "utf8");
    const crc = zlib.crc32(data);
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    yield local;
    yield name;
    yield body;

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, spec 2.0
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0800, 8);
    record.writeUInt16LE(method, 10);
    record.writeUInt16LE(time, 12);
    record.writeUInt16LE(date, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(body.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(((0o100000 | entry.mode) << 16) >>> 0, 38);
    record.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([record, name]));
    offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(central);
  yield directory;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  yield end;
}

export async function writeZip(outFile, entries, mtime) {
  if (entries.length > 0xfffe) throw new Error("Too many files for a plain zip");
  await pipeline(Readable.from(zipChunks(entries, mtime)), createWriteStream(outFile));
}
