import app from "./app";
import { logger } from "./lib/logger";
import { startSimulator } from "./lib/simulator";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  if (process.env.NODE_ENV === "production") {
    startSimulator();
  } else {
    logger.info("Simulator disabled in non-production environment");
  }
});
