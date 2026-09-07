import type {
  DocumentData,
  Firestore,
  QueryDocumentSnapshot,
  Transaction,
} from "firebase-admin/firestore";

export type BackfillMutation =
  | { type: "delete" }
  | { type: "set"; data: DocumentData; merge?: boolean }
  | { type: "skip" };

export interface BackfillOptions {
  collectionPath: string;
  pageSize?: number;
  step: string;
  transform: (snapshot: QueryDocumentSnapshot) => BackfillMutation;
}

export interface BackfillResult {
  changed: number;
  processed: number;
}

export interface MigrationContext {
  backfill(options: BackfillOptions): Promise<BackfillResult>;
  transactionalStep(
    step: string,
    operation: (
      transaction: Transaction,
      firestore: Firestore,
    ) => Promise<void>,
  ): Promise<void>;
}

export interface FirestoreMigration {
  /** Stable sortable identifier, conventionally `YYYYMMDDHHMM-description`. */
  id: string;
  description: string;
  /** SHA-256 of the immutable migration source or its canonical contents. */
  checksum: string;
  run(context: MigrationContext): Promise<void>;
}

export interface MigrationRunnerOptions {
  leaseDurationMs?: number;
  metadataCollection?: string;
  ownerId?: string;
}

export interface MigrationRunResult {
  applied: string[];
  registryFingerprint: string;
}

export interface MigrationStatus {
  current: boolean;
  expectedFingerprint: string;
  migrationInProgress?: string;
  storedFingerprint?: string;
}
