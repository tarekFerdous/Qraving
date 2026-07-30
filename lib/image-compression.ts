/**
 * Compresses an image file client-side (canvas downscale/re-encode) until it
 * fits under `maxBytes`, or gives up after a fixed number of attempts and
 * returns the best result achieved. Callers must check the returned file's
 * size themselves — this function does not throw if it can't hit the target.
 */
export async function compressImageFile(file: File, maxBytes: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  let scale = 1;
  let quality = 0.8;
  let result: Blob = file;

  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) break;
    result = blob;
    if (blob.size <= maxBytes) break;

    if (quality > 0.4) {
      quality -= 0.2;
    } else {
      scale *= 0.7;
    }
  }

  return new File([result], file.name, { type: 'image/jpeg' });
}
