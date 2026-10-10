/** 保证对公开地理服务的请求间隔。 */
export class RateLimiter {
  private tail: Promise<void> = Promise.resolve();
  private last = 0;

  constructor(private readonly minIntervalMs: number) {}

  async schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const wait = this.minIntervalMs - (Date.now() - this.last);
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      this.last = Date.now();
    });
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    await run;
    return task();
  }
}
