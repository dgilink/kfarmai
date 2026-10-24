// Only these three raster formats enter the decoder. Never infer format from a name or MIME.
export type ImageKind = 'jpeg' | 'png' | 'webp';
export const MAX_INPUT_BYTES = 4 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
export const MAX_EDGE = 4096;
export const MAX_PIXELS = 12_000_000;

function u16be(b: Uint8Array, p: number): number { return (b[p] << 8) | b[p + 1]; }
function u32be(b: Uint8Array, p: number): number { return (b[p] * 0x1000000) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3]; }
function u24le(b: Uint8Array, p: number): number { return b[p] | (b[p + 1] << 8) | (b[p + 2] << 16); }
function ascii(b: Uint8Array, p: number, value: string): boolean {
  return [...value].every((char, i) => b[p + i] === char.charCodeAt(0));
}
export function inspectImage(b: Uint8Array): { kind: ImageKind; width: number; height: number } {
  if (b.length < 30 || b.length > MAX_INPUT_BYTES) throw new Error('invalid image size');
  let kind: ImageKind;
  let width = 0, height = 0;
  if (ascii(b, 0, '\x89PNG\r\n\x1a\n')) {
    kind = 'png';
    if (!ascii(b, 12, 'IHDR') || u32be(b, 8) !== 13) throw new Error('invalid PNG header');
    width = u32be(b, 16); height = u32be(b, 20);
  } else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    kind = 'jpeg';
    let p = 2;
    while (p + 9 < b.length) {
      if (b[p] !== 0xff) throw new Error('invalid JPEG marker');
      while (b[p] === 0xff) p++;
      const marker = b[p++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (p + 2 > b.length) break;
      const length = u16be(b, p);
      if (length < 2 || p + length > b.length) throw new Error('invalid JPEG segment');
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        height = u16be(b, p + 3); width = u16be(b, p + 5); break;
      }
      p += length;
    }
  } else if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) {
    kind = 'webp';
    if (u32be(b, 4) === 0) throw new Error('invalid WebP header');
    if (ascii(b, 12, 'VP8X')) {
      width = u24le(b, 24) + 1; height = u24le(b, 27) + 1;
    } else if (ascii(b, 12, 'VP8L') && b[20] === 0x2f) {
      width = 1 + (((b[22] & 0x3f) << 8) | b[21]);
      height = 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | (b[22] >> 6));
    } else if (ascii(b, 12, 'VP8 ') && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      width = u16be(new Uint8Array([b[27], b[26]]), 0) & 0x3fff;
      height = u16be(new Uint8Array([b[29], b[28]]), 0) & 0x3fff;
    }
  } else throw new Error('unsupported image bytes');
  if (!width || !height || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
    throw new Error('image dimensions exceed limit');
  }
  return { kind, width, height };
}
