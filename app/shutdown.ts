import * as fs from "fs";
import databaseManager from "./database/manager.js";
import type { Runtime } from "./runtime.js";
import logger from "./log.js";

export function registerShutdown(runtime: Runtime): void {
  const onStop = async (signal: string) => {
    logger.info(`${signal} received. Shutting down...`);
    if (runtime.dashboardDevServer) {
      try {
        await runtime.dashboardDevServer.close();
      } catch (e) {
        logger.error(`Failed to close dashboard dev server: ${e}`);
      }
    }

    await runtime.botManager.stopAll();
    await databaseManager.close();

    if (fs.existsSync("./plugins")) {
      const files = fs.readdirSync("./plugins");
      for (const file of files) {
        try {
          fs.unlinkSync(`./plugins/${file}/index.js`);
        } catch (e) {}
      }
    }

    process.exit(0);
  };

  process.on("SIGINT", (signal) => {
    onStop(signal);
  });
  process.on("SIGTERM", (signal) => {
    onStop(signal);
  });
}
