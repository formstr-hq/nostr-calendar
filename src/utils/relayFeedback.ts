export function relayPublishFeedbackMessage(value: unknown): string {
  if (typeof value === "string") {
    return value || "accepted";
  }

  if (value instanceof AggregateError) {
    const messages = value.errors
      .map((error) => relayPublishFeedbackMessage(error))
      .filter(Boolean);
    return messages.length > 0 ? messages.join("; ") : value.message;
  }

  if (value instanceof Error) {
    return value.message || value.name;
  }

  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  if (value === undefined || value === null) {
    return "No relay feedback provided";
  }

  return String(value);
}
