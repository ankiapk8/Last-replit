import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { decksTable } from "./decks";

export const mindMapsTable = pgTable("mind_maps", {
  id: serial("id").primaryKey(),
  deckId: integer("deck_id").notNull().references(() => decksTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  data: text("data").notNull(),
  cardCount: integer("card_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MindMap = typeof mindMapsTable.$inferSelect;
export type InsertMindMap = typeof mindMapsTable.$inferInsert;
