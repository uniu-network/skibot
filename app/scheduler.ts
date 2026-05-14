import schedule from 'node-schedule';
import type { Counter } from './counter.js';
import logger from './log.js';

export function registerSchedulers(counter: Counter): void {
    schedule.scheduleJob('0 0 * * *', () => {
        counter.snapshotDailyStats().catch(e => logger.error(`Failed to snapshot daily stats: ${e}`));
    });

    schedule.scheduleJob('0 0 * * *', () => {
        counter.cleanToday().catch(e => logger.error(`Failed to clean today's data: ${e}`));
    });
}
