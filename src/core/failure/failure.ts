export abstract class Failure {
  abstract readonly code: string;
  abstract readonly messageKey: string;
}