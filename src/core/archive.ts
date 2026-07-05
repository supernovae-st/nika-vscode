// archive.ts — pure archive extractors for the downloaded engine binary.
//
// No vscode import: these parse bytes that get chmod+x and EXECUTED, so
// they live in core/ where the test suite can feed them adversarial
// archives (multi-entry · unaligned sizes · dirs named like the target ·
// corrupt containers). binaryInstaller.ts is the only production caller.

import * as fs from 'fs';
import * as zlib from 'zlib';

/**
 * Extracts the `nika` binary from a .tar.gz archive.
 * The archive layout is: `{artifactName}-{version}/nika`
 * Uses a streaming state machine: decompress -> parse 512-byte TAR blocks -> write target entry.
 * Exported for tests (the download path is the only production caller).
 */
export function extractBinaryFromTarGz(archivePath: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destPath);
    let resolved = false;

    const finish = (err?: Error): void => {
      if (resolved) { return; }
      resolved = true;
      // Stop pulling the rest of the archive — the target is done (or dead).
      src.destroy();
      decompressed.destroy();
      if (err) {
        output.destroy();
        fs.unlink(destPath, () => undefined);
        reject(err);
      } else {
        // Resolve only after the OS has the bytes: the caller chmods and
        // EXECUTES this file next — resolving before flush is a race.
        output.end(() => resolve());
      }
    };

    // TAR state machine: header -> copy/skip -> header -> ...
    // Each TAR block is 512 bytes. Data sections are padded to 512-byte boundaries.
    type TarState = 'header' | 'copy' | 'skip';
    let tarState: TarState = 'header';
    let tarSkipBlocks = 0;  // 512-byte blocks left to skip for current non-target entry
    let tarCopyBlocks = 0;  // 512-byte blocks left to consume for the target entry
    let tarWriteBytes = 0;  // real bytes left to write (excludes padding)
    let found = false;

    const buf: Buffer[] = [];
    let bufLen = 0;

    const consumeBlocks = (): void => {
      while (bufLen >= 512) {
        const full = Buffer.concat(buf, bufLen);
        const block = Buffer.from(full.subarray(0, 512));
        const after = full.subarray(512);
        buf.length = 0;
        if (after.length > 0) { buf.push(Buffer.from(after)); }
        bufLen -= 512;

        switch (tarState) {
          case 'skip':
            tarSkipBlocks--;
            if (tarSkipBlocks === 0) { tarState = 'header'; }
            break;

          case 'copy': {
            const toWrite = Math.min(tarWriteBytes, 512);
            if (toWrite > 0 && !resolved) {
              output.write(block.subarray(0, toWrite));
              tarWriteBytes -= toWrite;
            }
            tarCopyBlocks--;
            if (tarCopyBlocks === 0) {
              tarState = 'header';
              found = true;
              finish();
              return;
            }
            break;
          }

          case 'header': {
            const entryName = block.toString('utf-8', 0, 100).replace(/\0/g, '');
            if (!entryName) { break; } // null block (end of archive)

            const sizeOctal = block.toString('utf-8', 124, 136).replace(/\0/g, '').trim();
            const entryBytes = parseInt(sizeOctal, 8) || 0;
            const flag = block[156];
            // typeflag '0' (0x30) or NUL (0x00) = regular file
            const isReg = flag === 0x30 || flag === 0x00;
            const base = entryName.split('/').pop() ?? '';
            const isTarget = isReg && (base === 'nika' || base === 'nika.exe');

            if (isTarget && entryBytes > 0) {
              tarState = 'copy';
              tarCopyBlocks = Math.ceil(entryBytes / 512);
              tarWriteBytes = entryBytes;
            } else if (entryBytes > 0) {
              tarState = 'skip';
              tarSkipBlocks = Math.ceil(entryBytes / 512);
            }
            // entryBytes === 0: directory or empty entry — stay in 'header' state
            break;
          }
        }
      }
    };

    const decompressed = zlib.createGunzip();
    const src = fs.createReadStream(archivePath);

    src.on('error', finish);
    decompressed.on('error', finish);
    output.on('error', finish);

    decompressed.on('data', (chunk: Buffer) => {
      buf.push(Buffer.from(chunk));
      bufLen += chunk.length;
      consumeBlocks();
    });

    decompressed.on('end', () => {
      if (!found && !resolved) {
        finish(new Error('nika binary not found in archive'));
      }
    });

    src.pipe(decompressed);
  });
}

