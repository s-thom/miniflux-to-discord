import Fastify from "fastify";
import "dotenv/config";

const fastify = Fastify({
  logger: true,
});

fastify.get("/ping", () => ({ ok: true }));

try {
  await fastify.listen({
    host: process.env.LISTEN_HOST ?? "127.0.0.1",
    port: parseInt(process.env.LISTEN_PORT ?? "80"),
  });
} catch (err) {
  fastify.log.error("Unable to start server");
  process.exit(1);
}
