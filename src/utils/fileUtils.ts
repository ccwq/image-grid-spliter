export const fileSha256 = async (file: File): Promise<string> => {
  const fallbackId = [file.name, file.lastModified, file.size].join("-");
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle?.digest) {
      return fallbackId;
    }

    const data = await file.arrayBuffer();
    // 计算 SHA-256 digest，返回 ArrayBuffer
    const hashBuffer = await subtle.digest("SHA-256", data);

    const hashHex = toHex(hashBuffer);

    return hashHex;
  } catch {
    // 在部分环境（如非安全上下文或早期移动端浏览器）缺少 WebCrypto 时，回退到基于文件元信息的标识
    return fallbackId;
  }
};

function toHex(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
