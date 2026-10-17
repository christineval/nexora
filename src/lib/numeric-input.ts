import type { FormEvent, KeyboardEvent, ClipboardEvent, DragEvent } from "react";

export function acceptsNumericText(value: string, decimal = false) {
  return (decimal ? /^\d*(\.\d*)?$/ : /^\d*$/).test(value);
}

export function numericInputProps(decimal = false) {
  return {
    inputMode: decimal ? "decimal" as const : "numeric" as const,
    onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
      if (!acceptsNumericText(event.key, decimal)) event.preventDefault();
    },
    onBeforeInput(event: FormEvent<HTMLInputElement>) {
      const data = (event.nativeEvent as InputEvent).data;
      if (data && !acceptsNumericText(data, decimal)) event.preventDefault();
    },
    onPaste(event: ClipboardEvent<HTMLInputElement>) {
      if (!acceptsNumericText(event.clipboardData.getData("text"), decimal)) event.preventDefault();
    },
    onDrop(event: DragEvent<HTMLInputElement>) {
      if (!acceptsNumericText(event.dataTransfer.getData("text"), decimal)) event.preventDefault();
    },
  };
}
