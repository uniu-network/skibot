import type { ScopedDatabaseClient } from "./database/types.js";
import { Repository } from "./database/repository.js";
import type { BotMessageEvent } from "./events.js";

export interface TodayStats {
  messages: number;
  users: number;
  groups: number;
}

export interface DailyStats {
  id?: number;
  stat_date: string;
  groups: number;
  users: number;
  messages: number;
}

interface GroupRow {
  group_id: number;
  created_at: number;
}

interface UserRow {
  user_id: number;
  created_at: number;
}

interface MessageRow {
  id?: number;
  type: string;
  event_json: string;
  created_at: number;
}

function getSystemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function getDateKey(timestamp: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().split("T")[0];
}

function getTimezoneOffset(timestamp: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const localAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );
  return localAsUtc - timestamp;
}

function getDateStartTimestamp(dateKey: string, timezone: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let timestamp = targetUtc - getTimezoneOffset(targetUtc, timezone);
  timestamp = targetUtc - getTimezoneOffset(timestamp, timezone);
  return timestamp;
}

class Counter {
  private groupsRepo: Repository<GroupRow>;
  private usersRepo: Repository<UserRow>;
  private messagesRepo: Repository<MessageRow>;
  private dailyStatsRepo: Repository<DailyStats>;
  private db: ScopedDatabaseClient;
  private initialized = false;

  constructor(db: ScopedDatabaseClient) {
    this.db = db;
    this.groupsRepo = new Repository(db, "groups", {
      schema: {
        columns: {
          group_id: { type: "integer", primaryKey: true },
          created_at: { type: "integer", notNull: true },
        },
      },
    });
    this.usersRepo = new Repository(db, "users", {
      schema: {
        columns: {
          user_id: { type: "integer", primaryKey: true },
          created_at: { type: "integer", notNull: true },
        },
      },
    });
    this.messagesRepo = new Repository(db, "messages", {
      schema: {
        columns: {
          id: { type: "integer", primaryKey: true, autoIncrement: true },
          type: { type: "text", notNull: true, default: "recv" },
          event_json: { type: "text", notNull: true },
          created_at: { type: "integer", notNull: true },
        },
      },
    });
    this.dailyStatsRepo = new Repository(db, "daily_stats", {
      schema: {
        columns: {
          id: { type: "integer", primaryKey: true, autoIncrement: true },
          stat_date: { type: "text", notNull: true, unique: true },
          groups: { type: "integer", notNull: true, default: 0 },
          users: { type: "integer", notNull: true, default: 0 },
          messages: { type: "integer", notNull: true, default: 0 },
        },
      },
    });
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await Promise.all([
      this.groupsRepo.ensureTable(),
      this.usersRepo.ensureTable(),
      this.messagesRepo.ensureTable(),
      this.dailyStatsRepo.ensureTable(),
    ]);
    await this.migrateAddTypeColumn();
    this.initialized = true;
  }

  private async migrateAddTypeColumn(): Promise<void> {
    try {
      await this.db.select("messages", { where: { type: "recv" }, limit: 1 });
    } catch {
      try {
        if (this.db.constructor.name === "ScopedDatabaseClientImpl") {
          const dbAny = this.db as any;
          const tableName = dbAny.prefix
            ? `${dbAny.prefix}_messages`
            : "messages";
          await dbAny.driver?.execute?.(
            `ALTER TABLE "${tableName}" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'recv'`,
          );
        }
      } catch {
        // column might already exist under different driver
        try {
          await (this.db as any).driver?.execute?.(
            `ALTER TABLE messages ADD COLUMN type TEXT NOT NULL DEFAULT 'recv'`,
          );
        } catch {
          /* ignore */
        }
      }
    }
  }

  async addGroup(groupId: number): Promise<void> {
    const existing = await this.groupsRepo.findOne({ group_id: groupId });
    if (!existing) {
      await this.groupsRepo.create({
        group_id: groupId,
        created_at: Date.now(),
      });
    }
  }

  async addGroups(groupIds: number[]): Promise<void> {
    for (const groupId of groupIds) {
      await this.addGroup(groupId);
    }
  }

  async addUser(userId: number): Promise<void> {
    const existing = await this.usersRepo.findOne({ user_id: userId });
    if (!existing) {
      await this.usersRepo.create({ user_id: userId, created_at: Date.now() });
    }
  }

  async addUsers(userIds: number[]): Promise<void> {
    for (const userId of userIds) {
      await this.addUser(userId);
    }
  }

  async addMessage(
    event: BotMessageEvent,
    type: string = "recv",
  ): Promise<void> {
    await this.messagesRepo.create({
      type,
      event_json: JSON.stringify(event),
      created_at: Date.now(),
    });
  }

