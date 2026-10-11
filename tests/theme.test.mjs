import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { getTheme, getServerTheme, setTheme, subscribeTheme, themeInitializationScript } from "../src/lib/theme.ts";

function setup(t, saved = {}, blocked = false) {
  const values = new Map(Object.entries(saved));
  const document = { documentElement: { dataset: { theme: "dark" } } };
  const localStorage = {
    getItem(key) {
      if (blocked) throw new Error("Storage blocked");
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (blocked) throw new Error("Storage blocked");
      values.set(key, value);
    },
  };
  const window = new EventTarget();
  for (const [key, value] of Object.entries({ document, localStorage, window })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  }
  return {
    values,
    initialize() { runInNewContext(themeInitializationScript, { document, localStorage }); },
    storageEvent(key) {
      const event = new Event("storage");
      Object.defineProperty(event, "key", { value: key });
      window.dispatchEvent(event);
    },
  };
}

test("restores the app preference before paint and preserves the server snapshot", (t) => {
  const browser = setup(t, { "nexora-theme": "light" });
  browser.initialize();
  assert.equal(getTheme(), "light");
  assert.equal(getServerTheme(), "dark");
});

test("keeps the saved login preference when adopting the shared theme", (t) => {
  const browser = setup(t, { "erp-lite-login-theme": "light" });
  browser.initialize();
  assert.equal(getTheme(), "light");
  setTheme("dark");
  browser.initialize();
  assert.equal(getTheme(), "dark");
  assert.equal(browser.values.get("nexora-theme"), "dark");
});

test("switches all subscribers and restores the selection on a new page load", (t) => {
  const browser = setup(t);
  let loginTheme;
  let erpTheme;
  const unsubscribeLogin = subscribeTheme(() => { loginTheme = getTheme(); });
  const unsubscribeErp = subscribeTheme(() => { erpTheme = getTheme(); });
  setTheme("light");
  assert.equal(loginTheme, "light");
  assert.equal(erpTheme, "light");
  assert.equal(browser.values.get("nexora-theme"), "light");
  browser.initialize();
  assert.equal(getTheme(), "light");
  unsubscribeLogin();
  unsubscribeErp();
});

test("synchronizes preferences across tabs and removes listeners on unsubscribe", (t) => {
  const browser = setup(t);
  let notifications = 0;
  const unsubscribe = subscribeTheme(() => { notifications++; });
  browser.values.set("nexora-theme", "light");
  browser.storageEvent("unrelated-key");
  assert.equal(getTheme(), "dark");
  assert.equal(notifications, 0);
  browser.storageEvent("nexora-theme");
  assert.equal(getTheme(), "light");
  assert.equal(notifications, 1);
  unsubscribe();
  setTheme("dark");
  browser.storageEvent("nexora-theme");
  assert.equal(notifications, 1);
});

test("uses a safe default for malformed or cleared preferences", (t) => {
  const browser = setup(t, { "nexora-theme": "invalid" });
  browser.initialize();
  assert.equal(getTheme(), "dark");
  const unsubscribe = subscribeTheme(() => {});
  setTheme("light");
  browser.values.clear();
  browser.storageEvent(null);
  assert.equal(getTheme(), "dark");
  unsubscribe();
});

test("still switches and notifies subscribers when localStorage is blocked", (t) => {
  const browser = setup(t, {}, true);
  browser.initialize();
  let notifications = 0;
  const unsubscribe = subscribeTheme(() => { notifications++; });
  setTheme("light");
  assert.equal(getTheme(), "light");
  assert.equal(notifications, 1);
  unsubscribe();
});

 test("preserves the previous project's theme preference during rebranding", (t) => {
  const browser = setup(t, { "erp-lite-theme": "light" });
  browser.initialize();
  assert.equal(getTheme(), "light");
  setTheme("dark");
  assert.equal(browser.values.get("nexora-theme"), "dark");
  browser.initialize();
  assert.equal(getTheme(), "dark");
});
