import type { Config } from "./config.js";

export type GlobalConfigFieldType = "string" | "number" | "boolean";
export type GlobalConfigControlType = GlobalConfigFieldType | "enum" | "password";

export type GlobalConfigSectionName =
  | "日志"
  | "Web 服务"
  | "Dashboard"
  | "数据库"
  | "消息清理";

export interface GlobalConfigField {
  key: string;
  type: GlobalConfigFieldType;
  label: string;
  description: string;
  section: GlobalConfigSectionName;
  enum?: string[];
  sensitive?: boolean;
  hotReloadable?: boolean;
  restartRequired?: boolean;
}

export interface FrontendGlobalConfigField {
  key: string;
  label: string;
  type: GlobalConfigControlType;
  value: unknown;
  description: string;
  hotReloadable: boolean;
  restartRequired: boolean;
  options?: string[];
  sensitive?: boolean;
}

export interface FrontendGlobalConfigSection {
  name: GlobalConfigSectionName;
  fields: FrontendGlobalConfigField[];
}

export interface GlobalConfigValidationResult {
  valid: boolean;
  values: Record<string, string | number | boolean>;
  skipped: string[];
  errors: string[];
}

const LOG_LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];
const DATABASE_ENGINES = ["sqlite", "pgsql"];
const HOT_RELOADABLE_CONFIG_KEYS = new Set([
  "log.level",
  "web.username",
  "web.password",
]);

export const globalConfigSchema: GlobalConfigField[] = [
  {
    key: "log.level",
    label: "日志级别",
    type: "string",
    description: "控制系统输出日志的详细程度。",
    section: "日志",
    enum: LOG_LEVELS,
    hotReloadable: true,
  },
  {
    key: "web.host",
    label: "监听地址",
    type: "string",
    description: "Web 服务绑定的主机地址。",
    section: "Web 服务",
    restartRequired: true,
  },
  {
    key: "web.port",
    label: "监听端口",
    type: "number",
    description: "Web 服务监听的端口号。",
    section: "Web 服务",
    restartRequired: true,
  },
  {
    key: "web.username",
    label: "登录用户名",
    type: "string",
    description: "Dashboard 登录使用的用户名。",
    section: "Web 服务",
    hotReloadable: true,
  },
  {
    key: "web.password",
    label: "登录密码",
    type: "string",
    description: "Dashboard 登录使用的密码，留空时不会覆盖现有密码。",
    section: "Web 服务",
    sensitive: true,
    hotReloadable: true,
  },
  {
    key: "dashboard.debug",
    label: "调试模式",
    type: "boolean",
    description: "启用 Dashboard 调试相关输出。",
    section: "Dashboard",
    restartRequired: true,
  },
  {
    key: "database.engine",
    label: "数据库引擎",
    type: "string",
    description: "选择后端使用的数据库类型。",
    section: "数据库",
    enum: DATABASE_ENGINES,
    restartRequired: true,
  },
  {
    key: "database.sqlite.file",
    label: "SQLite 文件路径",
    type: "string",
    description: "SQLite 数据库文件保存位置。",
    section: "数据库",
    restartRequired: true,
  },
  {
    key: "database.pgsql.connectionString",
    label: "PostgreSQL 连接字符串",
    type: "string",
    description: "连接 PostgreSQL 数据库使用的连接字符串。",
    section: "数据库",
    restartRequired: true,
  },
  {
    key: "database.pgsql.pool.min",
    label: "连接池最小连接数",
    type: "number",
    description: "PostgreSQL 连接池保持的最小连接数量。",
    section: "数据库",
    restartRequired: true,
  },
  {
    key: "database.pgsql.pool.max",
    label: "连接池最大连接数",
    type: "number",
    description: "PostgreSQL 连接池允许的最大连接数量。",
    section: "数据库",
    restartRequired: true,
  },
  {
    key: "database.message_retention_days",
    label: "消息保留天数",
    type: "number",
    description: "消息记录在自动清理前保留的天数。",
    section: "消息清理",
    restartRequired: true,
  },
  {
    key: "database.cleanup_time",
    label: "清理时间",
    type: "string",
    description: "每日执行消息清理任务的时间。",
    section: "消息清理",
    restartRequired: true,
  },
  {
    key: "database.timezone",
    label: "清理时区",
    type: "string",
    description: "消息统计与清理调度使用的时区。",
    section: "消息清理",
    restartRequired: true,
  },
];

