import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { loadTs } from "./load-ts.mjs";

const loadPackage = createRequire(import.meta.url);

// Compile the actual TSX components for Node's renderer; mock only Next's router.
function loadComponent(path) {
  const source = readFileSync(resolve(path), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const compiledModule = { exports: {} };
  runInNewContext(outputText, {
    module: compiledModule,
    exports: compiledModule.exports,
    require: (name) => {
      if (name === "next/navigation") return { usePathname: () => "/inventory/products" };
      if (name === "@/lib/access") return loadTs("src/lib/access.ts");
      if (name.startsWith("@/")) return loadComponent("src/" + name.slice(2) + ".tsx");
      return loadPackage(name);
    },
  });
  return compiledModule.exports;
}

const { default: MobileNavigation } = loadComponent("src/components/layout/MobileNavigation.tsx");
const { default: Sidebar } = loadComponent("src/components/layout/Sidebar.tsx");

test("mobile menu starts collapsed and its button identifies the native dialog", () => {
  const html = renderToStaticMarkup(createElement(MobileNavigation));
  assert.match(html, /aria-label="Open navigation"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="mobile-navigation"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /<dialog[^>]*id="mobile-navigation"[^>]*aria-label="Navigation menu"/);
  assert.doesNotMatch(html, /<dialog[^>]*\sopen(?:\s|=|>)/);
  assert.match(html, /aria-label="Close navigation"/);
});

test("desktop and drawer navigation preserve the same destinations and active item", () => {
  const desktop = renderToStaticMarkup(createElement(Sidebar, { role: "ADMIN" }));
  const mobile = renderToStaticMarkup(createElement(Sidebar, { mobile: true, role: "ADMIN" }));
  const destinations = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(destinations(mobile), destinations(desktop));
  const productLink = mobile.match(/<a\b[^>]*>/g).find((link) => link.includes('href="/inventory/products"'));
  assert.match(productLink, /aria-current="page"/);
  assert.match(desktop, /aria-label="Main navigation"/);
  assert.match(mobile, /aria-label="Main navigation"/);
});
