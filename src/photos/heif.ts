/**
 * Minimal HEIF (ISO/IEC 23008-12) reader: is this file HEIC/HEIF, and where is its EXIF block?
 *
 * We parse this ourselves because exifr 7.1.3 ignores the `iloc` box's base_offset. iPhones write
 * base_offset = 0, so their files work, but libheif-based encoders put the position there and
 * exifr then reads garbage (DECISIONS.md, D19).
 */

const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevx',
  'mif1',
  'msf1',
  'avif',
]);

export function isHeif(bytes: Uint8Array): boolean {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== 'ftyp') return false;
  const size = readUint(bytes, 0, 4);
  // major brand, minor version, then compatible brands
  if (HEIF_BRANDS.has(ascii(bytes, 8, 4))) return true;
  for (let o = 16; o + 4 <= Math.min(size, bytes.length); o += 4) {
    if (HEIF_BRANDS.has(ascii(bytes, o, 4))) return true;
  }
  return false;
}

interface Box {
  type: string;
  /** Start of the box payload (after size and type). */
  start: number;
  end: number;
}

/** The TIFF-format EXIF block of a HEIF file (starts with "II*\0" or "MM\0*"), or null. */
export function extractHeifExif(bytes: Uint8Array): Uint8Array | null {
  const meta = topLevelBoxes(bytes).find((b) => b.type === 'meta');
  if (!meta) return null;
  // `meta` is a full box: 4 bytes of version + flags before its children.
  const children = boxes(bytes, meta.start + 4, meta.end);
  const iinf = children.find((b) => b.type === 'iinf');
  const iloc = children.find((b) => b.type === 'iloc');
  if (!iinf || !iloc) return null;

  const exifId = findExifItemId(bytes, iinf);
  if (exifId === null) return null;
  const extent = findItemExtent(bytes, iloc, exifId);
  if (!extent) return null;

  const [offset, length] = extent;
  if (offset + length > bytes.length || length < 4) return null;
  // Item payload: 4-byte offset to the TIFF header, then (usually) "Exif\0\0", then TIFF.
  const tiffStart = offset + 4 + readUint(bytes, offset, 4);
  if (tiffStart >= offset + length) return null;
  return bytes.subarray(tiffStart, offset + length);
}

function findExifItemId(bytes: Uint8Array, iinf: Box): number | null {
  const version = bytes[iinf.start]!;
  let p = iinf.start + 4;
  const count = readUint(bytes, p, version === 0 ? 2 : 4);
  p += version === 0 ? 2 : 4;
  for (const infe of boxes(bytes, p, iinf.end).slice(0, count)) {
    if (infe.type !== 'infe') continue;
    const v = bytes[infe.start]!;
    if (v < 2) continue; // versions 0/1 predate item types
    const idSize = v === 2 ? 2 : 4;
    const id = readUint(bytes, infe.start + 4, idSize);
    const type = ascii(bytes, infe.start + 4 + idSize + 2, 4);
    if (type === 'Exif') return id;
  }
  return null;
}

/** [absolute offset, length] of an item's first extent, honouring base_offset. */
function findItemExtent(bytes: Uint8Array, iloc: Box, itemId: number): [number, number] | null {
  const version = bytes[iloc.start]!;
  let p = iloc.start + 4;
  const offsetSize = bytes[p]! >> 4;
  const lengthSize = bytes[p]! & 15;
  const baseOffsetSize = bytes[p + 1]! >> 4;
  const indexSize = version === 1 || version === 2 ? bytes[p + 1]! & 15 : 0;
  p += 2;
  const countSize = version < 2 ? 2 : 4;
  const count = readUint(bytes, p, countSize);
  p += countSize;
  const idSize = version < 2 ? 2 : 4;

  for (let i = 0; i < count; i++) {
    const id = readUint(bytes, p, idSize);
    p += idSize;
    let constructionMethod = 0;
    if (version === 1 || version === 2) {
      constructionMethod = readUint(bytes, p, 2) & 15;
      p += 2;
    }
    p += 2; // data_reference_index
    const baseOffset = readUint(bytes, p, baseOffsetSize);
    p += baseOffsetSize;
    const extents = readUint(bytes, p, 2);
    p += 2;
    for (let e = 0; e < extents; e++) {
      p += indexSize;
      const extentOffset = readUint(bytes, p, offsetSize);
      p += offsetSize;
      const extentLength = readUint(bytes, p, lengthSize);
      p += lengthSize;
      // construction_method 0 = file offset. 1 (idat) and 2 (item) are rare for EXIF: skip.
      if (id === itemId && e === 0 && constructionMethod === 0) {
        return [baseOffset + extentOffset, extentLength];
      }
    }
  }
  return null;
}

function topLevelBoxes(bytes: Uint8Array): Box[] {
  return boxes(bytes, 0, bytes.length);
}

function boxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const out: Box[] = [];
  let p = start;
  while (p + 8 <= end) {
    let size = readUint(bytes, p, 4);
    const type = ascii(bytes, p + 4, 4);
    let header = 8;
    if (size === 1) {
      size = readUint(bytes, p + 8, 8);
      header = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < header || p + size > end) break;
    out.push({ type, start: p + header, end: p + size });
    p += size;
  }
  return out;
}

function readUint(bytes: Uint8Array, offset: number, size: number): number {
  let value = 0;
  for (let i = 0; i < size; i++) value = value * 256 + (bytes[offset + i] ?? 0);
  return value;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
