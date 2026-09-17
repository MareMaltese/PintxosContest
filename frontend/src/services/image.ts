const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export function computeTargetSize(
  width: number,
  height: number,
  maxDimension = MAX_DIMENSION
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  const scale = width > height ? maxDimension / width : maxDimension / height;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function renameToJpeg(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') + '.jpg';
}

export async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = computeTargetSize(bitmap.width, bitmap.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) return file;

  return new File([blob], renameToJpeg(file.name), { type: 'image/jpeg' });
}
