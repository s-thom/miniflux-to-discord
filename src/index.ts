import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import "dotenv/config";
import { extension } from "mime-types";
import { DiscordWebhookClient } from "./discord.js";
import { FastifyServer } from "./fastify.js";
import { MinifluxClient, getSignatureCheckHook } from "./miniflux.js";
import { MinifluxWebhookRequestBody, type NewEntry } from "./schemas.js";

const DISCORD_MAX_EMBEDS_PER_MESSAGE = 10;

const server = new FastifyServer();

const missingEnv: string[] = [];
function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    missingEnv.push(name);
  }
  return value ?? "";
}
const DISCORD_WEBHOOK_URL = getRequiredEnv("DISCORD_WEBHOOK_URL");
const MINIFLUX_API_KEY = getRequiredEnv("MINIFLUX_API_KEY");
const MINIFLUX_WEBHOOK_SECRET = getRequiredEnv("MINIFLUX_WEBHOOK_SECRET");
const MINIFLUX_BASE_URL = getRequiredEnv("MINIFLUX_BASE_URL");
if (missingEnv.length > 0) {
  server.logger.fatal(
    `Missing required environment variables: ${missingEnv.join(", ")}`
  );
  process.exit(1);
}

const webhookClient = new DiscordWebhookClient(DISCORD_WEBHOOK_URL);
const minifluxClient = new MinifluxClient(MINIFLUX_BASE_URL, MINIFLUX_API_KEY);

async function sendEntriesToDiscord(entries: NewEntry[]) {
  const batches: NewEntry[][] = [];
  const entriesClone = entries.slice();
  while (entriesClone.length > 0) {
    batches.push(
      entriesClone.splice(
        0,
        Math.min(entriesClone.length, DISCORD_MAX_EMBEDS_PER_MESSAGE)
      )
    );
  }

  for (const batch of batches) {
    const files: AttachmentBuilder[] = [];

    const embeds = await Promise.all(
      batch.map(async (entry) => {
        const feed = await minifluxClient.getFeed(entry.feed_id);
        const icon = feed.icon
          ? await minifluxClient.getIcon(feed.icon.icon_id)
          : undefined;

        const publishDate = entry.published_at ?? entry.created_at;

        const builder = new EmbedBuilder()
          .setTitle(entry.title)
          .setURL(new URL(`/unread/${entry.id}`, MINIFLUX_BASE_URL).toString())
          .setAuthor({
            name: feed.title,
          })
          .setTimestamp(publishDate ? new Date(publishDate) : undefined)
          .setColor("NotQuiteBlack");

        if (icon) {
          const [typeBase64, data] = icon.data.split(",");
          const ext = extension(typeBase64);
          const dataArray = Buffer.from(data, "base64");

          const attachment = new AttachmentBuilder(dataArray, {
            name: `${entry.id}.${ext}`,
          });

          files.push(attachment);
          builder.setAuthor({
            name: feed.title,
            iconURL: `attachment://${attachment.name}`,
          });
        }

        return builder;
      })
    );

    await webhookClient.send({ embeds, files });
  }
}

server.addRoute({
  method: "POST",
  url: "/webhook",
  //@ts-ignore
  rawBody: true,
  preValidation: getSignatureCheckHook(MINIFLUX_WEBHOOK_SECRET),
  schema: {
    body: MinifluxWebhookRequestBody,
  },
  handler: async (req, res) => {
    if (req.body.event_type === "new_entries") {
      await sendEntriesToDiscord(req.body.entries);
      return { done: true };
    }

    res.code(400);
    throw new Error("Invalid event type");
  },
});

await server.listen(
  process.env.LISTEN_HOST ?? "127.0.0.1",
  parseInt(process.env.LISTEN_PORT ?? "80")
);
