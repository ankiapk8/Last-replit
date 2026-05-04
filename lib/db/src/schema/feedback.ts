import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("general"),
  rating: integer("rating"),
  message: text("message").notNull(),
  email: text("email"),
  userId: text("user_id"),
  page: text("page"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Feedback = typeof feedbackTable.$inferSelect;
export type InsertFeedback = typeof feedbackTable.$inferInsert;
