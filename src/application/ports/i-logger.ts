export interface ILogger {
  warn(context: Record<string, unknown>, message: string): void;
}
