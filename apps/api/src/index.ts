import { loadConfig } from "./config.js";
import { pool } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Run database migrations before accepting traffic
  await runMigrations();

  const server = await createServer(config);

  // Graceful shutdown (containers must drain in-flight requests before exiting)
  const shutdown = async (signal: string): Promise<void> => {
    server.log.info(`Received ${signal}, shutting down gracefully...`);
    await server.close();
    await pool.end();
    server.log.info("Server and DB pool closed. Exiting.");
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  await server.listen({ port: config.API_PORT, host: "0.0.0.0" });
  server.log.info(`API listening on 0.0.0.0:${config.API_PORT}`);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
