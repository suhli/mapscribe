export interface MapReadyTarget {
  loaded(): boolean;
  isStyleLoaded(): boolean;
  areTilesLoaded(): boolean;
  on(event: "idle", listener: () => void): void;
  off(event: "idle", listener: () => void): void;
}

/**
 * 等待样式、瓦片和空闲帧，而不是用固定延时猜测渲染完成。
 */
export function whenMapReady(map: MapReadyTarget, timeoutMs = 45_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`地图在 ${timeoutMs}ms 内没有进入可渲染状态`));
    }, timeoutMs);

    const onIdle = (): void => {
      if (map.loaded() && map.isStyleLoaded() && map.areTilesLoaded()) {
        cleanup();
        resolve();
      }
    };

    const cleanup = (): void => {
      clearTimeout(timer);
      map.off("idle", onIdle);
    };

    map.on("idle", onIdle);
    onIdle();
  });
}
