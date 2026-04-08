/**
 * Bull job payload for CSV ingestion jobs.
 * Scaffold for Phase 2.
 */
export interface CsvIngestionJobPayload {
  /** Absolute path to the CSV file inside the container */
  filePath: string;
  /** Original filename (for audit log) */
  originalFilename: string;
  /** Username of the uploader, or 'watcher' for automated ingestion */
  operator: string;
}
