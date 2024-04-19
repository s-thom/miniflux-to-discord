import {
  type MessagePayload,
  WebhookClient,
  type WebhookMessageCreateOptions,
} from "discord.js";
import PQueue from "p-queue";

export class DiscordWebhookClient {
  private readonly client: WebhookClient;

  private readonly queue = new PQueue({ interval: 3 * 1000, intervalCap: 1 });

  constructor(webhookUrl: string) {
    this.client = new WebhookClient({ url: webhookUrl });
  }

  send(message: string | MessagePayload | WebhookMessageCreateOptions) {
    return this.queue.add(() => this.client.send(message), {
      throwOnTimeout: true,
    });
  }
}