  async addMessageJson(
    eventJson: string,
    type: string = "recv",
  ): Promise<void> {
    await this.messagesRepo.create({
      type,
      event_json: eventJson,
      created_at: Date.now(),
    });
  }

  async addBotSendMessage(eventJson: string): Promise<void> {
    await this.messagesRepo.create({
      type: "bot_send",
      event_json: eventJson,
      created_at: Date.now(),
    });
  }

  async getTodayStats(timezone: string = getSystemTimeZone()): Promise<TodayStats> {
    const today = getDateKey(Date.now(), timezone);
    const startTimestamp = getDateStartTimestamp(today, timezone);

    const [groups, users, todayMessages] = await Promise.all([
      this.groupsRepo.count(),
      this.usersRepo.count(),
      this.db.countWhereGreaterThanOrEqual(
        "messages",
        "created_at",
        startTimestamp,
      ),
    ]);
    return { messages: todayMessages, groups, users };
  }

  async getStatsForDate(
    dateKey: string,
    timezone: string = getSystemTimeZone(),
  ): Promise<DailyStats> {
    const startTimestamp = getDateStartTimestamp(dateKey, timezone);
    const endTimestamp = getDateStartTimestamp(addDays(dateKey, 1), timezone);
    const [groups, users, messages] = await Promise.all([
      this.db.countWhereLessThan("groups", "created_at", endTimestamp),
      this.db.countWhereLessThan("users", "created_at", endTimestamp),
      this.db.countWhereBetween(
        "messages",
        "created_at",
        startTimestamp,
        endTimestamp,
      ),
    ]);

    return { stat_date: dateKey, groups, users, messages };
  }

  async getDailyStats(
    limit: number = 30,
    timezone: string = getSystemTimeZone(),
  ): Promise<DailyStats[]> {
    const today = getDateKey(Date.now(), timezone);
    const startDate = addDays(today, -(Math.max(limit, 1) - 1));
    const stats: DailyStats[] = [];

    for (let i = 0; i < Math.max(limit, 1); i++) {
      stats.push(await this.getStatsForDate(addDays(startDate, i), timezone));
    }

    return stats;
  }

  async getMessageCount(type?: string): Promise<number> {
    if (type) {
      return this.messagesRepo.count({ type });
    }
    return this.messagesRepo.count();
  }

  async getMessages(
    limit: number = 100,
    offset: number = 0,
    type?: string,
  ): Promise<MessageRow[]> {
    if (type) {
      return this.messagesRepo.find({ type } as any, {
        orderBy: "id",
        order: "desc",
        limit,
        offset,
      });
    }
    return this.messagesRepo.findAll({
      orderBy: "id",
      order: "desc",
      limit,
      offset,
    });
  }

  async snapshotDailyStats(
    dateKey?: string,
    timezone: string = getSystemTimeZone(),
  ): Promise<void> {
    const statDate = dateKey || addDays(getDateKey(Date.now(), timezone), -1);
    const stats = await this.getStatsForDate(statDate, timezone);

    const existing = await this.dailyStatsRepo.findOne({ stat_date: statDate });
    if (existing) {
      await this.dailyStatsRepo.update(
        { groups: stats.groups, users: stats.users, messages: stats.messages },
        { stat_date: statDate },
      );
    } else {
      await this.dailyStatsRepo.create({
        stat_date: statDate,
        groups: stats.groups,
        users: stats.users,
        messages: stats.messages,
      });
    }
  }

  async cleanExpiredMessages(retentionDays: number): Promise<number> {
    if (retentionDays <= 0) return 0;
    const threshold = Date.now() - retentionDays * 86400000;
    return this.db.deleteWhereLessThan("messages", "created_at", threshold);
  }

  async cleanOldDailyStats(keepDays: number): Promise<number> {
    if (keepDays <= 0) return 0;
    const cutoffDate = new Date(Date.now() - keepDays * 86400000);
    const cutoffDateStr = cutoffDate.toISOString().split("T")[0];
    return this.db.deleteWhereLessThan(
      "daily_stats",
      "stat_date",
      cutoffDateStr,
    );
  }

  async cleanToday(): Promise<void> {
    await this.messagesRepo.deleteAll();
    await this.groupsRepo.deleteAll();
    await this.usersRepo.deleteAll();

    const statsCount = await this.dailyStatsRepo.count();
    if (statsCount >= 30) {
      const allStats = await this.dailyStatsRepo.findAll({
        orderBy: "id",
        order: "asc",
      });
      const toDelete = allStats.slice(0, allStats.length - 29);
      for (const stat of toDelete) {
        if (stat.id !== undefined) {
          await this.dailyStatsRepo.delete({ id: stat.id });
        }
      }
    }
  }
}

export { Counter };
export default Counter;
