import { integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const quotaUsageTable = pgTable(
  "quota_usage",
  {
    key: text("key").notNull(),
    metric: text("metric").notNull(),
    period: text("period").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.key, table.metric, table.period] })],
);
