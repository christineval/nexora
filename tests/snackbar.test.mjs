import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./load-ts.mjs";

const { SnackbarMessage } = loadTs("src/components/ui/SnackbarProvider.tsx");

test("notifications identify severity with accessible text and announce errors urgently", () => {
  for (const [severity, label, role] of [["success", "Success", "status"], ["error", "Error", "alert"], ["warning", "Warning", "alert"], ["info", "Information", "status"]]) {
    const html = renderToStaticMarkup(createElement(SnackbarMessage, {
      notification: { id: 1, severity, message: "Order feedback <script>" },
      onDismiss() {},
    }));
    assert.match(html, new RegExp(`role="${role}"`));
    assert.ok(html.includes(label));
    assert.match(html, /aria-label="Dismiss notification"/);
    assert.match(html, /Order feedback &lt;script&gt;/);
  }
});
