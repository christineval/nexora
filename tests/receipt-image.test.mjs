import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";
const { thresholdReceipt, receiptSkew } = loadTs("src/lib/receipt-image.ts");

test("local contrast removes uneven paper lighting while preserving dark text", () => {
  const width = 240, height = 120;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const value = x >= 100 && x <= 105 && y > 30 && y < 90 ? 35 : 150 + Math.round(x / 3);
      pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
      pixels[i + 3] = 255;
    }
  }
  thresholdReceipt(pixels, width, height);
  assert.equal(pixels[(60 * width + 102) * 4], 0);
  assert.equal(pixels[(60 * width + 40) * 4], 255);
  assert.equal(pixels[(60 * width + 210) * 4], 255);
});

test("skew detection corrects tilted rows and leaves blank or straight pages alone", () => {
  const width = 400, height = 240;
  function page(angle) {
    const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
    for (const baseline of [50, 100, 150]) {
      for (let x = 20; x < 380; x++) {
        if (x % 20 > 12) continue;
        const y = Math.round(baseline + x * Math.tan(angle * Math.PI / 180));
        for (let dy = 0; dy < 3; dy++) pixels[((y + dy) * width + x) * 4] = 0;
      }
    }
    return pixels;
  }
  assert.equal(receiptSkew(new Uint8ClampedArray(width * height * 4).fill(255), width, height), 0);
  assert.equal(receiptSkew(page(0), width, height), 0);
  assert.ok(Math.abs(receiptSkew(page(-10), width, height) + 10) <= 0.5);
  assert.ok(Math.abs(receiptSkew(page(8), width, height) - 8) <= 0.5);
});

test("pink highlighter backgrounds are removed while dark printed text is preserved", () => {
  const width = 180, height = 90;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    const ink = x >= 70 && x < 76 && y >= 30 && y < 60;
    pixels.set(ink ? [35, 25, 30, 255] : [250, 80, 175, 255], index);
  }
  thresholdReceipt(pixels, width, height);
  assert.equal(pixels[(45 * width + 73) * 4], 0);
  assert.equal(pixels[(45 * width + 40) * 4], 255);
});
