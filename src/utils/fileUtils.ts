export const fileSha256 = async (file: File): Promise<string> => {
  const data = await file.arrayBuffer();

  // 计算 SHA-256 digest，返回 ArrayBuffer
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  const hashHex = toHex(hashBuffer);

  return hashHex;
};



function toHex(arrayBuffer:ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
