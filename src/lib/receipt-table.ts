export type ReceiptWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
export type ReceiptLine = { text: string; words: ReceiptWord[] };
export type ReceiptBaseline = { slope: number; intercept: number; height: number };

export function receiptBarcodeIndex(words: ReceiptWord[]) {
  return words.findIndex((word, index) => /[A-Z0-9]/i.test(word.text) && !/\s/.test(word.text) && index > 0
    && (words.length === index + 4 || /^[A-Z0-9]+(?:[-~][A-Z0-9./]+)+$/i.test(word.text))
    && words.length >= index + 4 && /^[\dOo]+[.,]/.test(words[index + 1]?.text ?? ""));
}

export function receiptOriginalQuantity(words: ReceiptWord[], barcodeIndex: number) {
  const unitIndex = words.slice(0, barcodeIndex).findIndex(word => /^(?:pcs?|pieces?|pairs?|reams?|packs?|boxes?|bottles?|sets?)$/i.test(word.text));
  if (unitIndex < 1) return "";
  const prefix = words.slice(0, unitIndex);
  const match = prefix.map(word => word.text).join(" ").match(/^[\s()\[\]{}|/\\.,:;-]*(\d+)[\s()\[\]{}|/\\.,:;-]*$/);
  return match && prefix.every(word => word.confidence >= 85) ? match[1] : "";
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function receiptQuantityColumns(lines: ReceiptLine[]) {
  if (!lines.some(line => /\b(?:qty|quantity|oty)\b/i.test(line.text))) return null;
  const barcodes = lines.flatMap(line => {
    const index = receiptBarcodeIndex(line.words);
    return index < 0 ? [] : [line.words[index]];
  });
  if (!barcodes.length) return null;
  const leftColumn = median(barcodes.map(word => word.bbox.x0)) * 0.4;
  const units = lines.flatMap(line => line.words.filter(word => /^(?:pcs?|pieces?|pairs?|reams?|packs?|boxes?|bottles?|sets?)$/i.test(word.text) && word.bbox.x1 < leftColumn));
  if (!units.length) return null;
  const quantityRight = Math.min(...units.map(word => word.bbox.x0)) - 8;
  if (quantityRight <= 0) return null;
  return { units, quantityRight, descriptionLeft: Math.max(...units.map(word => word.bbox.x1)) + 15 };
}

export function receiptRowBaseline(words: ReceiptWord[], descriptionLeft: number, barcodeIndex: number): ReceiptBaseline | null {
  const letters = words.slice(0, barcodeIndex).filter(word => word.bbox.x0 >= descriptionLeft && word.confidence >= 60 && /[A-Z]/i.test(word.text));
  if (letters.length < 2) return null;
  const x = letters.map(word => (word.bbox.x0 + word.bbox.x1) / 2);
  const y = letters.map(word => word.bbox.y1);
  const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
  const meanY = y.reduce((sum, value) => sum + value, 0) / y.length;
  const variance = x.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  const slope = variance ? x.reduce((sum, value, index) => sum + (value - meanX) * (y[index] - meanY), 0) / variance : 0;
  if (Math.abs(slope) > 0.2) return null;
  return { slope, intercept: meanY - slope * meanX, height: median(letters.map(word => word.bbox.y1 - word.bbox.y0)) };
}

export function receiptCell(source: HTMLCanvasElement, left: number, right: number, baseline: ReceiptBaseline, removeRedInk = false) {
  const padding = 8;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(right - left + 2 * padding);
  canvas.height = Math.ceil(baseline.height + 2 * padding);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not read this invoice cell.");
  context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.beginPath(); context.rect(padding, 0, right - left, canvas.height); context.clip();
  context.setTransform(1, -baseline.slope, 0, 1, padding - left, baseline.height + padding - baseline.intercept);
  context.drawImage(source, 0, 0);
  context.restore();
  if (removeRedInk) {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray = pixels.data[index] < 120 ? 0 : 255;
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = gray;
    }
    context.putImageData(pixels, 0, 0);
    const enlarged = document.createElement("canvas");
    enlarged.width = canvas.width * 2; enlarged.height = canvas.height * 2;
    const output = enlarged.getContext("2d");
    if (!output) throw new Error("Your browser could not read this quantity.");
    output.drawImage(canvas, 0, 0, enlarged.width, enlarged.height);
    canvas.width = canvas.height = 0;
    return enlarged;
  }
  return canvas;
}
