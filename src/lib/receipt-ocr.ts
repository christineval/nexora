export const maxReceiptSize = 20 * 1024 * 1024;
export const receiptTypes = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("OCR cancelled.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function readReceipt(file: File, onProgress: (message: string) => void, signal: AbortSignal): Promise<string> {
  if (!receiptTypes.includes(file.type)) throw new Error("Choose a PNG, JPEG, WebP image or PDF invoice.");
  if (!file.size || file.size > maxReceiptSize) throw new Error("Choose a non-empty file smaller than 20 MB.");
  const { createWorker } = await import("tesseract.js");
  signal.throwIfAborted();
  const creatingWorker = createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js", corePath: "/ocr/core", langPath: "/ocr/lang",
    logger: message => { if (!signal.aborted) onProgress(`${message.status}: ${Math.round(message.progress * 100)}%`); },
    errorHandler: () => {},
  });
  // A worker still loading at cancellation must be released once initialization finishes.
  void creatingWorker.then(worker => { if (signal.aborted) void worker.terminate(); }, () => {});
  const worker = await abortable(creatingWorker, signal);
  const stop = () => { void worker.terminate(); };
  signal.addEventListener("abort", stop, { once: true });
  try {
    signal.throwIfAborted();
    if (file.type !== "application/pdf") {
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 24000000) throw new Error("This image is too large. Use an image under 24 megapixels.");
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Your browser could not read this image.");
        context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0);
        const { data } = await abortable(worker.recognize(canvas), signal);
        signal.throwIfAborted();
        return data.text;
      } finally { bitmap.close(); }
    }
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const abortPdf = () => { void task.destroy(); };
    signal.addEventListener("abort", abortPdf, { once: true });
    try {
      const pdf = await abortable(task.promise, signal);
      if (pdf.numPages > 10) throw new Error("Import up to 10 PDF pages at a time.");
      const pages: string[] = [];
      for (let index = 1; index <= pdf.numPages; index++) {
        signal.throwIfAborted();
        onProgress(`Reading PDF page ${index} of ${pdf.numPages}`);
        const page = await pdf.getPage(index);
        const viewport = page.getViewport({ scale: 2 });
        if (viewport.width * viewport.height > 24000000) throw new Error("This PDF page is too large to read. Export it at a smaller size.");
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await abortable(page.render({ canvas, viewport }).promise, signal);
        const { data } = await abortable(worker.recognize(canvas), signal);
        pages.push(data.text);
        canvas.width = 0; canvas.height = 0;
        page.cleanup();
      }
      return pages.join("\n\n");
    } finally {
      signal.removeEventListener("abort", abortPdf);
      await task.destroy();
    }
  } finally {
    signal.removeEventListener("abort", stop);
    if (!signal.aborted) await worker.terminate();
  }
}
