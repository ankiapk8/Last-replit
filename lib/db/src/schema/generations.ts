import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const generationsTable = pgTable("generations", {
  id: serial("id").primaryKey(),
  deckName: text("deck_name").notNull(),
  deckType: text("deck_type").notNull(),
  status: text("status").notNull(),
  cardsGenerated: integer("cards_generated").notNull().default(0),
  pageCount: integer("page_count").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  customPrompt: text("custom_prompt"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type Generation = typeof generationsTable.$inferSelect;
export type InsertGeneration = typeof generationsTable.$inferInsert;
