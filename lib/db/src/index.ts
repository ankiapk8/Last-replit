import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export async function ensureDatabaseSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "decks" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "description" text,
      "parent_id" integer,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "cards" (
      "id" serial PRIMARY KEY NOT NULL,
      "deck_id" integer NOT NULL,
      "front" text NOT NULL,
      "back" text NOT NULL,
      "tags" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "generations" (
      "id" serial PRIMARY KEY NOT NULL,
      "deck_name" text NOT NULL,
      "deck_type" text NOT NULL,
      "status" text NOT NULL,
      "cards_generated" integer NOT NULL DEFAULT 0,
      "page_count" integer NOT NULL DEFAULT 0,
      "duration_ms" integer NOT NULL DEFAULT 0,
      "custom_prompt" text,
      "error_message" text,
      "started_at" timestamp with time zone DEFAULT now() NOT NULL,
      "completed_at" timestamp with time zone
    );

    ALTER TABLE "decks" ADD COLUMN IF NOT EXISTS "description" text;
    ALTER TABLE "decks" ADD COLUMN IF NOT EXISTS "parent_id" integer;
    ALTER TABLE "decks" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'deck';
    ALTER TABLE "decks" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
    ALTER TABLE "decks" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

    ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "tags" text;
    ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "image" text;
    ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "source_image" text;
    ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "bbox" text;
    ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "card_type" text;
    ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "choices" text;
    ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "correct_index" integer;
    ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "page_number" integer;
    ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
    ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

    CREATE TABLE IF NOT EXISTS "qbanks" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "description" text,
      "parent_id" integer,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "questions" (
      "id" serial PRIMARY KEY NOT NULL,
      "qbank_id" integer NOT NULL,
      "front" text NOT NULL,
      "back" text NOT NULL,
      "choices" text,
      "correct_index" integer,
      "tags" text,
      "page_number" integer,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'decks_parent_id_decks_id_fk'
      ) THEN
        ALTER TABLE "decks"
          ADD CONSTRAINT "decks_parent_id_decks_id_fk"
          FOREIGN KEY ("parent_id") REFERENCES "public"."decks"("id")
          ON DELETE set null ON UPDATE no action;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'cards_deck_id_decks_id_fk'
      ) THEN
        ALTER TABLE "cards"
          ADD CONSTRAINT "cards_deck_id_decks_id_fk"
          FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id")
          ON DELETE cascade ON UPDATE no action;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'qbanks_parent_id_qbanks_id_fk'
      ) THEN
        ALTER TABLE "qbanks"
          ADD CONSTRAINT "qbanks_parent_id_qbanks_id_fk"
          FOREIGN KEY ("parent_id") REFERENCES "public"."qbanks"("id")
          ON DELETE set null ON UPDATE no action;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'questions_qbank_id_qbanks_id_fk'
      ) THEN
        ALTER TABLE "questions"
          ADD CONSTRAINT "questions_qbank_id_qbanks_id_fk"
          FOREIGN KEY ("qbank_id") REFERENCES "public"."qbanks"("id")
          ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS "sessions" (
      "sid" varchar PRIMARY KEY NOT NULL,
      "sess" jsonb NOT NULL,
      "expire" timestamp NOT NULL
    );

    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");

    CREATE TABLE IF NOT EXISTS "users" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "email" varchar UNIQUE,
      "first_name" varchar,
      "last_name" varchar,
      "profile_image_url" varchar,
      "stripe_customer_id" varchar,
      "stripe_subscription_id" varchar,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_customer_id" varchar;
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" varchar;
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar NOT NULL DEFAULT 'user';
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "manual_pro" varchar DEFAULT 'false';

    ALTER TABLE "decks" ADD COLUMN IF NOT EXISTS "user_id" varchar;
    ALTER TABLE "qbanks" ADD COLUMN IF NOT EXISTS "user_id" varchar;

    CREATE TABLE IF NOT EXISTS "quota_usage" (
      "key" text NOT NULL,
      "metric" text NOT NULL,
      "period" text NOT NULL,
      "count" integer NOT NULL DEFAULT 0,
      PRIMARY KEY ("key", "metric", "period")
    );

    CREATE TABLE IF NOT EXISTS "user_topics" (
      "user_id" varchar NOT NULL,
      "storage_key" varchar NOT NULL,
      "topics" jsonb NOT NULL DEFAULT '[]',
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      PRIMARY KEY ("user_id", "storage_key")
    );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_topics_user_id_users_id_fk'
      ) THEN
        ALTER TABLE "user_topics"
          ADD CONSTRAINT "user_topics_user_id_users_id_fk"
          FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
          ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS "mind_maps" (
      "id" serial PRIMARY KEY NOT NULL,
      "deck_id" integer NOT NULL,
      "title" text NOT NULL,
      "data" text NOT NULL,
      "card_count" integer NOT NULL DEFAULT 0,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'mind_maps_deck_id_decks_id_fk'
      ) THEN
        ALTER TABLE "mind_maps"
          ADD CONSTRAINT "mind_maps_deck_id_decks_id_fk"
          FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id")
          ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS "feedback" (
      "id" serial PRIMARY KEY NOT NULL,
      "type" text NOT NULL DEFAULT 'general',
      "rating" integer,
      "message" text NOT NULL,
      "email" text,
      "user_id" text,
      "page" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);
}

export * from "./schema";
