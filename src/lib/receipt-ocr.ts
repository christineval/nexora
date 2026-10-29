import { prepareReceiptImage } from "./receipt-image";
import { loadReceiptCanvas, receiptCanvasSize } from "./receipt-input";
import { parsePurchaseText } from "./purchase-import";
import { receiptBarcodeIndex, receiptCell, receiptOriginalQuantity, receiptQuantityColumns, receiptRowBaseline } from "./receipt-table";

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
  let recognizingPage = false;
  let workerReady = false;
  let pageLabel = "Invoice";
  const creatingWorker = createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js", corePath: "/ocr/core", langPath: "/ocr/lang",
    workerBlobURL: false,
    logger: message => {
      if (signal.aborted) return;
      if (recognizingPage && message.status === "recognizing text") onProgress(`${pageLabel}: recognizing text ${Math.min(100, Math.max(0, Math.round(message.progress * 100)))}% (recognition stage)`);
      else if (!workerReady) onProgress("Preparing OCR engine...");
    },
    errorHandler: () => {},
  });
  // A worker still loading at cancellation must be released once initialization finishes.
  void creatingWorker.then(worker => { if (signal.aborted) void worker.terminate(); }, () => {});
  const worker = await abortable(creatingWorker, signal);
  workerReady = true;
  const stop = () => { void worker.terminate(); };
  signal.addEventListener("abort", stop, { once: true });
  try {
    signal.throwIfAborted();
    await abortable(worker.setParameters({ preserve_interword_spaces: "1", user_defined_dpi: "300" }), signal);
    async function recognizePage(canvas: HTMLCanvasElement) {
      onProgress("Enhancing contrast and straightening the invoice...");
      const prepared = prepareReceiptImage(canvas);
      let color: HTMLCanvasElement | undefined;
      try {
        signal.throwIfAborted();
        recognizingPage = true;
        const { data } = await abortable(worker.recognize(prepared, {}, { text: true, blocks: true }), signal);
        recognizingPage = false;
        const lines = data.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? [];
        // Read price cells independently so neighboring columns cannot alter their digits.
        if (!/\bbarcode\b/i.test(data.text) || !lines.length) return data.text;
        const columns = receiptQuantityColumns(lines);
        if (columns) color = prepareReceiptImage(canvas, true);
        const text: string[] = [];
        await abortable(worker.setParameters({ tessedit_char_whitelist: "0123456789.," }), signal);
        try {
          for (const [lineIndex, line] of lines.entries()) {
            signal.throwIfAborted();
            const rowProgress = () => onProgress(`${pageLabel}: checking rows ${lineIndex + 1} of ${lines.length} (${Math.round((lineIndex + 1) / lines.length * 100)}% of row review)`);
            const words = line.words.map(word => ({ ...word }));
            const barcodeIndex = receiptBarcodeIndex(words);
            if (barcodeIndex >= 0 && words.length >= barcodeIndex + 4) {
              const code = words[barcodeIndex];
              if (code.confidence < 90) {
                await abortable(worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: "" }), signal);
                const left = Math.max(0, code.bbox.x0 - 8), top = Math.max(0, code.bbox.y0 - 8);
                const { data: reread } = await abortable(worker.recognize(prepared, { rectangle: {
                  left, top, width: Math.min(prepared.width, code.bbox.x1 + 8) - left,
                  height: Math.min(prepared.height, code.bbox.y1 + 8) - top,
                } }), signal);
                const value = reread.text.trim();
                if (/^\S+$/.test(value) && reread.confidence > code.confidence) code.text = value;
              }
              for (const cell of words.slice(barcodeIndex + 1, barcodeIndex + 3)) {
                if (cell.confidence >= 85 && /^(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(cell.text)) continue;
                const padding = 12;
                const left = Math.max(0, cell.bbox.x0 - padding), top = Math.max(0, cell.bbox.y0 - padding);
                const candidates: { text: string; confidence: number }[] = [];
                for (const mode of [PSM.SINGLE_LINE, PSM.SINGLE_WORD]) {
                  await abortable(worker.setParameters({ tessedit_pageseg_mode: mode, tessedit_char_whitelist: "0123456789.," }), signal);
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
              const baseline = columns && receiptRowBaseline(words, columns.descriptionLeft, barcodeIndex);
              if (columns && baseline) {
                onProgress("Reading product quantities and descriptions...");
                const descriptionWords = words.slice(0, barcodeIndex).filter(word => word.bbox.x0 >= columns.descriptionLeft);
                const descriptionRight = Math.min(words[barcodeIndex].bbox.x0 - 15, Math.max(...descriptionWords.map(word => word.bbox.x1)) + 5);
                const unit = [...columns.units].sort((a, b) => {
                  const distance = (word: typeof a) => Math.abs(word.bbox.y1 - (baseline.intercept + baseline.slope * (word.bbox.x0 + word.bbox.x1) / 2));
                  return distance(a) - distance(b);
                })[0];
                const unitDistance = unit.bbox.y1 - (baseline.intercept + baseline.slope * (unit.bbox.x0 + unit.bbox.x1) / 2);
                const quantityBaseline = Math.abs(unitDistance) < baseline.height / 2 ? { ...baseline, intercept: baseline.intercept + unitDistance } : baseline;
                const descriptionCell = receiptCell(prepared, columns.descriptionLeft, descriptionRight, baseline);
                const quantityCell = receiptCell(color ?? prepared, 0, columns.quantityRight, quantityBaseline, true);
                try {
                  await abortable(worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: "" }), signal);
                  const { data: description } = await abortable(worker.recognize(descriptionCell), signal);
                  const quantities: { text: string; confidence: number }[] = [];
                  for (const mode of [PSM.SINGLE_LINE, PSM.SINGLE_WORD]) {
                    await abortable(worker.setParameters({ tessedit_pageseg_mode: mode, tessedit_char_whitelist: "0123456789" }), signal);
                    const { data: quantity } = await abortable(worker.recognize(quantityCell), signal);
                    if (/^\d+$/.test(quantity.text.trim())) quantities.push({ text: quantity.text.trim(), confidence: quantity.confidence });
                  }
                  quantities.sort((a, b) => b.confidence - a.confidence);
                  const quantity = quantities[0]?.confidence >= 60 ? quantities[0].text : receiptOriginalQuantity(words, barcodeIndex) || "?";
                  const name = description.confidence >= 60 && description.text.trim()
                    ? description.text.trim()
                    : words.slice(0, barcodeIndex).filter(word => word.bbox.x0 >= columns.descriptionLeft).map(word => word.text).join(" ");
                  text.push([quantity, name, ...words.slice(barcodeIndex).map(word => word.text)].join(" "));
                  rowProgress();
                  continue;
                } finally {
                  descriptionCell.width = descriptionCell.height = quantityCell.width = quantityCell.height = 0;
                }
              }
            }
            text.push(words.map(word => word.text).join(" "));
            rowProgress();
          }
        } finally {
          if (!signal.aborted) await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, tessedit_char_whitelist: "" });
        }
        return text.join("\n");
      } finally {
        prepared.width = prepared.height = 0;
        if (color) color.width = color.height = 0;
      }
    }
    if (file.type !== "application/pdf") {
      onProgress("Preparing invoice image...");
      const canvas = await loadReceiptCanvas(file, signal);
      try {
        let text = await recognizePage(canvas);
        if (!parsePurchaseText(text, []).length) {
          signal.throwIfAborted();
          onProgress("No product rows found yet. Retrying the original image...");
          await abortable(worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, tessedit_char_whitelist: "" }), signal);
          recognizingPage = true;
          // Some phone photos lose small digits during contrast enhancement or table reconstruction.
          const { data: original } = await abortable(worker.recognize(canvas, {}, { text: true }), signal);
          recognizingPage = false;
          if (parsePurchaseText(original.text, []).length) text = original.text;
        }
        signal.throwIfAborted();
        onProgress("Invoice extraction complete: 100%");
        return text;
      } finally { canvas.width = canvas.height = 0; }
    }
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.legacy.min.mjs";
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
        pageLabel = `PDF page ${index} of ${pdf.numPages}`;
        const page = await pdf.getPage(index);
        const original = page.getViewport({ scale: 2 });
        const size = receiptCanvasSize(original.width, original.height);
        const viewport = page.getViewport({ scale: 2 * Math.min(size.width / original.width, size.height / original.height) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        try {
          await abortable(page.render({ canvas, viewport }).promise, signal);
          pages.push(await recognizePage(canvas));
        } finally {
          canvas.width = canvas.height = 0;
          page.cleanup();
        }
      }
      onProgress("Invoice extraction complete: 100%");
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
