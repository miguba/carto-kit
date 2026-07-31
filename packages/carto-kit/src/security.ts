const secretPatterns = [
  /\bsk_(?:live|test)_[A-Za-z0-9_-]+\b/g,
  /("?(?:token|secret|authorization)"?\s*[:=]\s*["']?)([^\s"',}]+)/gi,
  /(Bearer\s+)([^\s]+)/gi
];

export function redactSensitive(value: unknown): string {
  let text = value instanceof Error ? value.message : String(value);
  for (const pattern of secretPatterns) text = text.replace(pattern, "$1[REDACTED]");
  return text;
}

export function safeError(error: unknown): Error {
  return new Error(redactSensitive(error));
}
