/** Ambient types for the disposable-auth QA cleanup helper. */

export const DISPOSABLE_USER_DELETE_BLOCKER: {
  table: string;
  column: string;
  references: string;
  onDelete: string;
  cause: string;
  trigger: string;
};

export function deleteAuthUserWithRetry(
  admin: unknown,
  userId: string,
  options?: {
    attempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  }
): Promise<{ deleted: boolean; attempts: number; data: unknown }>;

export function listDeletablePersonalOrganisations(
  admin: unknown,
  userId: string
): Promise<
  Array<{
    id: string;
    organisation_type: string;
    created_by: string;
    status: string;
  }>
>;

export function cleanupDisposableAuthUser(
  admin: unknown,
  userId: string,
  options?: {
    log?: (message: string, details?: unknown) => void;
    retry?: {
      attempts?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
    };
  }
): Promise<{
  userId: string;
  personalOrganisationIds: string[];
  counts: Record<string, number>;
  auth: { deleted: boolean; attempts: number; data: unknown };
}>;

export function verifyDisposableUserCleanup(
  admin: unknown,
  userId: string
): Promise<Record<string, number>>;