/**
 * Extracts the `nika.exe` binary from a .zip archive.
 * Finds the entry ending in `/nika.exe` and writes it to destPath.
 * Uses a pure-JS ZIP parser (no dependencies).
 * Exported for tests (the download path is the only production caller).
 */
export function extractBinaryFromZip(archivePath: string, destPath: string): Promise<void> {
  const MAX_ZIP_SIZE = 500 * 1024 * 1024; // 500 MB

  return new Promise((resolve, reject) => {
    fs.stat(archivePath, (statErr, stats) => {
      if (statErr) { reject(statErr); return; }
      if (stats.size > MAX_ZIP_SIZE) {
        reject(new Error(
          `ZIP archive too large: ${stats.size} bytes exceeds ${MAX_ZIP_SIZE} byte limit`
        ));
        return;
      }

      fs.readFile(archivePath, (readErr, data) => {
        if (readErr) { reject(readErr); return; }

      // Locate End of Central Directory record (EOCD): signature 0x06054b50
      let eocdOffset = -1;
      for (let i = data.length - 22; i >= 0; i--) {
        if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x05 && data[i + 3] === 0x06) {
          eocdOffset = i;
          break;
        }
      }
      if (eocdOffset === -1) { reject(new Error('Invalid ZIP: no EOCD')); return; }

      const cdOffset = data.readUInt32LE(eocdOffset + 16);
      const cdSize = data.readUInt32LE(eocdOffset + 12);

      let pos = cdOffset;
      const cdEnd = cdOffset + cdSize;
      let found = false;

      while (pos < cdEnd) {
        // Central directory file header signature: 0x02014b50
        if (
          data[pos] !== 0x50 || data[pos + 1] !== 0x4b ||
          data[pos + 2] !== 0x01 || data[pos + 3] !== 0x02
        ) {
          break;
        }
        const compMethod = data.readUInt16LE(pos + 10);
        const compSize = data.readUInt32LE(pos + 20);
        const uncompSize = data.readUInt32LE(pos + 24);
        const fnLen = data.readUInt16LE(pos + 28);
        const extraLen = data.readUInt16LE(pos + 30);
        const commentLen = data.readUInt16LE(pos + 32);
        const localHeaderOffset = data.readUInt32LE(pos + 42);
        const fileName = data.toString('utf-8', pos + 46, pos + 46 + fnLen);

        const base = fileName.split('/').pop() ?? '';
        if (base === 'nika.exe') {
          // Read local file header to find actual data offset
          const localPos = localHeaderOffset;
          const localFnLen = data.readUInt16LE(localPos + 26);
          const localExtraLen = data.readUInt16LE(localPos + 28);
          const dataOffset = localPos + 30 + localFnLen + localExtraLen;

          let fileData: Buffer;
          if (compMethod === 0) {
            // Stored (no compression)
            fileData = data.subarray(dataOffset, dataOffset + uncompSize);
          } else if (compMethod === 8) {
            // Deflate
            const compressed = data.subarray(dataOffset, dataOffset + compSize);
            try {
              fileData = zlib.inflateRawSync(compressed);
            } catch (e) {
              reject(new Error(`ZIP inflate error: ${e}`));
              return;
            }
          } else {
            reject(new Error(`Unsupported ZIP compression method: ${compMethod}`));
            return;
          }

          fs.writeFile(destPath, fileData, (writeErr) => {
            if (writeErr) { reject(writeErr); } else { resolve(); }
          });
          found = true;
          break;
        }

        pos += 46 + fnLen + extraLen + commentLen;
      }

      if (!found) {
        reject(new Error('nika.exe not found in ZIP archive'));
      }
    });
    });
  });
}
