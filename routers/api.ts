import { normalizePrefix } from "../app/bot.js";
import { Elysia, type AnyElysia, type Context } from "elysia";
import * as fs from "fs";
import type { BotManager } from "../app/botManager.js";
import type { Config } from "../app/config.js";
import { botConfigExists, createBotConfig } from "../app/config.js";
import jwtHelper from "../app/jwtHelper.js";
import { validateConfig } from "../app/pluginConfig.js";
import { getConfigSchema } from "../app/pluginBase.js";
import { AdapterManager } from "../app/adapterManager.js";
import databaseManager from "../app/database/manager.js";
import {
  getLogBufferAfter,
  setConfiguredLogLevel,
  subscribeToLogs,
  unsubscribeFromLogs,
} from "../app/log.js";
import type { LogEntry } from "../app/log.js";
import {
  getGlobalConfigField,
  getGlobalConfigFields,
  getGlobalConfigSections,
  validateGlobalConfigUpdate,
} from "../app/globalConfigSchema.js";

interface ApiRoutesDeps {
  botManager: BotManager;
  config: Config;
  version: string;
}

type ApiContext = Context & {
  body: any;
  query: Record<string, string | undefined>;
};

function error(statusCode: number, body: unknown): Response {
  return Response.json(body, { status: statusCode });
}

