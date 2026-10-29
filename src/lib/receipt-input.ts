export function receiptCanvasSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Your browser could not read this image. Choose a JPEG, PNG or WebP invoice.");
  }
  const scale = Math.min(1, 2800 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function loadReceiptCanvas(file: File, signal: AbortSignal): Promise<HTMLCanvasElement> {
  signal.throwIfAborted();
  const url = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement("canvas");
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { image.onload = image.onerror = null; signal.removeEventListener("abort", abort); };
      const abort = () => { cleanup(); reject(new DOMException("OCR cancelled.", "AbortError")); };
      image.onload = () => { cleanup(); resolve(); };
      image.onerror = () => { cleanup(); reject(new Error("Your browser could not read this image. Try exporting it as JPEG or PNG.")); };
      signal.addEventListener("abort", abort, { once: true });
      image.src = url;
    });
    signal.throwIfAborted();
    // Bound the canvas before allocating pixels; phone photos can be much larger than OCR needs.
    Object.assign(canvas, receiptCanvasSize(image.naturalWidth, image.naturalHeight));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not read this image.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch (error) {
    canvas.width = canvas.height = 0;
    throw error;
  } finally {
    image.src = "";
    URL.revokeObjectURL(url);
  }
}
