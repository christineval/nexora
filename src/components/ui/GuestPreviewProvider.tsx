"use client";

import { createContext, useContext } from "react";

const GuestPreviewContext = createContext(false);

export function useGuestPreview() {
  return useContext(GuestPreviewContext);
}

export default function GuestPreviewProvider({ guest, children }: { guest: boolean; children: React.ReactNode }) {
  return <GuestPreviewContext.Provider value={guest}>{children}</GuestPreviewContext.Provider>;
}
