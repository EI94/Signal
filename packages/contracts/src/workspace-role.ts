import { z } from 'zod';

/** MVP workspace roles (Firestore `members/{uid}.role`). Hierarchy: admin > analyst > viewer. */
export const WorkspaceRoleSchema = z.enum(['admin', 'analyst', 'viewer']);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
