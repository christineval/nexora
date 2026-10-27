function receiptInkGray(data: Uint8ClampedArray, index: number) {
  const light = Math.max(data[index], data[index + 1], data[index + 2]);
  // The lightest channel keeps colored highlighters from becoming dark ink.
  return light;
}

// Local thresholding removes uneven lighting without treating a paper fold as ink.
export function thresholdReceipt(data: Uint8ClampedArray, width: number, height: number, binary = true) {
  const stride = width + 1;
  const sums = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const gray = receiptInkGray(data, index);
      row += gray;
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  const radius = Math.max(15, Math.round(width / 60));
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - radius), bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius), right = Math.min(width, x + radius + 1);
      const mean = (sums[bottom * stride + right] - sums[top * stride + right] - sums[bottom * stride + left] + sums[top * stride + left]) / ((right - left) * (bottom - top));
      const index = (y * width + x) * 4;
      const gray = receiptInkGray(data, index);
      const value = binary ? (gray < mean - 14 ? 0 : 255) : Math.max(0, Math.min(255, 255 + (gray - mean - 4) * 3));
      data[index] = data[index + 1] = data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
}

export function receiptSkew(data: Uint8ClampedArray, width: number, height: number) {
  const points: [number, number][] = [];
  const step = Math.max(1, Math.ceil(width / 800));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (data[(y * width + x) * 4] === 0) points.push([x / step, y / step]);
    }
  }
  if (points.length < 100) return 0;
  const offset = Math.ceil(width / step);
  const bins = new Uint32Array(Math.ceil(height / step) + 2 * offset + 2);
  let bestAngle = 0, bestScore = 0, straightScore = 0;
  for (let degrees = -20; degrees <= 20; degrees += 0.5) {
    bins.fill(0);
    const slope = Math.tan(degrees * Math.PI / 180);
    for (const [x, y] of points) bins[Math.round(y - x * slope) + offset]++;
    let score = 0;
    for (const count of bins) score += count * count;
    if (degrees === 0) straightScore = score;
    if (score > bestScore) { bestScore = score; bestAngle = degrees; }
  }
  return bestScore > straightScore * 1.12 ? bestAngle : 0;
}

export function prepareReceiptImage(source: HTMLCanvasElement, retainColor = false): HTMLCanvasElement {
  const scale = 2800 / Math.max(source.width, source.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Your browser could not prepare this image.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  thresholdReceipt(pixels.data, canvas.width, canvas.height);
  const angle = receiptSkew(pixels.data, canvas.width, canvas.height) * Math.PI / 180;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (!retainColor) {
    const enhanced = context.getImageData(0, 0, canvas.width, canvas.height);
    thresholdReceipt(enhanced.data, canvas.width, canvas.height, false);
    context.putImageData(enhanced, 0, 0);
  }
  if (!angle) return canvas;
  const rotated = document.createElement("canvas");
  rotated.width = Math.ceil(canvas.width * Math.cos(angle) + canvas.height * Math.abs(Math.sin(angle)));
  rotated.height = Math.ceil(canvas.height * Math.cos(angle) + canvas.width * Math.abs(Math.sin(angle)));
  const output = rotated.getContext("2d");
  if (!output) throw new Error("Your browser could not straighten this image.");
  output.fillStyle = "white"; output.fillRect(0, 0, rotated.width, rotated.height);
  output.translate(rotated.width / 2, rotated.height / 2);
  output.rotate(-angle);
  output.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  canvas.width = canvas.height = 0;
  return rotated;
}
