export function uniqueParticipants(participants: string[]): string[] {
  return Array.from(
    new Set(participants.map((participant) => participant.toLowerCase())),
  );
}

/** Normalize, lowercase, and dedupe email guests. */
export function uniqueEmails(emails: string[]): string[] {
  return Array.from(
    new Set(
      emails
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0),
    ),
  );
}
