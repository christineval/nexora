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
      if (name === "./receipt-table") return loadTs("src/lib/receipt-table.ts");
      if (name === "tesseract.js") return {
        PSM: { SINGLE_LINE: "7", SINGLE_WORD: "8", SINGLE_BLOCK: "6" },
        async createWorker(_language, _engine, options) {
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
