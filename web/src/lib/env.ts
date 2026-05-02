function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const env = {
  appUrl(): string {
    return process.env.APP_URL || "http://localhost:3000";
  },
  gitlabInstanceUrl(): string {
    return (process.env.GITLAB_INSTANCE_URL || "https://gitlab.com").replace(
      /\/+$/,
      "",
    );
  },
  gitlabAppId(): string {
    return required("GITLAB_APP_ID");
  },
  gitlabAppSecret(): string {
    return required("GITLAB_APP_SECRET");
  },
  oxidBin(): string {
    return process.env.OXID_BIN || "oxid";
  },
  scanTimeoutMs(): number {
    const raw = process.env.SCAN_TIMEOUT_MS;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 5 * 60 * 1000;
  },
};

/** True when GitLab OAuth is fully configured. Used to render setup hints rather than crash. */
export function isGitlabConfigured(): boolean {
  return Boolean(process.env.GITLAB_APP_ID && process.env.GITLAB_APP_SECRET);
}
