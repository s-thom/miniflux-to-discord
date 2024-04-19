import { z } from "zod";

const feedSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  feed_url: z.string(),
  title: z.string(),
  checked_at: z.string(),
});

const enclosureSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  entry_id: z.number(),
  url: z.string(),
  mime_type: z.string(),
  size: z.number(),
  media_progression: z.number(),
});

const newEntrySchema = z.object({
  id: z.number(),
  user_id: z.number(),
  feed_id: z.number(),
  status: z.string(),
  hash: z.string(),
  title: z.string(),
  url: z.string(),
  comments_url: z.string(),
  published_at: z.string(),
  created_at: z.string(),
  changed_at: z.string(),
  content: z.string(),
  share_code: z.string(),
  starred: z.boolean(),
  reading_time: z.number(),
  enclosures: z.array(enclosureSchema),
  tags: z.array(z.string()).nullable(),
});

export type NewEntry = z.TypeOf<typeof newEntrySchema>;

export const MinifluxNewEntriesRequestBody = z.object({
  event_type: z.literal("new_entries"),
  feed: feedSchema,
  entries: z.array(newEntrySchema),
});

const saveEntrySchema = z.object({
  id: z.number(),
  user_id: z.number(),
  feed_id: z.number(),
  status: z.string(),
  hash: z.string(),
  title: z.string(),
  url: z.string(),
  comments_url: z.string(),
  published_at: z.string(),
  created_at: z.string(),
  changed_at: z.string(),
  content: z.string(),
  author: z.string(),
  share_code: z.string(),
  starred: z.boolean(),
  reading_time: z.number(),
  enclosures: z.array(enclosureSchema),
  tags: z.array(z.string()).nullable(),
  feed: feedSchema,
});

export type SaveEntry = z.TypeOf<typeof saveEntrySchema>;

export const MinifluxSaveEntryRequestBody = z.object({
  event_type: z.literal("save_entry"),
  entry: saveEntrySchema,
});

export const MinifluxWebhookRequestBody = z.discriminatedUnion("event_type", [
  MinifluxNewEntriesRequestBody,
  MinifluxSaveEntryRequestBody,
]);
