import schedule from "node-schedule";
import type { Counter } from "./counter.js";
import logger from "./log.js";

export interface SchedulerConfig {
  retentionDays: number;
  cleanupTime: string;
  timezone: string;
}

function parseTime(time: string): [number, number] {
  const parts = time.split(":");
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1] || "0", 10);
  if (
    isNaN(hour) ||
    isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    logger.warn(
      `[Scheduler] Invalid cleanup time "${time}", defaulting to 01:00`,
    );
    return [1, 0];
  }
  return [hour, minute];
}

export function registerSchedulers(
  counter: Counter,
  config: SchedulerConfig,
): void {
  const [hour, minute] = parseTime(config.cleanupTime);
  const tz =
    config.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";

  const rule = new schedule.RecurrenceRule();
  rule.hour = hour;
  rule.minute = minute;
  rule.tz = tz;

  logger.info(
    `[Scheduler] Daily snapshot scheduled at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} (${tz})`,
  );

  schedule.scheduleJob(rule, () => {
    counter
      .snapshotDailyStats(undefined, tz)
      .catch((e) => logger.error(`Failed to snapshot daily stats: ${e}`));
  });

  if (config.retentionDays > 0) {
    logger.info(
      `[Scheduler] Message cleanup scheduled: retain ${config.retentionDays} days`,
    );

    schedule.scheduleJob(rule, () => {
      counter
        .cleanExpiredMessages(config.retentionDays)
        .then((count) => {
          logger.info(
            `[Scheduler] Cleaned ${count} expired messages (retention: ${config.retentionDays} days)`,
          );
        })
        .catch((e) => logger.error(`Failed to clean expired messages: ${e}`));
    });

    schedule.scheduleJob(rule, () => {
      counter
        .cleanOldDailyStats(config.retentionDays)
        .then((count) => {
          logger.info(
            `[Scheduler] Cleaned ${count} old daily stats entries (keep: ${config.retentionDays} days)`,
          );
        })
        .catch((e) => logger.error(`Failed to clean old daily stats: ${e}`));
    });
  }
}
