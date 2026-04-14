export function log(context: string, ...args: unknown[]): void {
  console.log(`[${new Date().toISOString()}] [${context}]`, ...args);
}
