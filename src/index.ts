import { EmbedBuilder } from "discord.js";
import "dotenv/config";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import rawBody from "raw-body";
import { safeParse } from "secure-json-parse";
import { DiscordWebhookClient } from "./discord.js";
import { MinifluxClient, getSignatureCheckHook } from "./miniflux.js";
import { MinifluxWebhookRequestBody, type NewEntry } from "./schemas.js";

const DISCORD_MAX_EMBEDS_PER_MESSAGE = 10;

const app = Fastify({
  logger: true,
}).withTypeProvider<ZodTypeProvider>();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.addContentTypeParser("application/json", (req, payload, done) => {
  rawBody(
    payload,
    {
      length: req.headers["content-length"],
      limit: "1mb",
      encoding: "utf8",
    },
    (err, body) => {
      if (err) return done(err);
      (req as any).rawBody = body;
      done(null, safeParse(body));
    }
  );
});

const missingEnv: string[] = [];
function getEnv(name: string): string | undefined;
function getEnv(name: string, required: true): string;
function getEnv(name: string, required?: boolean): string | undefined {
  const value = process.env[name];
  if (required && !value) {
    missingEnv.push(name);
  }
  return value;
}
const DISCORD_WEBHOOK_URL = getEnv("DISCORD_WEBHOOK_URL", true);
const MINIFLUX_API_KEY = getEnv("MINIFLUX_API_KEY", true);
const MINIFLUX_WEBHOOK_SECRET = getEnv("MINIFLUX_WEBHOOK_SECRET", true);
const MINIFLUX_BASE_URL = getEnv("MINIFLUX_BASE_URL", true);
if (missingEnv.length > 0) {
  app.log.fatal(
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
    const embeds = await Promise.all(
      batch.map(async (entry) => {
        const feed = await minifluxClient.getFeed(entry.feed_id);
        const icon = feed.icon
          ? await minifluxClient.getIcon(feed.icon.icon_id)
          : undefined;

        const publishDate = entry.published_at ?? entry.created_at;

        return new EmbedBuilder()
          .setTitle(entry.title)
          .setURL(new URL(`/unread/${entry.id}`, MINIFLUX_BASE_URL).toString())
          .setAuthor({
            name: feed.title,
            iconURL: icon?.data,
          })
          .setTimestamp(publishDate ? new Date(publishDate) : undefined)
          .setColor("NotQuiteBlack");
      })
    );

    await webhookClient.send({ embeds });
  }
}

app.get("/ping", () => ({ ok: true }));

app.post(
  "/webhook",
  {
    //@ts-ignore
    rawBody: true,
    preValidation: getSignatureCheckHook(MINIFLUX_WEBHOOK_SECRET),
    schema: {
      body: MinifluxWebhookRequestBody,
    },
  },
  async (req, res) => {
    if (req.body.event_type === "new_entries") {
      await sendEntriesToDiscord(req.body.entries);
      return { done: true };
    }

    res.code(400);
    throw new Error("Invalid event type");
  }
);

try {
  await app.listen({
    host: getEnv("LISTEN_HOST") ?? "127.0.0.1",
    port: parseInt(getEnv("LISTEN_PORT") ?? "80"),
  });
} catch (err) {
  app.log.fatal("Unable to start server");
  process.exit(1);
}
