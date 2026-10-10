/** 生成稳定、可读的图层或项目 id。 */
export function createId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  const uuid = cryptoApi?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const compact = uuid.replace(/-/g, "").slice(0, 10);
  return `${prefix}-${compact}`;
}
