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
