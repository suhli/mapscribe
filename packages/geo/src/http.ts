import { ProviderRequestError, type FetchLike } from "./types.js";
import { USER_AGENT } from "./policy.js";

export async function requestJson<T>(
  fetchFn: FetchLike,
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(init?.headers ?? {}),
      },
    });
    if (response.status === 429) {
      throw new ProviderRequestError("服务暂时限流，请稍后再试", 429);
    }
    if (!response.ok) {
      throw new ProviderRequestError(`服务返回 ${response.status}`, response.status);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderRequestError("请求超时");
    }
    throw new ProviderRequestError(error instanceof Error ? error.message : "网络请求失败");
  } finally {
    clearTimeout(timer);
  }
}
