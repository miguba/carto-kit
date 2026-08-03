import { CartoError } from "./errors.js";

export const OUTPUT_VERSION = 1 as const;

export interface CommandOutput {
  readonly json: boolean;
  success(command: string, data: Record<string, unknown>): void;
  result(command: string, ok: boolean, data: Record<string, unknown>): void;
  diagnostic(message: string): void;
  failure(command: string, error: CartoError): void;
}

export function createOutput(json: boolean): CommandOutput {
  return {
    json,
    success(command, data) {
      if (json) process.stdout.write(`${JSON.stringify({ version: OUTPUT_VERSION, ok: true, command, data })}\n`);
    },
    result(command, ok, data) {
      if (json) process.stdout.write(`${JSON.stringify({ version: OUTPUT_VERSION, ok, command, data })}\n`);
    },
    diagnostic(message) {
      process.stderr.write(`${message}\n`);
    },
    failure(command, error) {
      if (json) {
        process.stdout.write(`${JSON.stringify({
          version: OUTPUT_VERSION,
          ok: false,
          command,
          error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
            ...(error.details ? { details: error.details } : {})
          }
        })}\n`);
      } else {
        process.stderr.write(`Carto command failed: ${error.message}\n`);
      }
    }
  };
}
