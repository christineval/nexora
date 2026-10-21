import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const requirePackage = createRequire(import.meta.url);
export function loadTs(path, mocks = {}, cache = new Map()) {
  const absolute = resolve(path);
  if (cache.has(absolute)) return cache.get(absolute);
  const compiledModule = { exports: {} }; cache.set(absolute, compiledModule.exports);
  const { outputText } = ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  runInNewContext(outputText, {
    module: compiledModule, exports: compiledModule.exports, Buffer, Date, console, URL, URLSearchParams, Response, Request, setTimeout, process,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? resolve("src", name.slice(2)) : resolve(dirname(absolute), name);
        const file = existsSync(base + ".ts") ? base + ".ts" : base + ".tsx";
        return loadTs(file, mocks, cache);
      }
      return requirePackage(name);
    },
  });
  return compiledModule.exports;
}
