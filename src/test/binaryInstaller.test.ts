// binaryInstaller.test.ts — the hand-rolled TAR/ZIP extractors, proven.
//
// These parsers feed bytes that get chmod+x and EXECUTED — the single
// riskiest surface in the extension. Fixtures are built byte-by-byte in
// the test (headers hand-assembled), so every adversarial layout is
// deterministic: multi-entry archives, non-512-aligned sizes, directory
// entries named like the target, missing targets, corrupt containers.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { extractBinaryFromTarGz, extractBinaryFromZip } from '../core/archive';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nika-installer-test-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

// ─── TAR fixture builder (ustar-lite: the fields the parser reads) ─────────

interface TarEntry {
  name: string;
  body?: Buffer;
  /** '0' regular file · '5' directory. */
  type?: '0' | '5';
}

function tarHeader(name: string, size: number, type: '0' | '5'): Buffer {
  const block = Buffer.alloc(512);
  block.write(name, 0, 'utf-8');                                  // name [0,100)
  block.write('0000755\0', 100, 'utf-8');                          // mode
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 'utf-8'); // size [124,136)
  block.write(type === '5' ? '5' : '0', 156, 'utf-8');             // typeflag
  block.write('ustar\0', 257, 'utf-8');                            // magic
  // Checksum (not validated by the parser, but keep the block honest).
  block.write('        ', 148, 'utf-8');
  let sum = 0;
  for (const b of block) { sum += b; }
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'utf-8');
  return block;
}

function buildTarGz(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    const body = e.body ?? Buffer.alloc(0);
    parts.push(tarHeader(e.name, e.type === '5' ? 0 : body.length, e.type ?? '0'));
    if (body.length > 0) {
      parts.push(body);
      const pad = (512 - (body.length % 512)) % 512;
      if (pad > 0) { parts.push(Buffer.alloc(pad)); }
    }
  }
  parts.push(Buffer.alloc(1024)); // end-of-archive: two null blocks
  return zlib.gzipSync(Buffer.concat(parts));
}

// ─── ZIP fixture builder (local headers + central directory + EOCD) ────────

interface ZipEntry {
  name: string;
  body: Buffer;
  /** 0 stored · 8 deflate · anything else = adversarial. */
  method?: number;
}

