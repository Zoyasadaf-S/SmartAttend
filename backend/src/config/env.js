const required = ["DATABASE_URL", "JWT_SECRET"];

export function validateEnv() {
  const missing = required.filter((key) => !String(process.env[key] || "").trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export function corsOrigins() {
  const raw = process.env.CORS_ORIGINS || process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:3000";
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}
