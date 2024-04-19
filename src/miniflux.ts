import type { preValidationAsyncHookHandler } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import PQueue from "p-queue";

export interface Feed {
  id: number;
  user_id: number;
  title: string;
  site_url: string;
  feed_url: string;
  checked_at: string;
  etag_header: string;
  last_modified_header: string;
  parsing_error_message: string;
  parsing_error_count: number;
  scraper_rules: string;
  rewrite_rules: string;
  crawler: boolean;
  blocklist_rules: string;
  keeplist_rules: string;
  user_agent: string;
  username: string;
  password: string;
  disabled: boolean;
  ignore_http_cache: boolean;
  fetch_via_proxy: boolean;
  category: {
    id: number;
    user_id: number;
    title: string;
  };
  icon: {
    feed_id: number;
    icon_id: number;
  } | null;
}

export interface Icon {
  id: number;
  data: string;
  mime_type: string;
}

export function getSignatureCheckHook(secret: string): any {
  const hmac = createHmac("sha256", secret);

  const hook: preValidationAsyncHookHandler = async (req, res) => {
    const signatureHeader = req.headers["x-miniflux-signature"] as string;
    if (!signatureHeader) {
      req.log.error("No X-Miniflux-Signature header present on request");
      res.code(400);
      throw new Error("No X-Miniflux-Signature header present on request");
    }

    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      res.code(500);
      throw new Error("Internal error in validation");
    }
    const computedSignature = hmac
      .update((req as any).rawBody)
      .digest("hex")
      .toLowerCase();

    if (
      !timingSafeEqual(
        Buffer.from(signatureHeader),
        Buffer.from(computedSignature)
      )
    ) {
      req.log.error("Invalid signature");
      throw new Error("Invalid signature");
    }
  };

  return hook;
}

export class MinifluxClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  private readonly queue = new PQueue({ concurrency: 4 });

  private readonly feedCache = new Map<number, Promise<Feed>>();
  private readonly iconCache = new Map<number, Promise<Icon>>();

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async get<T>(path: string): Promise<T> {
    return this.queue.add(
      async () => {
        const response = await fetch(new URL(path, this.baseUrl), {
          method: "GET",
          headers: { "X-Auth-Token": this.apiKey },
        });
        const body = await response.json();
        return body as T;
      },
      { throwOnTimeout: true }
    );
  }

  async getFeed(id: number): Promise<Feed> {
    if (!this.feedCache.has(id)) {
      this.feedCache.set(id, this.get(`/v1/feeds/${id}`));
    }

    return this.feedCache.get(id)!;
  }

  async getIcon(id: number): Promise<Icon> {
    if (!this.iconCache.has(id)) {
      this.iconCache.set(id, this.get(`/v1/icons/${id}`));
    }

    return this.iconCache.get(id)!;
  }
}
