/**
 * Prepare a picked file for upload. Photos from a phone are 3-8 MB — over the server's
 * attachment cap — so images are downscaled (long edge → MAX_DIM) and re-encoded as JPEG
 * before upload. Non-images pass through untouched. Returns the base64 payload the
 * attachment API expects, or throws with a readable message.
 */
const MAX_DIM = 1600; // px on the long edge — plenty sharp, tiny payload
const JPEG_QUALITY = 0.82;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
}

const stripB64 = (dataUrl: string) =>
  dataUrl.includes("base64,") ? dataUrl.slice(dataUrl.indexOf("base64,") + 7) : dataUrl;

export interface UploadPayload {
  filename: string;
  mime: string;
  data: string; // base64 (no data: prefix)
  /** True if we resized/re-encoded it (image). */
  compressed: boolean;
}

export async function prepareUpload(file: File): Promise<UploadPayload> {
  const isImage = file.type.startsWith("image/");
  // Small images and non-images: send as-is.
  if (!isImage) {
    return { filename: file.name, mime: file.type || "application/octet-stream", data: stripB64(await readAsDataUrl(file)), compressed: false };
  }

  // Decode → draw scaled → re-encode JPEG. Falls back to the raw bytes if canvas fails.
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("decode failed"));
        im.src = url;
      });
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const base = file.name.replace(/\.[^./\\]+$/, "");
      return { filename: `${base}.jpg`, mime: "image/jpeg", data: stripB64(dataUrl), compressed: true };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    // Couldn't process — send the original and let the server cap decide.
    return { filename: file.name, mime: file.type || "image/jpeg", data: stripB64(await readAsDataUrl(file)), compressed: false };
  }
}

export const isImageMime = (mime: string | undefined): boolean => !!mime && mime.startsWith("image/");
