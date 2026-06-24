import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  did: text("did").notNull().unique(),
  handle: text("handle").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sshKeys = pgTable("ssh_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  name: text("name").notNull(),
  publicKey: text("public_key").notNull(),
  atpRkey: text("atp_rkey"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
