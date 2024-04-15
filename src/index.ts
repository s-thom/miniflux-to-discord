import Fastify from "fastify";
import "dotenv/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { MinifluxWebhookRequestBody, type NewEntry } from "./schemas.js";
import PQueue from "p-queue";
import { EmbedBuilder, WebhookClient } from "discord.js";
import { MinifluxClient } from "./miniflux.js";

const DISCORD_MAX_EMBEDS_PER_MESSAGE = 10;

const queue = new PQueue({});

const app = Fastify({
  logger: true,
}).withTypeProvider<ZodTypeProvider>();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);
await app.register(import("fastify-raw-body"), {
  global: false,
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

const hmac = createHmac("sha256", MINIFLUX_WEBHOOK_SECRET);
const webhookClient = new WebhookClient({ url: DISCORD_WEBHOOK_URL });
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

    queue.add(async () => {
      await webhookClient.send({ embeds });
    });
  }
}

app.get("/ping", () => ({ ok: true }));

app.post(
  "/webhook",
  {
    //@ts-ignore
    rawBody: true,
    preHandler: (req, res, next) => {
      try {
        const signatureHeader = req.headers["X-Miniflux-Signature"] as string;
        if (!signatureHeader) {
          req.log.error("No X-Miniflux-Signature header present on request");
          res.code(400);
          next(new Error("No X-Miniflux-Signature header present on request"));
          return;
        }

        const computedSignature = hmac
          .update(req.rawBody!)
          .digest("hex")
          .toLowerCase();

        if (
          !timingSafeEqual(
            Buffer.from(signatureHeader),
            Buffer.from(computedSignature)
          )
        ) {
          throw new Error();
        }
      } catch (err) {
        res.code(403);
        next(new Error("Invalid signature"));
        return;
      }

      next();
    },
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
