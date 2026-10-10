export interface Result {
  ok: boolean;
  command: string;
  message?: string;
  [key: string]: unknown;
}

export function printResult(result: Result, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (result.message) process.stdout.write(`${result.message}\n`);
}
