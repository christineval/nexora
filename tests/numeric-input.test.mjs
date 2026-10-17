import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";
const { acceptsNumericText, numericInputProps } = loadTs("src/lib/numeric-input.ts");

test("quantities allow digits and clearing; prices also allow a decimal point", () => {
  for (const value of ["", "0", "123"]) assert.equal(acceptsNumericText(value), true);
  for (const value of ["1.25", ".5", "1."]) {
    assert.equal(acceptsNumericText(value), false);
    assert.equal(acceptsNumericText(value, true), true);
  }
  for (const value of ["abc", "12abc", "1e3", "-1", "+1", "1 2", "1,000", "1.2.3"]) {
    assert.equal(acceptsNumericText(value), false);
    assert.equal(acceptsNumericText(value, true), false);
  }
});

test("numeric controls block invalid typing, paste, drop, and mobile text input while keeping editing shortcuts", () => {
  for (const decimal of [false, true]) {
    const props = numericInputProps(decimal);
    for (const key of ["a", "e", "E", "-", "+", " "]) {
      let blocked = false;
      props.onKeyDown({ key, preventDefault() { blocked = true; } });
      assert.equal(blocked, true);
    }
    for (const event of [{ key: "1" }, { key: "Backspace" }, { key: "ArrowLeft" }, { key: "a", ctrlKey: true }, { key: "v", metaKey: true }]) {
      props.onKeyDown({ ...event, preventDefault() { assert.fail("Editing shortcut was blocked"); } });
    }
    for (const method of ["onPaste", "onDrop", "onBeforeInput"]) {
      let blocked = false;
      props[method]({ clipboardData: { getData: () => "1e3" }, dataTransfer: { getData: () => "1e3" }, nativeEvent: { data: "1e3" }, preventDefault() { blocked = true; } });
      assert.equal(blocked, true);
    }
  }
});
