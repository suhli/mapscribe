/// <reference types="vite/client" />

interface RenderState {
  status: "idle" | "pending" | "ready" | "error";
  message?: string;
  warnings: string[];
  width?: number;
  height?: number;
  objects: Array<{ id: string; type: string }>;
  fontLoaded: boolean;
  labelInkPixels: number;
  attribution: string[];
}

interface Window {
  __mapscribeState: RenderState;
  __mapscribe: {
    render(project: unknown): Promise<void>;
    exportDataUrl(): string;
  };
}