function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const method = e.method ?? 8;
    const data = method === 8 ? zlib.deflateRawSync(e.body)
      : method === 0 ? e.body
      : e.body; // adversarial methods ship the raw body
    const nameBuf = Buffer.from(e.name, 'utf-8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);  // compressed size
    local.writeUInt32LE(e.body.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    const localFull = Buffer.concat([local, nameBuf, data]);
    locals.push(localFull);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(e.body.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));

    offset += localFull.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

// ─── TAR extraction ─────────────────────────────────────────────────────────

describe('extractBinaryFromTarGz', () => {
  it('extracts the nika entry byte-exact from a release-shaped archive', async () => {
    // Non-512-aligned size exercises the padding math; >512 exercises
    // multi-block copy. 0x7f 'ELF' + patterned bytes = corruption shows.
    const binary = Buffer.alloc(1300);
    binary[0] = 0x7f;
    binary.write('ELF', 1, 'utf-8');
    for (let i = 4; i < binary.length; i++) { binary[i] = i % 251; }

    const archive = path.join(dir, 'a.tar.gz');
    fs.writeFileSync(archive, buildTarGz([
      { name: 'nika-macos-arm64-0.92.0/', type: '5' },
      { name: 'nika-macos-arm64-0.92.0/README.md', body: Buffer.alloc(700, 0x41) },
      { name: 'nika-macos-arm64-0.92.0/nika', body: binary },
      { name: 'nika-macos-arm64-0.92.0/LICENSE', body: Buffer.alloc(100, 0x42) },
    ]));

    const dest = path.join(dir, 'nika');
    await extractBinaryFromTarGz(archive, dest);
    expect(fs.readFileSync(dest).equals(binary)).toBe(true);
  });

  it('a DIRECTORY named like the target never matches — the real file wins', async () => {
    const binary = Buffer.from('#!/bin/sh\necho ok\n', 'utf-8');
    const archive = path.join(dir, 'b.tar.gz');
    fs.writeFileSync(archive, buildTarGz([
      // Adversarial: a directory entry whose PATH ends in /nika — naive
      // basename logic that strips the trailing slash would collide.
      { name: 'pkg/nika/', type: '5' },
      { name: 'pkg/nika/data.bin', body: Buffer.alloc(600, 0x44) },
      { name: 'pkg/nika-helper', body: Buffer.alloc(40, 0x45) }, // prefix ≠ exact
      { name: 'pkg/bin/nika', body: binary },
    ]));
    const dest = path.join(dir, 'out');
    await extractBinaryFromTarGz(archive, dest);
    expect(fs.readFileSync(dest).equals(binary)).toBe(true);
  });

  it('nika.exe is also accepted from a tarball (windows-shaped layout)', async () => {
    const binary = Buffer.alloc(513, 0x5a); // one byte past a block boundary
    const archive = path.join(dir, 'e.tar.gz');
    fs.writeFileSync(archive, buildTarGz([
      { name: 'pkg/nika.exe', body: binary },
    ]));
    const dest = path.join(dir, 'out.exe');
    await extractBinaryFromTarGz(archive, dest);
    expect(fs.readFileSync(dest).equals(binary)).toBe(true);
  });

  it('rejects when no nika entry exists', async () => {
    const archive = path.join(dir, 'c.tar.gz');
    fs.writeFileSync(archive, buildTarGz([
      { name: 'pkg/README.md', body: Buffer.alloc(10, 0x41) },
    ]));
    await expect(extractBinaryFromTarGz(archive, path.join(dir, 'out')))
      .rejects.toThrow(/not found/i);
  });

  it('rejects on a corrupt (non-gzip) archive', async () => {
    const archive = path.join(dir, 'd.tar.gz');
    fs.writeFileSync(archive, Buffer.from('definitely not gzip'));
    await expect(extractBinaryFromTarGz(archive, path.join(dir, 'out')))
      .rejects.toThrow();
  });
});

// ─── ZIP extraction ─────────────────────────────────────────────────────────

describe('extractBinaryFromZip', () => {
  it('extracts a DEFLATED nika.exe byte-exact from a multi-entry zip', async () => {
    const binary = Buffer.alloc(2048);
    binary.write('MZ', 0, 'utf-8');
    for (let i = 2; i < binary.length; i++) { binary[i] = (i * 7) % 256; }

    const archive = path.join(dir, 'a.zip');
    fs.writeFileSync(archive, buildZip([
      { name: 'nika-windows-x64-0.92.0/README.md', body: Buffer.alloc(300, 0x41), method: 0 },
      { name: 'nika-windows-x64-0.92.0/nika.exe', body: binary, method: 8 },
    ]));

    const dest = path.join(dir, 'nika.exe');
    await extractBinaryFromZip(archive, dest);
    expect(fs.readFileSync(dest).equals(binary)).toBe(true);
  });

  it('extracts a STORED nika.exe (method 0)', async () => {
    const binary = Buffer.from('stored-binary-bytes');
    const archive = path.join(dir, 'b.zip');
    fs.writeFileSync(archive, buildZip([
      { name: 'nika.exe', body: binary, method: 0 },
    ]));
    const dest = path.join(dir, 'out.exe');
    await extractBinaryFromZip(archive, dest);
    expect(fs.readFileSync(dest).equals(binary)).toBe(true);
  });

  it('rejects an unsupported compression method instead of writing garbage', async () => {
    const archive = path.join(dir, 'c.zip');
    fs.writeFileSync(archive, buildZip([
      { name: 'nika.exe', body: Buffer.from('x'), method: 12 },
    ]));
    await expect(extractBinaryFromZip(archive, path.join(dir, 'out')))
      .rejects.toThrow(/compression method/i);
  });

  it('rejects a zip without an EOCD record', async () => {
    const archive = path.join(dir, 'd.zip');
    fs.writeFileSync(archive, Buffer.alloc(64, 0x00));
    await expect(extractBinaryFromZip(archive, path.join(dir, 'out')))
      .rejects.toThrow(/EOCD/i);
  });

  it('rejects when nika.exe is absent', async () => {
    const archive = path.join(dir, 'e.zip');
    fs.writeFileSync(archive, buildZip([
      { name: 'docs/manual.pdf', body: Buffer.alloc(40, 0x50), method: 0 },
    ]));
    await expect(extractBinaryFromZip(archive, path.join(dir, 'out')))
      .rejects.toThrow(/not found/i);
  });
});
