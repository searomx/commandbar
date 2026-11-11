"use client";

import { create } from "zustand";

type UIState = {
  selectedId: number | null;
  closeIntent: boolean;
  select: (id: number, closeIntent?: boolean) => void;
  dismiss: () => void;
};

export const useUI = create<UIState>((set) => ({
  selectedId: null,
  closeIntent: false,
  select: (selectedId, closeIntent = false) => set({ selectedId, closeIntent }),
  dismiss: () => set({ selectedId: null, closeIntent: false }),
}));
