import { prepareReceiptImage } from "./receipt-image";

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
  const { createWorker, PSM } = await import("tesseract.js");
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
    await abortable(worker.setParameters({ preserve_interword_spaces: "1", user_defined_dpi: "300" }), signal);
    async function recognizePage(canvas: HTMLCanvasElement) {
      onProgress("Enhancing contrast and straightening the invoice...");
      const prepared = prepareReceiptImage(canvas);
      try {
        signal.throwIfAborted();
        const { data } = await abortable(worker.recognize(prepared, {}, { text: true, blocks: true }), signal);
        const lines = data.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? [];
        // Read price cells independently so neighboring columns cannot alter their digits.
        if (!/\bbarcode\b/i.test(data.text) || !lines.length) return data.text;
        const text: string[] = [];
        await abortable(worker.setParameters({ tessedit_char_whitelist: "0123456789.," }), signal);
        try {
          for (const line of lines) {
            signal.throwIfAborted();
            const words = line.words.map(word => ({ ...word }));
            const barcodeIndex = words.findIndex((word, index) => /[A-Z0-9]+[-~][A-Z0-9]+/i.test(word.text) && /^\d+[.,]/.test(words[index + 1]?.text ?? ""));
            if (barcodeIndex >= 0 && words.length >= barcodeIndex + 4) {
              for (const cell of words.slice(barcodeIndex + 1, barcodeIndex + 3)) {
                const padding = 12;
                const left = Math.max(0, cell.bbox.x0 - padding), top = Math.max(0, cell.bbox.y0 - padding);
                const candidates: { text: string; confidence: number }[] = [];
                for (const mode of [PSM.SINGLE_LINE, PSM.SINGLE_WORD]) {
                  await abortable(worker.setParameters({ tessedit_pageseg_mode: mode }), signal);
                  const { data: numeric } = await abortable(worker.recognize(prepared, { rectangle: {
                    left, top, width: Math.min(prepared.width, cell.bbox.x1 + padding) - left,
                    height: Math.min(prepared.height, cell.bbox.y1 + padding) - top,
                  } }), signal);
                  const value = numeric.text.trim();
                  if (/^(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(value)) candidates.push({ text: value, confidence: numeric.confidence });
                }
                candidates.sort((a, b) => b.confidence - a.confidence);
                cell.text = candidates[0]?.confidence >= 60 ? candidates[0].text : "?";
              }
            }
            text.push(words.map(word => word.text).join(" "));
          }
        } finally {
          if (!signal.aborted) await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, tessedit_char_whitelist: "" });
        }
        return text.join("\n");
      } finally { prepared.width = prepared.height = 0; }
    }
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
        const text = await recognizePage(canvas);
        signal.throwIfAborted();
        canvas.width = canvas.height = 0;
        return text;
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
        pages.push(await recognizePage(canvas));
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
