import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const sizes = [16, 24, 32, 48, 64, 128, 256];

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, "ascii");
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])), 0);
  return Buffer.concat([header, data, checksum]);
}

function insideHexagon(x, y, size) {
  const radius = size * 0.42;
  const dx = Math.abs(x - size / 2);
  const dy = Math.abs(y - size / 2);
  return dx <= radius * 0.866 && dy <= radius && dx * 0.577 + dy <= radius;
}

function pixelCoverage(x, y, size, predicate) {
  let covered = 0;
  const samples = 4;
  for (let sy = 0; sy < samples; sy++) {
    for (let sx = 0; sx < samples; sx++) {
      if (predicate(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples, size)) covered++;
    }
  }
  return covered / (samples * samples);
}

function png(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const hex = pixelCoverage(x, y, size, insideHexagon);
      const circle = pixelCoverage(x, y, size, (px, py, canvas) => {
        const radius = canvas * 0.17;
        return (px - canvas / 2) ** 2 + (py - canvas / 2) ** 2 <= radius ** 2;
      });
      const offset = 1 + x * 4;
      if (circle) {
        row[offset] = 24;
        row[offset + 1] = 24;
        row[offset + 2] = 27;
        row[offset + 3] = Math.round(255 * Math.max(hex, circle));
      } else {
        row[offset] = 163;
        row[offset + 1] = 230;
        row[offset + 2] = 53;
        row[offset + 3] = Math.round(255 * hex);
      }
    }
    rows.push(row);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const images = sizes.map(png);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = 6 + images.length * 16;
const entries = images.map((image, index) => {
  const entry = Buffer.alloc(16);
  entry[0] = sizes[index] === 256 ? 0 : sizes[index];
  entry[1] = sizes[index] === 256 ? 0 : sizes[index];
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(image.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += image.length;
  return entry;
});

await mkdir("build", { recursive: true });
await writeFile("build/icon.ico", Buffer.concat([header, ...entries, ...images]));
