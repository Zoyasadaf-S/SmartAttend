import "dotenv/config";
import { validateEnv } from "./src/config/env.js";
import app from "./src/app.js";

validateEnv();

const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`SmartAttend Backend running on http://localhost:${PORT}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
