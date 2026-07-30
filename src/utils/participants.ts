export function uniqueParticipants(participants: string[]): string[] {
  return Array.from(
    new Set(participants.map((participant) => participant.toLowerCase())),
  );
}
