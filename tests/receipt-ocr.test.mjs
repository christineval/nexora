import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { loadTs } from "./load-ts.mjs";

test("OCR keeps initialization, page recognition and row review progress distinct while rereading uncertain supplier codes", async () => {
  const progress = [];
  let recognitionCount = 0;
  let terminated = false;
  const word = (text, confidence = 95) => ({ text, confidence, bbox: { x0: 100, y0: 100, x1: 200, y1: 120 } });
  const words = [word("2"), word("PCS"), word("Widget"), word("BP-T8R-R", 65), word("0.00"), word("3.00"), word("6.00")];
  const exports = {};
  const { outputText } = ts.transpileModule(readFileSync("src/lib/receipt-ocr.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  runInNewContext(outputText, {
    exports, DOMException, AbortController,
    createImageBitmap: async () => ({ width: 1000, height: 1000, close() {} }),
    document: { createElement: () => ({ width: 1000, height: 1000, getContext: () => ({ fillRect() {}, drawImage() {} }) }) },
    require(name) {
      if (name === "./receipt-image") return { prepareReceiptImage: canvas => canvas };
      if (name === "./receipt-input") return { loadReceiptCanvas: async () => ({ width: 1000, height: 1000 }) };
      if (name === "./purchase-import") return loadTs("src/lib/purchase-import.ts");
      if (name === "./receipt-table") return loadTs("src/lib/receipt-table.ts");
      if (name === "tesseract.js") return {
        PSM: { SINGLE_LINE: "7", SINGLE_WORD: "8", SINGLE_BLOCK: "6" },
        async createWorker(_language, _engine, options) {
          assert.equal(options.workerBlobURL, false);
          options.logger({ status: "loading language traineddata", progress: 1 });
          return {
            async setParameters() {},
            async recognize() {
              options.logger({ status: "recognizing text", progress: 0.25 });
              options.logger({ status: "recognizing text", progress: 1 });
              recognitionCount++;
              return recognitionCount === 1
                ? { data: { text: "DESCRIPTION BARCODE DISC UNIT PRICE TOTAL", blocks: [{ paragraphs: [{ lines: [{ text: "BARCODE", words: [] }, { text: "Widget", words }] }] }] } }
                : { data: { text: "BP-TBR-R\n", confidence: 98 } };
            },
            async terminate() { terminated = true; },
          };
        },
      };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  const result = await exports.readReceipt({ type: "image/jpeg", size: 100 }, message => progress.push(message), new AbortController().signal);
  assert.match(result, /BP-TBR-R/);
  assert.doesNotMatch(progress[0], /100%/);
  assert.equal(progress.filter(message => /recognition stage/.test(message)).length, 2);
  assert.ok(progress.some(message => /checking rows 2 of 2 \(100% of row review\)/.test(message)));
  assert.equal(progress.at(-1), "Invoice extraction complete: 100%");
  assert.equal(recognitionCount, 2);
  assert.equal(terminated, true);
});

test("PDF OCR uses the compatibility worker, bounds page canvases and cleans up on success or failure", async () => {
  for (const fail of [false, true]) {
    const exports = {}, canvases = [];
    let destroyed = false, cleaned = false, terminated = false;
    const pdfjs = {
      GlobalWorkerOptions: {},
      getDocument() {
        assert.equal(pdfjs.GlobalWorkerOptions.workerSrc, "/ocr/pdf.worker.legacy.min.mjs");
        return {
          promise: Promise.resolve({ numPages: 1, async getPage() { return {
            getViewport: ({ scale }) => ({ width: 4000 * scale, height: 6000 * scale }),
            render({ canvas }) {
              assert.ok(canvas.width <= 2800 && canvas.height <= 2800);
              return { promise: fail ? Promise.reject(new Error("render failed")) : Promise.resolve() };
            },
            cleanup() { cleaned = true; },
          }; } }),
          async destroy() { destroyed = true; },
        };
      },
    };
    const { outputText } = ts.transpileModule(readFileSync("src/lib/receipt-ocr.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
    runInNewContext(outputText, {
      exports, DOMException,
      document: { createElement() { const canvas = { width: 0, height: 0 }; canvases.push(canvas); return canvas; } },
      require(name) {
        if (name === "./receipt-image") return { prepareReceiptImage: canvas => canvas };
        if (name === "./receipt-input") return loadTs("src/lib/receipt-input.ts");
        if (name === "./purchase-import") return loadTs("src/lib/purchase-import.ts");
        if (name === "./receipt-table") return {};
        if (name === "pdfjs-dist/legacy/build/pdf.mjs") return pdfjs;
        if (name === "tesseract.js") return { async createWorker() { return {
          async setParameters() {},
          async recognize() { return { data: { text: "Widget 2 3.00 6.00" } }; },
          async terminate() { terminated = true; },
        }; } };
        throw new Error(`Unexpected import ${name}`);
      },
    });
    const reading = exports.readReceipt({ type: "application/pdf", size: 100, arrayBuffer: async () => new ArrayBuffer(0) }, () => {}, new AbortController().signal);
    if (fail) await assert.rejects(reading, /render failed/);
    else assert.match(await reading, /Widget/);
    assert.equal(destroyed, true);
    assert.equal(cleaned, true);
    assert.equal(terminated, true);
    assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  }
});

test("JPEG OCR retries the original image only when the enhanced pass finds no product rows", async () => {
  for (const retryText of ["Keyboard 2 3.00 6.00", "Unreadable photo"]) {
    const exports = {}, progress = [];
    const original = { width: 2800, height: 2100 };
    const enhanced = { width: 2800, height: 2100 };
    let reads = 0, terminated = false;
    const { outputText } = ts.transpileModule(readFileSync("src/lib/receipt-ocr.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
    runInNewContext(outputText, {
      exports, DOMException,
      require(name) {
        if (name === "./receipt-image") return { prepareReceiptImage: () => enhanced };
        if (name === "./receipt-input") return { loadReceiptCanvas: async () => original };
        if (name === "./purchase-import") return loadTs("src/lib/purchase-import.ts");
        if (name === "./receipt-table") return {};
        if (name === "tesseract.js") return { PSM: { AUTO: "3" }, async createWorker() { return {
          async setParameters(parameters) {
            if (reads) assert.equal(parameters.tessedit_pageseg_mode, "3");
          },
          async recognize(canvas) {
            assert.equal(canvas, reads ? original : enhanced);
            return { data: { text: reads++ ? retryText : "Supplier name only" } };
          },
          async terminate() { terminated = true; },
        }; } };
        throw new Error(`Unexpected import ${name}`);
      },
    });
    const text = await exports.readReceipt({ type: "image/jpeg", size: 100 }, message => progress.push(message), new AbortController().signal);
    assert.equal(text, retryText.startsWith("Keyboard") ? retryText : "Supplier name only");
    assert.equal(reads, 2);
    assert.ok(progress.some(message => /Retrying the original image/.test(message)));
    assert.equal(terminated, true);
    assert.equal(original.width, 0);
    assert.equal(enhanced.width, 0);
  }
});
