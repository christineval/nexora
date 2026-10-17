import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "public", "ocr");
await mkdir(join(output, "core"), { recursive: true });
await mkdir(join(output, "lang"), { recursive: true });
await copyFile(join(root, "node_modules/tesseract.js/dist/worker.min.js"), join(output, "worker.min.js"));
await copyFile(join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"), join(output, "pdf.worker.min.mjs"));
await copyFile(join(root, "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"), join(output, "lang/eng.traineddata.gz"));
await copyFile(join(root, "node_modules/tesseract.js/LICENSE.md"), join(output, "TESSERACT-LICENSE.txt"));
await copyFile(join(root, "node_modules/tesseract.js-core/LICENSE"), join(output, "TESSERACT-CORE-LICENSE.txt"));
await copyFile(join(root, "node_modules/pdfjs-dist/LICENSE"), join(output, "PDFJS-LICENSE.txt"));
const core = join(root, "node_modules/tesseract.js-core");
for (const name of await readdir(core)) {
  if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(name)) await copyFile(join(core, name), join(output, "core", name));
}
console.log("Local OCR assets are ready.");
