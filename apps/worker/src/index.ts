// Phase 2 stub: CSV ingestion worker
// This process will listen to Bull job queue and process CSV files.
// Implemented in Phase 2.
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
logger.info("Worker stub running — CSV ingestion implemented in Phase 2");
