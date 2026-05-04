import { pgTable, text, serial, timestamp, integer, varchar, AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const qbanksTable = pgTable("qbanks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  parentId: integer("parent_id").references((): AnyPgColumn => qbanksTable.id, { onDelete: "set null" }),
  userId: varchar("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertQbankSchema = createInsertSchema(qbanksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQbank = z.infer<typeof insertQbankSchema>;
export type Qbank = typeof qbanksTable.$inferSelect;
