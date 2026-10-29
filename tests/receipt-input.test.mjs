import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function harness({ fail = false, pending = false } = {}) {
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage(...args) { calls.push(args); } }) };
  const calls = [], revoked = [];
  const compiledModule = { exports: {} };
  const { outputText } = ts.transpileModule(readFileSync("src/lib/receipt-input.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  runInNewContext(outputText, {
    module: compiledModule, exports: compiledModule.exports, DOMException,
    URL: { createObjectURL: () => "blob:invoice", revokeObjectURL: url => revoked.push(url) },
    Image: class {
      naturalWidth = 8000;
      naturalHeight = 6000;
      set src(value) { if (value && !pending) queueMicrotask(() => fail ? this.onerror?.() : this.onload?.()); }
    },
    document: { createElement: () => canvas },
  });
  return { ...compiledModule.exports, canvas, calls, revoked };
}

test("large phone photos are scaled before canvas allocation without createImageBitmap", async () => {
  const h = harness();
  const canvas = await h.loadReceiptCanvas({}, new AbortController().signal);
  assert.equal(canvas.width, 2800);
  assert.equal(canvas.height, 2100);
  assert.deepEqual(h.calls[0].slice(1), [0, 0, 2800, 2100]);
  assert.deepEqual(h.revoked, ["blob:invoice"]);
  assert.equal(h.receiptCanvasSize(600, 800).height, 800);
  assert.throws(() => h.receiptCanvasSize(0, 800));
});

test("image decode errors and cancellation release the object URL and canvas", async () => {
  for (const options of [{ fail: true }, { pending: true }]) {
    const h = harness(options);
    const controller = new AbortController();
    const reading = h.loadReceiptCanvas({}, controller.signal);
    if (options.pending) controller.abort();
    await assert.rejects(reading, options.pending ? /cancelled/ : /JPEG or PNG/);
    assert.deepEqual(h.revoked, ["blob:invoice"]);
    assert.equal(h.canvas.width, 0);
    assert.equal(h.canvas.height, 0);
  }
});