export function createApiRoutes(deps: ApiRoutesDeps): AnyElysia {
  const { botManager, config, version } = deps;
  const router = new Elysia({ prefix: "/api" }).onBeforeHandle(
    ({ cookie, status }) => {
      const token = cookie.token?.value;
      if (!token) {
        return status(401, { code: 401, message: "no token found" });
      }

      const tokenVerifyResult = jwtHelper.verifyToken(String(token));
      if (!tokenVerifyResult) {
        return status(401, { code: 401, message: "token invalid" });
      }
    },
  );

  function resolveBotId(ctx: ApiContext): string | null {
    return ctx.query.botId || ctx.body?.botId || null;
  }

  function requireInstance(ctx: ApiContext) {
    const botId = resolveBotId(ctx);
    if (!botId) {
      return {
        response: error(400, {
          code: 400,
          message: "botId is required (query param or body)",
        }),
        instance: null,
      };
    }

    const instance = botManager.getInstance(botId);
    if (!instance) {
      return {
        response: error(404, {
          code: 404,
          message: `Bot "${botId}" not found`,
        }),
        instance: null,
      };
    }

    return { response: null, instance };
  }

  router.get("/bots/list", () => botManager.listAllBots());

  router.get("/config", () => ({
    code: 0,
    sections: getGlobalConfigSections(config),
    fields: getGlobalConfigFields(config),
  }));

  router.post("/config", ({ body }) => {
    const validation = validateGlobalConfigUpdate(body);
    if (!validation.valid) {
      return error(400, {
        code: 400,
        message: "invalid config update",
        errors: validation.errors,
      });
    }

    const applied: string[] = [];
    const requiresRestart: string[] = [];

    for (const [key, value] of Object.entries(validation.values)) {
      config.set(key, value);
      const field = getGlobalConfigField(key);
      if (field?.hotReloadable) {
        applied.push(key);
      }
      if (field?.restartRequired || !field?.hotReloadable) {
        requiresRestart.push(key);
      }

      if (key === "log.level" && typeof value === "string") {
        setConfiguredLogLevel(value);
      }
    }

    return {
      code: 0,
      message: "config saved",
      applied,
      requiresRestart,
      skipped: validation.skipped,
    };
  });

  router.post("/system/restart", () => {
    setTimeout(() => process.exit(0), 250);
    return {
      code: 0,
      message: "restart scheduled; external process manager must restart the process",
    };
  });

  router.post("/bots/create", async ({ body, status }) => {
    const b = body as any;
    const botId = b?.botId;
    if (!botId) {
      return status(400, { code: 400, message: "botId is required" });
    }

    try {
      if (
        b?.error_reply_enabled !== undefined &&
        typeof b.error_reply_enabled !== "boolean"
      ) {
        return status(400, {
          code: 400,
          message: "error_reply_enabled must be a boolean",
        });
      }

      const prefix = normalizePrefix(b?.prefix);
      const instance = await botManager.createInstance(botId, {
        name: b?.name,
        self_id: b?.self_id,
        prefix,
        error_reply_enabled: b?.error_reply_enabled,
        admin: b?.admin,
        adapters: b?.adapters,
        plugin_config: b?.plugin_config,
      });
      return {
        code: 0,
        message: `bot ${botId} created`,
        bot: instance.getInfo(),
      };
    } catch (e: any) {
      return status(400, { code: 400, message: e.message || String(e) });
    }
  });

  router.post("/bots/delete", async ({ body, status }) => {
    const botId = (body as any)?.botId;
    if (!botId) {
      return status(400, { code: 400, message: "botId is required" });
    }

    try {
      await botManager.deleteInstance(botId);
      return { code: 0, message: `bot ${botId} deleted` };
    } catch (e: any) {
      return status(404, { code: 404, message: e.message || String(e) });
    }
  });

  router.post("/bots/start", async ({ body, status }) => {
    const botId = (body as any)?.botId;
    if (!botId) {
      return status(400, { code: 400, message: "botId is required" });
    }
    if (botManager.hasInstance(botId)) {
      return status(400, {
        code: 400,
        message: `bot ${botId} is already running`,
      });
    }

    try {
      await botManager.startInstance(botId);
      const instance = botManager.getInstance(botId);
      return {
        code: 0,
        message: `bot ${botId} started`,
        bot: instance?.getInfo(),
      };
    } catch (e: any) {
      return status(500, {
        code: 500,
        message: `failed to start bot ${botId}: ${e.message || e}`,
      });
    }
  });

  router.post("/bots/stop", async ({ body, status }) => {
    const botId = (body as any)?.botId;
    if (!botId) {
      return status(400, { code: 400, message: "botId is required" });
    }

    const allBots = botManager.listAllBots();
    if (allBots.length <= 1) {
      return status(400, {
        code: 400,
        message: "cannot stop the only bot instance",
      });
    }

    const instance = botManager.getInstance(botId);
    if (!instance) {
      return status(404, {
        code: 404,
        message: `bot ${botId} not found or not running`,
      });
    }

    await botManager.stopInstance(botId);
    return { code: 0, message: `bot ${botId} stopped` };
  });

  router.get("/bots/config", (ctx) => {
    const botId = resolveBotId(ctx as ApiContext);
    if (!botId) {
      return error(400, {
        code: 400,
        message: "botId is required (query param)",
      });
    }

    if (!botConfigExists(botId)) {
      return error(404, {
        code: 404,
        message: `Bot "${botId}" config not found`,
      });
    }

    const config = createBotConfig(botId);
    const configData: Record<string, any> = {};
    const keys = [
      "name",
      "self_id",
      "prefix",
      "error_reply_enabled",
      "admin",
      "adapters",
      "plugin_config",
    ];
    for (const key of keys) {
      const val = config.get(key);
      if (val !== null) {
        configData[key] = val;
      }
    }
    return configData;
  });

  router.post("/bots/setConfig", async (ctx) => {
    const botId = resolveBotId(ctx as ApiContext);
    if (!botId) {
      return error(400, { code: 400, message: "botId is required" });
    }

    if (!botConfigExists(botId)) {
      return error(404, {
        code: 404,
        message: `Bot "${botId}" config not found`,
      });
    }

    const config = createBotConfig(botId);
    const body = ctx.body as any;
    if (
      body.error_reply_enabled !== undefined &&
      typeof body.error_reply_enabled !== "boolean"
    ) {
      return error(400, {
        code: 400,
        message: "error_reply_enabled must be a boolean",
      });
    }

    const allowedKeys = ["name", "self_id", "prefix", "error_reply_enabled", "admin"];
    const updated: Record<string, any> = {};
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        const value = key === "prefix" ? normalizePrefix(body[key]) : body[key];
        config.set(key, value);
        updated[key] = value;
      }
    }

    if (botManager.hasInstance(botId)) {
      await botManager.reloadInstance(botId);
    }

    return { code: 0, message: "config updated and bot reloaded", updated };
  });

  router.post("/bots/reload", async ({ body, status }) => {
    const botId = (body as any)?.botId;
    if (!botId) {
      return status(400, { code: 400, message: "botId is required" });
    }

    await botManager.reloadInstance(botId);
    return { code: 0, message: `bot ${botId} reloaded` };
  });

  router.get("/status", async (ctx) => {
    const { response, instance } = requireInstance(ctx as ApiContext);
    if (!instance) return response;

    const timezone =
      instance.globalConfig.get("database.timezone") ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC";
    const today = await instance.counter.getTodayStats(timezone);
    const daily = await instance.counter.getDailyStats(30, timezone);

    return {
      status: "ok",
      version,
      botId: instance.botId,
      timezone,
      plugins: instance.plugin.getLoadedPluginCount(),
      today: {
        messages: today.messages,
        users: today.users,
        groups: today.groups,
      },
      daily: daily.map((d) => ({
        date: d.stat_date,
        messages: d.messages,
        groups: d.groups,
        users: d.users,
      })),
    };
  });

  router.get("/plugins/list", (ctx) => {
    const { response, instance } = requireInstance(ctx as ApiContext);
    if (!instance) return response;

    const jsonData = [];
    const files = fs.existsSync("./plugins") ? fs.readdirSync("./plugins") : [];
    for (const file of files) {
      const pluginInfoPath = `./plugins/${file}/plugin.json`;
      if (!fs.existsSync(pluginInfoPath)) continue;

      const pluginJson = JSON.parse(fs.readFileSync(pluginInfoPath, "utf-8"));
      const pluginName = pluginJson.name;
      const isLoaded = instance.plugin.isPluginLoaded(pluginName);
      const isEnabled =
        instance.config.get(`plugin_config.${pluginName}.enabled`) ??
        config.get(`plugins.${pluginName}.enabled`) ??
        true;
      const schema = instance.plugin.getLoadedPluginSchema(pluginName);

      jsonData.push({
        name: pluginName,
        description: pluginJson.description || "",
        version: pluginJson.version || "",
        author: pluginJson.author || "",
        isEnabled,
        isLoaded,
        configSchema: schema,
      });
    }

    return jsonData;
  });

  router.post("/plugins/getConfig", (ctx) => {
    const { response, instance } = requireInstance(ctx as ApiContext);
    if (!instance) return response;

    const body = ctx.body as any;
    const pluginName = body?.name;
    if (!pluginName) {
      return error(400, { code: 400, message: "plugin name is required" });
    }

    let pluginConfig = instance.config.get(`plugin_config.${pluginName}`);
    if (!pluginConfig) {
      pluginConfig = config.get(`plugins.${pluginName}`);
    }
    const schema = instance.plugin.getLoadedPluginSchema(pluginName);

    return {
      config: pluginConfig,
      configSchema: schema,
    };
  });

  router.post("/plugins/setConfig", (ctx) => {
    const { response, instance } = requireInstance(ctx as ApiContext);
    if (!instance) return response;

    const body = ctx.body as any;
    const pluginName = body?.name;
    const pluginConfig = body?.config;

    if (!pluginName) {
      return error(400, { code: 400, message: "plugin name is required" });
    }

    const instanceConfig = instance.plugin.getLoadedPluginInstance(pluginName);
    if (instanceConfig) {
      const schema = getConfigSchema(instanceConfig.constructor);
      if (schema.length > 0) {
        const {
          valid,
          config: validatedConfig,
          errors,
        } = validateConfig(pluginConfig, schema);
        if (!valid && errors.some((err) => err.includes("required"))) {
          return error(400, { code: 400, errors });
        }

        const existingConfig =
          instance.config.get(`plugin_config.${pluginName}`) || {};
        const enabled = existingConfig.enabled ?? pluginConfig?.enabled ?? true;
        const nextConfig = { ...validatedConfig, enabled };

        instanceConfig.config = validatedConfig;
        instance.config.set(`plugin_config.${pluginName}`, nextConfig);
        return { code: 0, config: nextConfig };
      }
    }

    instance.config.set(`plugin_config.${pluginName}`, pluginConfig);
    return { code: 0 };
  });

  router.post("/plugins/reload", async (ctx) => {
    const botId = resolveBotId(ctx as ApiContext);
    if (!botId) return error(400, { code: 400, message: "botId is required" });

    const instance = botManager.getInstance(botId);
    if (!instance)
      return error(404, { code: 404, message: `Bot "${botId}" not found` });

    const pluginName = (ctx.body as any)?.name;
    if (pluginName) {
      await instance.plugin.reloadPlugin(pluginName, config);
      return { code: 0, message: `plugin ${pluginName} reloaded` };
    }

    await instance.plugin.reloadPlugins(config);
    return { code: 0, message: "plugins reloaded" };
  });

  router.post("/plugins/unload", async (ctx) => {
    const botId = resolveBotId(ctx as ApiContext);
    if (!botId) return error(400, { code: 400, message: "botId is required" });

    const instance = botManager.getInstance(botId);
    if (!instance)
      return error(404, { code: 404, message: `Bot "${botId}" not found` });

    const pluginName = (ctx.body as any)?.name;
    if (!pluginName)
      return error(400, { code: 400, message: "plugin name is required" });

    if (!instance.plugin.isPluginLoaded(pluginName)) {
      return error(400, {
        code: 400,
        message: `plugin ${pluginName} is not loaded`,
      });
    }

    await instance.plugin.unloadPlugin(pluginName);
    return { code: 0, message: `plugin ${pluginName} unloaded` };
  });

  router.post("/plugins/load", async (ctx) => {
    const botId = resolveBotId(ctx as ApiContext);
    if (!botId) return error(400, { code: 400, message: "botId is required" });

    const instance = botManager.getInstance(botId);
    if (!instance)
      return error(404, { code: 404, message: `Bot "${botId}" not found` });

    const pluginName = (ctx.body as any)?.name;
    if (!pluginName)
      return error(400, { code: 400, message: "plugin name is required" });

    if (instance.plugin.isPluginLoaded(pluginName)) {
      return error(400, {
        code: 400,
        message: `plugin ${pluginName} is already loaded`,
      });
    }

    const pluginDir = findPluginDir(pluginName);
    if (!pluginDir) {
      return error(404, {
        code: 404,
        message: `plugin ${pluginName} not found`,
      });
    }

    const pluginConfig = instance.config.get(`plugin_config.${pluginName}`);
    if (pluginConfig && pluginConfig.enabled === false) {
      pluginConfig.enabled = true;
      instance.config.set(`plugin_config.${pluginName}`, pluginConfig);
    }

    await instance.plugin.loadPlugin(
      pluginDir,
      instance.bot,
      instance.adapterManager,
      config,
    );
    return { code: 0, message: `plugin ${pluginName} loaded` };
  });

  router.post("/plugins/toggle", async (ctx) => {
    const botId = resolveBotId(ctx as ApiContext);
    if (!botId) return error(400, { code: 400, message: "botId is required" });

    const instance = botManager.getInstance(botId);
    if (!instance)
      return error(404, { code: 404, message: `Bot "${botId}" not found` });

    const body = ctx.body as any;
    const pluginName = body?.name;
    const enable = body?.enabled;

    if (!pluginName)
      return error(400, { code: 400, message: "plugin name is required" });
    if (typeof enable !== "boolean")
      return error(400, {
        code: 400,
        message: "enabled (boolean) is required",
      });

    if (enable) {
      const pluginConfig =
        instance.config.get(`plugin_config.${pluginName}`) || {};
      pluginConfig.enabled = true;
      instance.config.set(`plugin_config.${pluginName}`, pluginConfig);

      if (!instance.plugin.isPluginLoaded(pluginName)) {
        const pluginDir = findPluginDir(pluginName);
        if (pluginDir) {
          await instance.plugin.loadPlugin(
            pluginDir,
            instance.bot,
            instance.adapterManager,
            config,
          );
        }
      }
    } else {
      const pluginConfig =
        instance.config.get(`plugin_config.${pluginName}`) || {};
      pluginConfig.enabled = false;
      instance.config.set(`plugin_config.${pluginName}`, pluginConfig);

      if (instance.plugin.isPluginLoaded(pluginName)) {
        await instance.plugin.unloadPlugin(pluginName);
      }
    }

    return {
      code: 0,
      message: `plugin ${pluginName} ${enable ? "enabled" : "disabled"}`,
    };
  });

  function findPluginDir(pluginName: string): string | null {
    if (!fs.existsSync("./plugins")) return null;
    for (const file of fs.readdirSync("./plugins")) {
      const pluginInfoPath = `./plugins/${file}/plugin.json`;
      if (!fs.existsSync(pluginInfoPath)) continue;
      try {
        const pluginJson = JSON.parse(fs.readFileSync(pluginInfoPath, "utf-8"));
        if (pluginJson.name === pluginName || file === pluginName) {
          return file;
        }
      } catch (e) {}
    }
    return null;
  }

  router.get("/adapters/list", (ctx) => {
    const { response, instance } = requireInstance(ctx as ApiContext);
    if (!instance) return response;
    return instance.adapterManager.listAdapters();
  });

  router.post("/adapters/setConfig", (ctx) => {
    const { response, instance } = requireInstance(ctx as ApiContext);
    if (!instance) return response;

    const body = ctx.body as any;
    const adapterType = body?.type;
    if (!adapterType)
      return error(400, { code: 400, message: "adapter type is required" });

    const adapters = instance.config.get("adapters") || [];
    const adapterList = Array.isArray(adapters) ? adapters : [];
    const target = adapterList.find((item: any) => item.type === adapterType);

    if (target) {
      target.config = body?.config || {};
    } else {
      adapterList.push({ type: adapterType, config: body?.config || {} });
    }

    instance.config.set("adapters", adapterList);
    return { code: 0, config: body?.config || {} };
  });

  router.post("/adapters/reload", async (ctx) => {
    const botId = resolveBotId(ctx as ApiContext);
    if (!botId) return error(400, { code: 400, message: "botId is required" });

    const instance = botManager.getInstance(botId);
    if (!instance)
      return error(404, { code: 404, message: `Bot "${botId}" not found` });

    const adapterType = (ctx.body as any)?.type;
    if (adapterType) {
      await instance.adapterManager.reloadAdapter(adapterType);
      return { code: 0, message: `adapter ${adapterType} reloaded` };
    }

    await instance.adapterManager.reloadAll();
    return { code: 0, message: "adapters reloaded" };
  });

  router.get("/adapters/available", () => {
    return AdapterManager.getAvailableTypes();
  });

  router.post("/adapters/add", async (ctx) => {
    const botId = resolveBotId(ctx as ApiContext);
    if (!botId) return error(400, { code: 400, message: "botId is required" });

    const instance = botManager.getInstance(botId);
    if (!instance)
      return error(404, { code: 404, message: `Bot "${botId}" not found` });

    const body = ctx.body as any;
    const adapterType = body?.type;
    if (!adapterType)
      return error(400, { code: 400, message: "adapter type is required" });

    const adapters = instance.config.get("adapters") || [];
    const adapterList = Array.isArray(adapters) ? adapters : [];
    if (adapterList.some((item: any) => item.type === adapterType)) {
      return error(400, {
        code: 400,
        message: `adapter ${adapterType} already exists in config`,
      });
    }

    const adapterConfig = body?.config || {};
    adapterList.push({ type: adapterType, config: adapterConfig });
    instance.config.set("adapters", adapterList);

    try {
      await instance.adapterManager.loadAdapter(adapterType, adapterConfig);
    } catch (e: any) {
      return error(500, {
        code: 500,
        message: `failed to load adapter ${adapterType}: ${e.message || e}`,
      });
    }

    return { code: 0, message: `adapter ${adapterType} added and loaded` };
  });

  router.post("/adapters/remove", async (ctx) => {
    const botId = resolveBotId(ctx as ApiContext);
    if (!botId) return error(400, { code: 400, message: "botId is required" });

    const instance = botManager.getInstance(botId);
    if (!instance)
      return error(404, { code: 404, message: `Bot "${botId}" not found` });

    const body = ctx.body as any;
    const adapterType = body?.type;
    if (!adapterType)
      return error(400, { code: 400, message: "adapter type is required" });

    await instance.adapterManager.unloadAdapter(adapterType);

    const adapters = instance.config.get("adapters") || [];
    const adapterList = Array.isArray(adapters) ? adapters : [];
    const filtered = adapterList.filter(
      (item: any) => item.type !== adapterType,
    );
    instance.config.set("adapters", filtered);

    return { code: 0, message: `adapter ${adapterType} removed` };
  });

  router.get("/messages", async (ctx) => {
    const { response, instance } = requireInstance(ctx as ApiContext);
    if (!instance) return response;

    const query = (ctx as ApiContext).query;
    const limit = Math.min(
      Math.max(parseInt(query?.limit || "20") || 20, 1),
      200,
    );
    const offset = Math.max(parseInt(query?.offset || "0") || 0, 0);
    const type = query?.type && query.type !== "null" ? query.type : undefined;

    const [data, total] = await Promise.all([
      instance.counter.getMessages(limit, offset, type),
      instance.counter.getMessageCount(type),
    ]);

    return { total, limit, offset, data };
  });

  router.get("/commands/list", (ctx) => {
    const { response, instance } = requireInstance(ctx as ApiContext);
    if (!instance) return response;
    return instance.bot.commands;
  });

  router.get("/db/tables", async () => {
    if (!databaseManager.isInitialized()) {
      return error(503, { code: 503, message: "database not initialized" });
    }
    try {
      const tables = await databaseManager.listTables();
      const engine = databaseManager.getEngineType();
      const tableInfos = await Promise.all(
        tables.map(async (name) => {
          const count = await databaseManager.getRowCount(name);
          return { name, rowCount: count };
        }),
      );
      return { engine, tables: tableInfos };
    } catch (e: any) {
      return error(500, { code: 500, message: e.message || String(e) });
    }
  });

  router.get("/db/table", async (ctx) => {
    if (!databaseManager.isInitialized()) {
      return error(503, { code: 503, message: "database not initialized" });
    }
    const query = (ctx as ApiContext).query;
    const tableName = query?.name;
    if (!tableName) {
      return error(400, { code: 400, message: "table name is required" });
    }
    try {
      const columns = await databaseManager.describeTable(tableName);
      const rowCount = await databaseManager.getRowCount(tableName);
      return { name: tableName, columns, rowCount };
    } catch (e: any) {
      return error(404, { code: 404, message: e.message || String(e) });
    }
  });

  router.get("/db/table/data", async (ctx) => {
    if (!databaseManager.isInitialized()) {
      return error(503, { code: 503, message: "database not initialized" });
    }
    const query = (ctx as ApiContext).query;
    const tableName = query?.name;
    if (!tableName) {
      return error(400, { code: 400, message: "table name is required" });
    }
    const limit = Math.min(
      Math.max(parseInt(query?.limit || "50") || 50, 1),
      500,
    );
    const offset = Math.max(parseInt(query?.offset || "0") || 0, 0);
    const sortBy = query?.sortBy || undefined;
    const sortOrder = query?.sortOrder === "desc" ? "DESC" : "ASC";

    try {
      let sql = `SELECT * FROM "${tableName}"`;
      if (sortBy) {
        sql += ` ORDER BY "${sortBy}" ${sortOrder}`;
      }
      sql += ` LIMIT ${limit} OFFSET ${offset}`;
      const rows = await databaseManager.queryRaw(sql);
      const totalCount = await databaseManager.getRowCount(tableName);
      return { rows, total: totalCount, limit, offset };
    } catch (e: any) {
      return error(500, { code: 500, message: e.message || String(e) });
    }
  });

  router.post("/db/query", async ({ body }) => {
    if (!databaseManager.isInitialized()) {
      return error(503, { code: 503, message: "database not initialized" });
    }
    const b = body as any;
    const sql = b?.sql;
    if (!sql || typeof sql !== "string") {
      return error(400, { code: 400, message: "sql is required" });
    }

    const forbidden =
      /\b(DROP\s+DATABASE|ALTER\s+DATABASE|CREATE\s+DATABASE)\b/i;
    if (forbidden.test(sql)) {
      return error(403, {
        code: 403,
        message: "this SQL statement is not allowed",
      });
    }

    try {
      const trimmed = sql.trim().toUpperCase();
      if (
        trimmed.startsWith("SELECT") ||
        trimmed.startsWith("PRAGMA") ||
        trimmed.startsWith("EXPLAIN") ||
        trimmed.startsWith("WITH")
      ) {
        const rows = await databaseManager.queryRaw(sql);
        return { type: "query", rows, rowCount: rows.length };
      } else {
        const result = await databaseManager.executeRaw(sql);
        return {
          type: "execute",
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid,
        };
      }
    } catch (e: any) {
      return error(400, { code: 400, message: e.message || String(e) });
    }
  });

  router.post("/db/table/row", async ({ body }) => {
    if (!databaseManager.isInitialized()) {
      return error(503, { code: 503, message: "database not initialized" });
    }
    const b = body as any;
    const tableName = b?.table;
    const data = b?.data;
    if (!tableName) {
      return error(400, { code: 400, message: "table name is required" });
    }
    if (!data || typeof data !== "object") {
      return error(400, { code: 400, message: "data object is required" });
    }

    try {
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns
        .map((_, i) => databaseManager.getPlaceholder(i + 1))
        .join(", ");
      const colList = columns.map((c) => `"${c}"`).join(", ");
      const sql = `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders})`;
      const result = await databaseManager.executeRaw(sql, values);
      return {
        code: 0,
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid,
      };
    } catch (e: any) {
      return error(400, { code: 400, message: e.message || String(e) });
    }
  });

  router.put("/db/table/row", async ({ body }) => {
    if (!databaseManager.isInitialized()) {
      return error(503, { code: 503, message: "database not initialized" });
    }
    const b = body as any;
    const tableName = b?.table;
    const data = b?.data;
    const where = b?.where;
    if (!tableName) {
      return error(400, { code: 400, message: "table name is required" });
    }
    if (!data || typeof data !== "object") {
      return error(400, { code: 400, message: "data object is required" });
    }
    if (!where || typeof where !== "object") {
      return error(400, { code: 400, message: "where object is required" });
    }

    try {
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;
      for (const [key, value] of Object.entries(data)) {
        setClauses.push(
          `"${key}" = ${databaseManager.getPlaceholder(paramIdx++)}`,
        );
        values.push(value);
      }
      const whereClauses: string[] = [];
      for (const [key, value] of Object.entries(where)) {
        whereClauses.push(
          `"${key}" = ${databaseManager.getPlaceholder(paramIdx++)}`,
        );
        values.push(value);
      }
      const sql = `UPDATE "${tableName}" SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")}`;
      const result = await databaseManager.executeRaw(sql, values);
      return { code: 0, changes: result.changes };
    } catch (e: any) {
      return error(400, { code: 400, message: e.message || String(e) });
    }
  });

  router.post("/db/table/row/delete", async ({ body }) => {
    if (!databaseManager.isInitialized()) {
      return error(503, { code: 503, message: "database not initialized" });
    }
    const b = body as any;
    const tableName = b?.table;
    const where = b?.where;
    if (!tableName) {
      return error(400, { code: 400, message: "table name is required" });
    }
    if (
      !where ||
      typeof where !== "object" ||
      Object.keys(where).length === 0
    ) {
      return error(400, {
        code: 400,
        message: "where object with at least one condition is required",
      });
    }

    try {
      const whereClauses: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;
      for (const [key, value] of Object.entries(where)) {
        whereClauses.push(
          `"${key}" = ${databaseManager.getPlaceholder(paramIdx++)}`,
        );
        values.push(value);
      }
      const sql = `DELETE FROM "${tableName}" WHERE ${whereClauses.join(" AND ")}`;
      const result = await databaseManager.executeRaw(sql, values);
      return { code: 0, changes: result.changes };
    } catch (e: any) {
      return error(400, { code: 400, message: e.message || String(e) });
    }
  });

  router.post("/db/table/create", async ({ body }) => {
    if (!databaseManager.isInitialized()) {
      return error(503, { code: 503, message: "database not initialized" });
    }
    const b = body as any;
    const tableName = b?.name;
    const columns = b?.columns;
    if (!tableName) {
      return error(400, { code: 400, message: "table name is required" });
    }
    if (!columns || !Array.isArray(columns)) {
      return error(400, { code: 400, message: "columns array is required" });
    }

    try {
      const columnDefs = columns.map((col: any) => {
        let def = `"${col.name}" ${col.type || "TEXT"}`;
        if (col.primaryKey) def += " PRIMARY KEY";
        if (col.autoIncrement) {
          def +=
            databaseManager.getEngineType() === "sqlite"
              ? " AUTOINCREMENT"
              : "";
        }
        if (col.notNull) def += " NOT NULL";
        if (col.unique) def += " UNIQUE";
        if (col.defaultValue !== undefined && col.defaultValue !== null) {
          def += ` DEFAULT ${typeof col.defaultValue === "string" ? `'${col.defaultValue}'` : col.defaultValue}`;
        }
        return def;
      });
      const sql = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${columnDefs.join(",\n  ")}\n)`;
      await databaseManager.executeRaw(sql);
      return { code: 0, message: `table "${tableName}" created` };
    } catch (e: any) {
      return error(400, { code: 400, message: e.message || String(e) });
    }
  });

  router.post("/db/table/drop", async ({ body }) => {
    if (!databaseManager.isInitialized()) {
      return error(503, { code: 503, message: "database not initialized" });
    }
    const b = body as any;
    const tableName = b?.name;
    if (!tableName) {
      return error(400, { code: 400, message: "table name is required" });
    }

    try {
      const sql = `DROP TABLE IF EXISTS "${tableName}"`;
      await databaseManager.executeRaw(sql);
      return { code: 0, message: `table "${tableName}" dropped` };
    } catch (e: any) {
      return error(400, { code: 400, message: e.message || String(e) });
    }
  });

  router.get("/logs", (ctx) => {
    const query = (ctx as ApiContext).query;
    const after = parseInt(query?.after || "0") || 0;
    const level = query?.level || undefined;
    const search = query?.search || undefined;
    const limit = Math.min(
      Math.max(parseInt(query?.limit || "500") || 500, 1),
      2000,
    );

    let entries = getLogBufferAfter(after, level, search);
    if (entries.length > limit) {
      entries = entries.slice(entries.length - limit);
    }

    return { entries, total: entries.length };
  });

  router.get("/logs/stream", ({ request }) => {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let closed = false;

        const send = (entry: LogEntry) => {
          if (closed) return;
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(entry)}\n\n`),
            );
          } catch {
            cleanup();
          }
        };

        const cleanup = () => {
          if (closed) return;
          closed = true;
          unsubscribeFromLogs(send);
          clearInterval(heartbeatTimer);
          try {
            controller.close();
          } catch {}
        };

        subscribeToLogs(send);

        const heartbeatTimer = setInterval(() => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            cleanup();
          }
        }, 15000);

        try {
          controller.enqueue(encoder.encode(": connected\n\n"));
        } catch {
          cleanup();
        }

        request.signal.addEventListener("abort", cleanup, { once: true });

        try {
          const socket = (request as any).socket;
          if (socket && typeof socket.on === "function") {
            socket.on("close", cleanup);
          }
        } catch {}
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  return router;
}
