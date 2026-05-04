import type { cardsTable } from "@workspace/db";

type DbCard = typeof cardsTable.$inferSelect;

export function serializeCard(card: DbCard): Record<string, unknown> {
  let parsedChoices: string[] | null = null;
  if (card.choices) {
    try {
      const parsed = JSON.parse(card.choices);
      if (Array.isArray(parsed) && parsed.every(x => typeof x === "string")) {
        parsedChoices = parsed;
      }
    } catch {
      parsedChoices = null;
    }
  }

  return {
    ...card,
    choices: parsedChoices,
    cardType: card.cardType ?? "basic",
    createdAt: card.createdAt.toISOString(),
  };
}
