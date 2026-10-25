import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";

test("the shared mutation hook blocks guest submissions before requests, notifications or refreshes", async () => {
  const unexpected = () => assert.fail("Guest preview attempted a mutation side effect");
  const { default: useMutation } = loadTs("src/components/ui/use-mutation.ts", {
    react: { useRef: () => ({ current: false }), useState: () => [false, unexpected] },
    "./GuestPreviewProvider": { useGuestPreview: () => true },
    "next/navigation": { useRouter: () => ({ refresh: unexpected }) },
    "./SnackbarProvider": { useNotifications: () => ({ notify: unexpected, dismiss: unexpected }) },
  });
  const mutation = useMutation();
  await mutation.submit("/api/products", "POST", { name: "Guest draft" }, unexpected);
  await mutation.submit("/api/purchases/910001", "PATCH", { action: "complete" }, unexpected);
  assert.equal(mutation.saving, false);
});
