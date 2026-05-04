import { jsonb, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const userTopicsTable = pgTable(
  "user_topics",
  {
    userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    storageKey: varchar("storage_key").notNull(),
    topics: jsonb("topics").notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.userId, table.storageKey] })],
);

export type UserTopics = typeof userTopicsTable.$inferSelect;
