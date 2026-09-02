export interface LoggerInterface {
  warn(context: Record<string, unknown>, message: string): void;
}
