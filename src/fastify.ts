import "dotenv/config";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import rawBody from "raw-body";
import { safeParse } from "secure-json-parse";

export class FastifyServer {
  private readonly app = Fastify({
    logger: true,
  }).withTypeProvider<ZodTypeProvider>();

  constructor() {
    this.app.setValidatorCompiler(validatorCompiler);
    this.app.setSerializerCompiler(serializerCompiler);

    // Override JSON parser to also grab raw body
    this.app.addContentTypeParser("application/json", (req, payload, done) => {
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

    this.app.get("/", () => "Hello, world!");
    this.app.get("/ping", () => ({ ok: true }));
  }

  get logger() {
    return this.app.log;
  }

  get addRoute() {
    return this.app.route.bind(this.app);
  }

  async listen(host: string, port: number) {
    try {
      await this.app.listen({
        host,
        port,
      });
    } catch (err) {
      this.app.log.fatal("Unable to start server");
      process.exit(1);
    }
  }
}
