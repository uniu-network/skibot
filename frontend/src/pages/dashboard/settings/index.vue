<template>
  <n-layout style="height: 100vh">
    <n-layout-content
      style="margin-top: 30px; margin-left: 30px; margin-right: 30px"
    >
      <n-space vertical size="large">
        <n-flex justify="space-between" align="center">
          <div>
            <h2 style="margin: 0 0 6px">系统设置</h2>
          </div>
          <n-space>
            <n-button type="error" secondary @click="handleRestart">
              重启程序
            </n-button>
            <n-button type="primary" :loading="saving" @click="saveConfig">
              保存
            </n-button>
          </n-space>
        </n-flex>

        <n-spin :show="loading">
          <template v-if="sections.length > 0">
            <n-card
              v-for="section in sections"
              :key="section.key"
              :title="section.label"
              size="small"
              style="margin-bottom: 16px"
            >
              <n-form label-placement="left" label-width="180">
                <n-form-item
                  v-for="field in section.fields"
                  :key="field.key"
                  :feedback="field.description || undefined"
                >
                  <template #label>
                    <n-space align="center" :size="6">
                      <span>{{ field.label }}</span>
                      <n-tag
                        :type="tagType(field)"
                        size="tiny"
                        :bordered="false"
                      >
                        {{ tagLabel(field) }}
                      </n-tag>
                    </n-space>
                  </template>

                  <!-- boolean -->
                  <n-switch
                    v-if="field.type === 'boolean'"
                    v-model:value="formData[field.key]"
                  />

                  <!-- number -->
                  <n-input-number
                    v-else-if="field.type === 'number'"
                    v-model:value="formData[field.key]"
                    style="width: 100%"
                  />

                  <!-- enum / options -->
                  <n-select
                    v-else-if="field.type === 'enum' || field.options"
                    v-model:value="formData[field.key]"
                    :options="optionsForField(field)"
                    style="width: 100%"
                  />

                  <!-- password -->
                  <n-input
                    v-else-if="field.type === 'password'"
                    v-model:value="formData[field.key]"
                    type="password"
                    placeholder="留空表示不修改"
                    show-password-on="click"
                  />

                  <!-- string (default) -->
                  <n-input
                    v-else
                    v-model:value="formData[field.key]"
                  />
                </n-form-item>
              </n-form>
            </n-card>
          </template>
          <n-empty
            v-else-if="!loading"
            description="暂无配置项"
            style="margin-top: 50px"
          />
        </n-spin>
      </n-space>
    </n-layout-content>
  </n-layout>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import axios from "axios";
import { useMessage, useDialog } from "naive-ui";

const message = useMessage();
const dialog = useDialog();

// ── Backend response shapes (GET /api/config) ──────────────────────

interface BackendField {
  key: string;
  type?: string;
  label?: string;
  value: unknown;
  default?: unknown;
  description?: string;
  hotReloadable?: boolean;
  restartRequired?: boolean;
  required?: boolean;
  /** Backend sends options as string[] */
  options?: string[];
  /** Legacy: enum as string[] */
  enum?: string[];
}

interface BackendSection {
  name?: string;
  key?: string;
  label?: string;
  fields?: BackendField[];
}

// ── Frontend types (what the template consumes) ────────────────────

interface ConfigField {
  key: string;
  type: string;
  label: string;
  value: unknown;
  default?: unknown;
  hotReloadable: boolean;
  restartRequired?: boolean;
  required?: boolean;
  description?: string;
  /** n-select compatible: always { label, value }[] after normalization */
  options?: { label: string; value: unknown }[];
}

interface ConfigSection {
  key: string;
  label: string;
  /** Backend may send `name` instead of `key`/`label` */
  name?: string;
  fields: ConfigField[];
}

// ── Normalization helpers ──────────────────────────────────────────

function isStringArray(arr: unknown[]): arr is string[] {
  return arr.every((item) => typeof item === "string");
}

/**
 * Convert backend string[] options into n-select `{ label, value }[]`.
 * Already-object options pass through unchanged.
 */
function normalizeOptions(raw: unknown): { label: string; value: unknown }[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  if (isStringArray(raw)) {
    return raw.map((v) => ({ label: v, value: v }));
  }
  // Already in { label, value } shape
  return raw as { label: string; value: unknown }[];
}

function normalizeField(field: BackendField): ConfigField {
  const key = field.key;
  return {
    key,
    type: field.type ?? "string",
    label: field.label || key.split(".").pop() || key,
    value: field.value,
    default: field.default,
    hotReloadable: field.hotReloadable ?? false,
    restartRequired: field.restartRequired,
    required: field.required,
    description: field.description,
    options: normalizeOptions(field.options ?? field.enum),
  };
}

