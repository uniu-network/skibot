import config from './app/config.js';
import logger from './app/log.js';
import { createRuntime } from './app/runtime.js';
import { startServer } from './app/server.js';
import { registerShutdown } from './app/shutdown.js';

async function bootstrap(): Promise<void> {
    const runtime = await createRuntime();

    logger.info(`booting skibot v${runtime.version}`);

    await startServer(runtime);

    await runtime.botManager.loadAll();

    registerShutdown(runtime);
}

bootstrap().catch(e => {
    logger.error(`Failed to initialize: ${e}`);
    process.exit(1);
});

export { config };
