import { existsSync } from "node:fs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { IS_PROD, PORT, WEB_DIST } from "./config.ts";
import { migrate } from "./db.ts";
import { registerRoutes } from "./routes.ts";
import { getSettings } from "./services/settings.ts";
import { seedSimulation } from "./services/simulation.ts";

async function main(): Promise<void> {
  migrate();

  // Make sure simulation mode always has data to show on first run.
  const settings = getSettings();
  if (settings.mode === "simulation") {
    seedSimulation();
  }

  const app = Fastify({
    logger: {
      transport: IS_PROD ? undefined : { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
    },
  });

  // Tolerate bodyless POSTs (e.g. /api/sync) and empty JSON bodies.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (!body || (typeof body === "string" && body.trim() === "")) return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });
  app.addContentTypeParser("*", (_req, _payload, done) => done(null, undefined));

  await registerRoutes(app);

  if (IS_PROD && existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith("/api")) return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }

  await app.listen({ port: PORT, host: "127.0.0.1" });
  app.log.info(`mode=${settings.mode}  dashboard API on http://127.0.0.1:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