function normalizeSections(rawSections: BackendSection[]): ConfigSection[] {
  return rawSections.map((raw) => {
    const name = raw.name || raw.key || raw.label || "";
    return {
      key: raw.key || name,
      label: raw.label || name,
      name: raw.name,
      fields: (raw.fields ?? []).map(normalizeField),
    };
  });
}

// ── Reactive state ─────────────────────────────────────────────────

const loading = ref(true);
const saving = ref(false);
const sections = ref<ConfigSection[]>([]);
const formData = ref<Record<string, unknown>>({});
const originalValues = ref<Record<string, unknown>>({});

// ── Template helpers ───────────────────────────────────────────────

function optionsForField(field: ConfigField) {
  return field.options ?? [];
}

function needsRestart(field: ConfigField): boolean {
  return field.hotReloadable !== true;
}

function tagLabel(field: ConfigField): string {
  return needsRestart(field) ? "重启后生效" : "即时生效";
}

function tagType(field: ConfigField): "success" | "warning" {
  return needsRestart(field) ? "warning" : "success";
}

// ── API calls ──────────────────────────────────────────────────────

async function loadConfig() {
  loading.value = true;
  try {
    const resp = await axios.get("/api/config", { withCredentials: true });
    const data = resp.data;

    let rawSections: BackendSection[] = data.sections ?? [];
    // Fallback: wrap flat fields list into a default section
    if (rawSections.length === 0 && data.fields && Array.isArray(data.fields)) {
      rawSections = [{ name: "配置", fields: data.fields as BackendField[] }];
    }

    sections.value = normalizeSections(rawSections);

    const fd: Record<string, unknown> = {};
    const ov: Record<string, unknown> = {};
    for (const section of sections.value) {
      for (const field of section.fields) {
        fd[field.key] = field.value;
        ov[field.key] = field.value;
      }
    }
    formData.value = fd;
    originalValues.value = ov;
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } }; message?: string };
    message.error(
      `获取配置失败: ${err.response?.data?.message || err.message || "未知错误"}`,
    );
    sections.value = [];
  } finally {
    loading.value = false;
  }
}

async function saveConfig() {
  const changed: Record<string, unknown> = {};
  let hasChange = false;

  for (const section of sections.value) {
    for (const field of section.fields) {
      const current = formData.value[field.key];
      const original = originalValues.value[field.key];

      if (current === original) continue;

      // Password field: skip if empty (unchanged means keep existing)
      if (field.type === "password" && (current === "" || current == null)) {
        continue;
      }

      changed[field.key] = current;
      hasChange = true;
    }
  }

  if (!hasChange) {
    message.info("没有需要保存的更改");
    return;
  }

  saving.value = true;
  try {
    const resp = await axios.post("/api/config", changed, { withCredentials: true });

    for (const key of Object.keys(changed)) {
      originalValues.value[key] = formData.value[key];
    }

    const requiresRestart = resp.data?.requiresRestart;
    if (
      requiresRestart &&
      Array.isArray(requiresRestart) &&
      requiresRestart.length > 0
    ) {
      dialog.warning({
        title: "配置已保存",
        content: `以下配置项需要重启程序后生效：${requiresRestart.join("、")}`,
        positiveText: "立即重启",
        negativeText: "稍后重启",
        onPositiveClick: () => {
          handleRestart();
        },
        onNegativeClick: () => {},
      });
    } else {
      message.success("配置保存成功");
    }
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } }; message?: string };
    message.error(
      `保存失败: ${err.response?.data?.message || err.message || "未知错误"}`,
    );
  } finally {
    saving.value = false;
  }
}

async function handleRestart() {
  dialog.warning({
    title: "确认重启程序",
    content: "重启将中断当前所有连接与服务，确定要重启程序吗？",
    positiveText: "确认重启",
    negativeText: "取消",
    onPositiveClick: async () => {
      try {
        await axios.post(
          "/api/system/restart",
          {},
          { withCredentials: true },
        );
        message.info(
          "重启请求已发送，前端连接即将中断。程序重启取决于进程管理器配置。",
          { duration: 10000 },
        );
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string } }; message?: string };
        message.error(
          `重启失败: ${err.response?.data?.message || err.message || "未知错误"}`,
        );
      }
    },
  });
}

onMounted(() => {
  loadConfig();
});
</script>

<style scoped></style>
