/// <reference types="vite/client" />

import type { Intercept } from "./lib/types";

export interface SamuraiDemoApi {
  simulateDrop: (
    path: string,
    innerNames?: string[],
  ) => Promise<Intercept | null>;
}

declare global {
  interface Window {
    __SAMURAI_DEMO__?: SamuraiDemoApi;
  }
}

export {};
