export interface ImageInfo {
  format: "png" | "webp" | "jpeg";
  width: number;
  height: number;
}

function readU32(buffer: Uint8Array, offset: number): number {
  return (
    ((buffer[offset] ?? 0) << 24) |
    ((buffer[offset + 1] ?? 0) << 16) |
    ((buffer[offset + 2] ?? 0) << 8) |
    (buffer[offset + 3] ?? 0)
  ) >>> 0;
}

/** 读取常见图片的像素尺寸，供 CLI 校验输出。 */
export function readImageInfo(buffer: Uint8Array): ImageInfo | null {
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { format: "png", width: readU32(buffer, 16), height: readU32(buffer, 20) };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1] ?? 0;
      const size = ((buffer[offset + 2] ?? 0) << 8) | (buffer[offset + 3] ?? 0);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          format: "jpeg",
          height: ((buffer[offset + 5] ?? 0) << 8) | (buffer[offset + 6] ?? 0),
          width: ((buffer[offset + 7] ?? 0) << 8) | (buffer[offset + 8] ?? 0),
        };
      }
      if (size < 2) break;
      offset += 2 + size;
    }
  }
  if (
    buffer.length > 30 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    const chunk = String.fromCharCode(buffer[12] ?? 0, buffer[13] ?? 0, buffer[14] ?? 0, buffer[15] ?? 0);
    if (chunk === "VP8X") {
      const width = 1 + (buffer[24] ?? 0) + ((buffer[25] ?? 0) << 8) + ((buffer[26] ?? 0) << 16);
      const height = 1 + (buffer[27] ?? 0) + ((buffer[28] ?? 0) << 8) + ((buffer[29] ?? 0) << 16);
      return { format: "webp", width, height };
    }
    if (chunk === "VP8 " && buffer.length > 29) {
      return {
        format: "webp",
        width: (buffer[26] ?? 0) | ((buffer[27] ?? 0) << 8),
        height: (buffer[28] ?? 0) | ((buffer[29] ?? 0) << 8),
      };
    }
  }
  return null;
}

export function assertImageSize(buffer: Uint8Array, width: number, height: number): ImageInfo {
  const info = readImageInfo(buffer);
  if (!info) throw new Error("输出文件不是可识别的 PNG、WebP 或 JPEG");
  if (info.width !== width || info.height !== height) {
    throw new Error(`图片尺寸为 ${info.width}×${info.height}，期望 ${width}×${height}`);
  }
  if (buffer.byteLength < 32) throw new Error("输出图片为空");
  return info;
}
