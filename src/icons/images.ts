import type { IconQuality } from './policy';

/** SVGs are only ever rendered as images. Reject active and externally loaded content. */
export function safeSvg(text: string): string | null {
  if (
    text.length > 256_000 ||
    /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(text)
  )
    return null;
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (
    doc.querySelector('parsererror') ||
    doc.documentElement.localName !== 'svg' ||
    doc.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg'
  )
    return null;
  const forbidden = new Set([
    'script',
    'foreignobject',
    'iframe',
    'image',
    'a',
    'animate',
    'animatetransform',
    'animatemotion',
    'set',
    'feimage',
  ]);
  const elements = [...doc.querySelectorAll('*')];
  if (elements.length > 4000) return null;
  for (const el of elements) {
    if (
      forbidden.has(el.localName.toLowerCase()) ||
      el.namespaceURI !== 'http://www.w3.org/2000/svg'
    )
      return null;
    for (const attr of [...el.attributes]) {
      if (attr.namespaceURI === 'http://www.w3.org/2000/xmlns/') continue;
      const name = attr.localName.toLowerCase();
      if (
        name.startsWith('on') ||
        name === 'base' ||
        (name === 'href' && !attr.value.startsWith('#')) ||
        (/(?:@import|expression\s*\(|(?:https?:|data:|javascript:|\/\/))/i.test(
          attr.value.replace(/\s+/g, ''),
        ) &&
          name !== 'xmlns')
      )
        return null;
    }
    if (
      el.localName === 'style' &&
      /@import|url\s*\(|\\|https?:|data:/i.test(el.textContent ?? '')
    )
      return null;
    for (const { value } of [...el.attributes]) {
      if (
        /\\/.test(value) ||
        [...value.matchAll(/url\s*\(([^)]+)\)/gi)].some(
          (m) => !/^['"]?#[\w.-]+['"]?$/.test(m[1].trim()),
        )
      )
        return null;
    }
  }
  const root = doc.documentElement;
  if (!root.hasAttribute('width') || !root.hasAttribute('height')) {
    const box = (root.getAttribute('viewBox') ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (
      box.length === 4 &&
      box.every(Number.isFinite) &&
      box[2] > 0 &&
      box[3] > 0
    ) {
      root.setAttribute('width', String(box[2]));
      root.setAttribute('height', String(box[3]));
    }
  }
  for (const dimension of ['width', 'height']) {
    const value = parseFloat(root.getAttribute(dimension) ?? '0');
    if (!Number.isFinite(value) || value < 0 || value > 4096) return null;
  }
  return new XMLSerializer().serializeToString(root);
}
/** Reject oversized raster headers before asking the browser to allocate decoded pixels. */
export function rasterDimensions(
  bytes: Uint8Array,
  type: string,
): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'image/png' && bytes.length >= 24)
    return [view.getUint32(16), view.getUint32(20)];
  if (type === 'image/gif' && bytes.length >= 10)
    return [view.getUint16(6, true), view.getUint16(8, true)];
  if (type === 'image/jpeg') {
    let i = 2;
    while (i + 8 < bytes.length) {
      if (bytes[i] !== 255) break;
      const marker = bytes[i + 1],
        length = view.getUint16(i + 2);
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      )
        return [view.getUint16(i + 7), view.getUint16(i + 5)];
      if (length < 2) break;
      i += length + 2;
    }
  }
  if (type === 'image/webp' && bytes.length >= 30) {
    const kind = String.fromCharCode(...bytes.slice(12, 16));
    if (kind === 'VP8X')
      return [
        1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      ];
    if (kind === 'VP8 ')
      return [
        view.getUint16(26, true) & 0x3fff,
        view.getUint16(28, true) & 0x3fff,
      ];
    if (kind === 'VP8L' && bytes[20] === 47)
      return [
        1 + (view.getUint32(21, true) & 0x3fff),
        1 + ((view.getUint32(21, true) >>> 14) & 0x3fff),
      ];
  }
  return null;
}
export function pixelQuality(
  data: Uint8ClampedArray,
  width: number,
  height: number,
) {
  let left = width,
    right = -1,
    top = height,
    bottom = -1,
    visible = 0,
    colorful = 0,
    pairs = 0,
    repeated = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 24) continue;
      visible++;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      if (
        Math.max(data[i], data[i + 1], data[i + 2]) -
          Math.min(data[i], data[i + 1], data[i + 2]) >
        24
      )
        colorful++;
      // A conservative repeated-edge heuristic; it cannot prove arbitrary resampling.
      if (x > 0 && y > 0 && data[i + 3] > 220) {
        const before = i - 4,
          above = i - width * 4;
        const same = (j: number) =>
          Math.abs(data[i] - data[j]) +
            Math.abs(data[i + 1] - data[j + 1]) +
            Math.abs(data[i + 2] - data[j + 2]) <
          3;
        if (!same(before) || !same(above)) {
          pairs++;
          if (same(before) || same(above)) repeated++;
        }
      }
    }
  return {
    coverage: visible
      ? ((right - left + 1) * (bottom - top + 1)) / (width * height)
      : 0,
    transparency: 1 - visible / (width * height),
    monochrome: colorful / Math.max(visible, 1) < 0.02,
    detail: pairs > 100 && repeated / pairs > 0.97 ? 0.5 : 1,
  };
}
export async function decodeIcon(
  bytes: Uint8Array,
  mime: string,
): Promise<{ blob: Blob; quality: IconQuality }> {
  // Sniff signatures as well as MIME; HTML error pages and arbitrary payloads never reach a decoder.
  const head = new TextDecoder().decode(bytes.slice(0, 256)).trim();
  const vector =
    mime === 'image/svg+xml' || /^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(head);
  const raster =
    bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
      ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216
        ? 'image/jpeg'
        : head.startsWith('GIF8')
          ? 'image/gif'
          : head.startsWith('RIFF') &&
              String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
            ? 'image/webp'
            : bytes[0] === 0 &&
                bytes[1] === 0 &&
                bytes[2] === 1 &&
                bytes[3] === 0
              ? 'image/x-icon'
              : '';
  if (
    !vector &&
    (!raster ||
      (mime &&
        !mime.startsWith('image/') &&
        mime !== 'application/octet-stream'))
  )
    throw new Error('Not an icon image');
  const svg = vector ? safeSvg(new TextDecoder().decode(bytes)) : null;
  if (vector && !svg) throw new Error('Unsafe SVG');
  const dimensions = rasterDimensions(bytes, raster);
  if (
    dimensions &&
    (Math.min(...dimensions) < 8 ||
      Math.max(...dimensions) > 4096 ||
      dimensions[0] * dimensions[1] > 16_777_216)
  )
    throw new Error('Unsuitable dimensions');
  const blob = new Blob([vector ? svg! : new Uint8Array(bytes)], {
    type: vector ? 'image/svg+xml' : raster,
  });
  const url = URL.createObjectURL(blob),
    image = new Image();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // decode() can wait for a rendering frame that a hidden offscreen page never
    // presents. Load the image and force real decoding through drawImage below.
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Image decoding failed'));
      timeout = setTimeout(
        () => reject(new Error('Image decoding timed out')),
        4000,
      );
      image.src = url;
    });
    const width = image.naturalWidth,
      height = image.naturalHeight;
    if (
      Math.min(width, height) < 8 ||
      Math.max(width, height) > 4096 ||
      width * height > 16_777_216 ||
      Math.max(width, height) / Math.min(width, height) > 4
    )
      throw new Error('Unsuitable dimensions');
    const canvas = document.createElement('canvas');
    const sampleScale = Math.min(1, 128 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * sampleScale));
    canvas.height = Math.max(1, Math.round(height * sampleScale));
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const measured = pixelQuality(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
    );
    if (measured.coverage < 0.04 || measured.transparency > 0.995)
      throw new Error('Empty icon');
    const quality = { width, height, vector, ...measured };
    if (vector) return { blob, quality };
    // Freeze animation and bound stored raster size; keep the original aspect ratio and alpha.
    const scale = Math.min(1, 512 / Math.max(width, height));
    const output = new OffscreenCanvas(
      Math.round(width * scale),
      Math.round(height * scale),
    );
    const outputContext = output.getContext('2d')!;
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.drawImage(image, 0, 0, output.width, output.height);
    const normalized = await output.convertToBlob({ type: 'image/png' });
    return { blob: normalized, quality };
  } finally {
    clearTimeout(timeout);
    image.src = '';
    URL.revokeObjectURL(url);
  }
}