const schemaByKey = new Map(globalConfigSchema.map((field) => [field.key, field]));

export function getGlobalConfigFields(config: Config): Array<
  GlobalConfigField & { value: unknown }
> {
  return globalConfigSchema.map((field) => ({
    ...field,
    value: field.sensitive ? null : config.get(field.key),
  }));
}

export function getGlobalConfigSections(
  config: Config,
): FrontendGlobalConfigSection[] {
  const sections: FrontendGlobalConfigSection[] = [
    { name: "日志", fields: [] },
    { name: "Web 服务", fields: [] },
    { name: "Dashboard", fields: [] },
    { name: "数据库", fields: [] },
    { name: "消息清理", fields: [] },
  ];
  const sectionByName = new Map(sections.map((section) => [section.name, section]));

  for (const field of globalConfigSchema) {
    const section = sectionByName.get(field.section);
    if (!section) continue;
    section.fields.push(toFrontendField(field, config));
  }

  return sections;
}

export function getGlobalConfigField(key: string): GlobalConfigField | undefined {
  return schemaByKey.get(key);
}

export function validateGlobalConfigUpdate(
  input: unknown,
): GlobalConfigValidationResult {
  const errors: string[] = [];
  const skipped: string[] = [];
  const values: Record<string, string | number | boolean> = {};

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      valid: false,
      values,
      skipped,
      errors: ["request body must be an object"],
    };
  }

  const source = "config" in input && isPlainObject(input.config)
    ? input.config
    : input;

  for (const [key, rawValue] of Object.entries(source)) {
    const field = schemaByKey.get(key);
    if (!field) {
      errors.push(`${key} is not an allowed config key`);
      continue;
    }

    if (
      field.sensitive &&
      typeof rawValue === "string" &&
      rawValue.trim().length === 0
    ) {
      skipped.push(key);
      continue;
    }

    const parsed = parseValue(field, rawValue);
    if (parsed.valid === false) {
      errors.push(parsed.error);
      continue;
    }

    values[key] = parsed.value;
  }

  return { valid: errors.length === 0, values, skipped, errors };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseValue(
  field: GlobalConfigField,
  value: unknown,
):
  | { valid: true; value: string | number | boolean }
  | { valid: false; error: string } {
  if (field.type === "string") {
    if (typeof value !== "string") {
      return { valid: false, error: `${field.key} must be a string` };
    }
    const normalized = field.key === "log.level" ? value.toUpperCase() : value;
    if (field.enum && !field.enum.includes(normalized)) {
      return {
        valid: false,
        error: `${field.key} must be one of: ${field.enum.join(", ")}`,
      };
    }
    return { valid: true, value: normalized };
  }

  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { valid: false, error: `${field.key} must be a finite number` };
    }
    return { valid: true, value };
  }

  if (typeof value !== "boolean") {
    return { valid: false, error: `${field.key} must be a boolean` };
  }
  return { valid: true, value };
}

function toFrontendField(
  field: GlobalConfigField,
  config: Config,
): FrontendGlobalConfigField {
  const hotReloadable = HOT_RELOADABLE_CONFIG_KEYS.has(field.key);
  const frontendField: FrontendGlobalConfigField = {
    key: field.key,
    label: field.label,
    type: getControlType(field),
    value: field.sensitive ? null : config.get(field.key),
    description: field.description,
    hotReloadable,
    restartRequired: !hotReloadable,
  };

  if (field.enum) {
    frontendField.options = field.enum;
  }
  if (field.sensitive) {
    frontendField.sensitive = true;
  }

  return frontendField;
}

function getControlType(field: GlobalConfigField): GlobalConfigControlType {
  if (field.enum) return "enum";
  if (field.key === "web.password") return "password";
  return field.type;
}
