export interface Env {
  DB: D1Database;
  EVIDENCE_BUCKET: R2Bucket;
  ENVIRONMENT: string;
  APP_NAME: string;
  SESSION_SECRET: string;
  SESSION_TTL_SECONDS: string;
  MAX_UPLOAD_SIZE_BYTES: string;
}

export interface StaffUser {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  role: string;
  station_id: string | null;
  skills: string[];
}

export interface AuthContext {
  staff: StaffUser;
  sessionId: string;
  tenantId: string;
}
