"use strict";

const fs = require("fs");
const path = require("path");
const { once } = require("events");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function updateCrc32(crc, chunk) {
  let value = crc >>> 0;
  for (let index = 0; index < chunk.length; index += 1) {
    value = CRC_TABLE[(value ^ chunk[index]) & 0xff] ^ (value >>> 8);
  }
  return value >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

async function writeBuffer(output, buffer) {
  if (!output.write(buffer)) await once(output, "drain");
}

async function streamFileToOutput(filePath, output) {
  const stream = fs.createReadStream(filePath, { highWaterMark: 256 * 1024 });
  let crc = 0xffffffff;
  let bytes = 0;

  try {
    for await (const chunk of stream) {
      crc = updateCrc32(crc, chunk);
      bytes += chunk.length;
      await writeBuffer(output, chunk);
    }
  } finally {
    if (!stream.destroyed) stream.destroy();
  }

  return { crc: (crc ^ 0xffffffff) >>> 0, bytes };
}

function localHeader(nameBuffer, dosTime, dosDate) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0808, 6); // data descriptor + UTF-8
  header.writeUInt16LE(0, 8); // stored, no recompression
  header.writeUInt16LE(dosTime, 10);
  header.writeUInt16LE(dosDate, 12);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(0, 18);
  header.writeUInt32LE(0, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function dataDescriptor(crc, size) {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc >>> 0, 4);
  descriptor.writeUInt32LE(size >>> 0, 8);
  descriptor.writeUInt32LE(size >>> 0, 12);
  return descriptor;
}

function centralHeader(entry) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0808, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(entry.dosTime, 12);
  header.writeUInt16LE(entry.dosDate, 14);
  header.writeUInt32LE(entry.crc >>> 0, 16);
  header.writeUInt32LE(entry.size >>> 0, 20);
  header.writeUInt32LE(entry.size >>> 0, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset >>> 0, 42);
  return header;
}

function endOfCentralDirectory(entryCount, centralSize, centralOffset) {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entryCount, 8);
  end.writeUInt16LE(entryCount, 10);
  end.writeUInt32LE(centralSize >>> 0, 12);
  end.writeUInt32LE(centralOffset >>> 0, 16);
  end.writeUInt16LE(0, 20);
  return end;
}

async function createZipFromPaths(zipPath, filePaths) {
  const normalizedPaths = Array.from(filePaths || []);
  if (!normalizedPaths.length) throw new Error("Aucun fichier à ajouter au ZIP.");

  const output = fs.createWriteStream(zipPath, { flags: "w" });
  const entries = [];
  let offset = 0;
  let completed = false;

  try {
    for (const filePath of normalizedPaths) {
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(`Fichier ZIP introuvable : ${filePath || "chemin vide"}`);
      }

      const stat = fs.statSync(filePath);
      if (!stat.isFile()) throw new Error(`Fichier ZIP invalide : ${filePath}`);
      if (stat.size > 0xffffffff) throw new Error("Un fichier dépasse la limite ZIP32.");

      const name = Buffer.from(path.basename(filePath), "utf8");
      const { dosTime, dosDate } = dosDateTime(stat.mtime);
      const entryOffset = offset;
      const header = localHeader(name, dosTime, dosDate);
      await writeBuffer(output, header);
      await writeBuffer(output, name);
      offset += header.length + name.length;

      const streamed = await streamFileToOutput(filePath, output);
      if (streamed.bytes !== stat.size) throw new Error(`Lecture ZIP incomplète : ${filePath}`);
      offset += streamed.bytes;

      const descriptor = dataDescriptor(streamed.crc, streamed.bytes);
      await writeBuffer(output, descriptor);
      offset += descriptor.length;

      entries.push({
        name,
        dosTime,
        dosDate,
        crc: streamed.crc,
        size: streamed.bytes,
        offset: entryOffset
      });
    }

    const centralOffset = offset;
    for (const entry of entries) {
      const header = centralHeader(entry);
      await writeBuffer(output, header);
      await writeBuffer(output, entry.name);
      offset += header.length + entry.name.length;
    }

    const centralSize = offset - centralOffset;
    await writeBuffer(output, endOfCentralDirectory(entries.length, centralSize, centralOffset));
    output.end();
    await once(output, "finish");
    completed = true;
  } finally {
    if (!completed && !output.destroyed) output.destroy();
    if (!completed) {
      try { await fs.promises.unlink(zipPath); } catch {}
    }
  }

  const finalSize = fs.statSync(zipPath).size;
  if (finalSize <= 0) throw new Error("Le ZIP généré est vide.");
  return zipPath;
}

module.exports = { createZipFromPaths };
