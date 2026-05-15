<template>
  <n-layout style="height: 100vh">
    <n-layout-content
      style="margin-top: 30px; margin-left: 30px; margin-right: 30px"
    >
      <n-space vertical size="large">
        <n-flex justify="space-between" align="center">
          <div>
            <h2 style="margin: 0 0 6px">插件管理</h2>
          </div>
          <n-space>
            <n-button
              type="primary"
              secondary
              :loading="reloadingAll"
              @click="reloadAll"
            >
              重载全部
            </n-button>
          </n-space>
        </n-flex>

        <n-spin :show="loadingRef">
          <n-grid :cols="isPhone ? 1 : 2" x-gap="16" y-gap="16">
            <n-gi v-for="item in data" :key="item.name">
              <n-card hoverable :title="item.name" size="small">
                <template #header-extra>
                  <n-tooltip trigger="hover">
                    <template #trigger>
                      <n-switch
                        :value="item.isEnabled && item.isLoaded"
                        :loading="togglingPlugin === item.name"
                        @update:value="(val) => togglePlugin(item, val)"
                      >
                        <template #checked>启用</template>
                        <template #unchecked>停用</template>
                      </n-switch>
                    </template>
                    {{
                      item.isEnabled && item.isLoaded
                        ? "已启用"
                        : item.isEnabled === false
                          ? "已禁用"
                          : "未加载"
                    }}
                  </n-tooltip>
                </template>
                <n-descriptions
                  bordered
                  :column="1"
                  label-placement="left"
                  size="small"
                >
                  <n-descriptions-item label="描述">{{
                    item.description || "无描述"
                  }}</n-descriptions-item>
                  <n-descriptions-item label="版本">{{
                    item.version || "-"
                  }}</n-descriptions-item>
                  <n-descriptions-item label="作者">{{
                    item.author || "-"
                  }}</n-descriptions-item>
                  <n-descriptions-item label="状态">
                    <n-space align="center" :size="6">
                      <n-tag :type="statusTagType(item)" size="small">
                        {{ statusText(item) }}
                      </n-tag>
                    </n-space>
                  </n-descriptions-item>
                </n-descriptions>
                <template #action>
                  <n-flex>
                    <n-button
                      v-if="item.isLoaded"
                      tertiary
                      type="info"
                      size="small"
                      :loading="reloadingPlugin === item.name"
                      @click="reloadPlugin(item)"
                    >
                      重载
                    </n-button>
                    <n-button
                      v-if="item.isLoaded"
                      tertiary
                      type="warning"
                      size="small"
                      @click="unloadPlugin(item)"
                    >
                      卸载
                    </n-button>
                    <n-button
                      v-if="!item.isLoaded && item.isEnabled !== false"
                      tertiary
                      type="success"
                      size="small"
                      :loading="loadingPlugin === item.name"
                      @click="loadPlugin(item)"
                    >
                      加载
                    </n-button>
                    <n-button
                      v-if="item.isLoaded || item.configSchema"
                      tertiary
                      size="small"
                      @click="openConfig(item)"
                    >
                      配置
                    </n-button>
                  </n-flex>
                </template>
              </n-card>
            </n-gi>
          </n-grid>
          <n-empty
            v-if="data.length === 0 && !loadingRef"
            description="暂无插件"
            style="margin-top: 50px"
          />
        </n-spin>
      </n-space>
    </n-layout-content>
  </n-layout>

  <n-drawer v-model:show="configDrawerVisible" :width="560" placement="right">
    <n-drawer-content :title="`配置 - ${currentPlugin?.name || ''}`" closable>
      <n-spin :show="configLoading">
        <n-space vertical>
          <template
            v-if="
              pluginConfigFields.length > 0
            "
          >
            <template v-for="field in pluginConfigFields" :key="field.key">
              <n-form-item :required="field.required">
                <template #label>
                  <div>
                    <span>{{ field.key }}</span>
                    <n-text
                      v-if="field.description"
                      depth="3"
                      style="font-size: 12px; display: block"
                      >{{ field.description }}</n-text
                    >
                  </div>
                </template>
                <n-switch
                  v-if="field.type === 'boolean'"
                  v-model:value="configData[field.key]"
                />
                <n-input-number
                  v-else-if="field.type === 'number'"
                  v-model:value="configData[field.key]"
                  :placeholder="`默认: ${field.default ?? ''}`"
                  style="width: 100%"
                />
                <n-dynamic-tags
                  v-else-if="field.type === 'string[]'"
                  v-model:value="configData[field.key]"
                />
                <n-input
                  v-else-if="field.type === 'string'"
                  v-model:value="configData[field.key]"
                  :placeholder="`默认: ${field.default ?? ''}`"
                />
                <n-input
                  v-else-if="field.type === 'object'"
                  type="textarea"
                  v-model:value="objectFields[field.key]"
                  :rows="4"
                  placeholder="JSON 格式"
                  @update:value="(val) => tryParseObject(field.key, val)"
                />
              </n-form-item>
            </template>
          </template>
          <template v-else>
            <n-alert type="warning" :bordered="false">
              该插件没有定义配置 schema，将以键值对形式编辑配置。
            </n-alert>
            <n-dynamic-input
              v-model:value="configEntries"
              :on-create="createConfigEntry"
            >
              <template #default="{ value }">
                <n-input
                  v-model:value="value.key"
                  placeholder="配置名"
                  style="width: 42%; margin-right: 8px"
                />
                <n-input
                  v-model:value="value.value"
                  placeholder="配置值"
                  style="width: 55%"
                />
              </template>
            </n-dynamic-input>
          </template>
        </n-space>
      </n-spin>
      <template #footer>
        <n-flex>
          <n-button @click="configDrawerVisible = false">取消</n-button>
          <n-button type="primary" :loading="savingConfig" @click="saveConfig"
            >保存</n-button
          >
        </n-flex>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, reactive } from "vue";
import { useStore } from "vuex";
import axios from "axios";
import { useMessage, useDialog } from "naive-ui";

const message = useMessage();
const dialog = useDialog();
const store = useStore();
const currentBotId = computed(() => store.state.currentBotId);
const isPhone = computed(() => store.state.isphone);

const data = ref<any[]>([]);
const loadingRef = ref(true);
const reloadingAll = ref(false);
const reloadingPlugin = ref<string | null>(null);
const loadingPlugin = ref<string | null>(null);
const togglingPlugin = ref<string | null>(null);

const configDrawerVisible = ref(false);
const configLoading = ref(false);
const savingConfig = ref(false);
const currentPlugin = ref<any>(null);
const configData = ref<Record<string, any>>({});
const configSchema = ref<any>(null);
const configEntries = ref<{ key: string; value: string }[]>([]);
const objectFields = reactive<Record<string, string>>({});
const internalPluginConfigKeys = new Set(["enabled"]);

const pluginConfigFields = computed(() => {
  const fields = configSchema.value?.fields || [];
  return fields.filter((field: any) => !internalPluginConfigKeys.has(field.key));
});

function statusTagType(item: any): string {
  if (item.isEnabled === false) return "error";
  if (item.isLoaded && item.isEnabled) return "success";
  if (!item.isLoaded) return "warning";
  return "default";
}

function statusText(item: any): string {
  if (item.isEnabled === false) return "已禁用";
  if (item.isLoaded && item.isEnabled) return "运行中";
  if (!item.isLoaded) return "未加载";
  return "未知";
}

function createConfigEntry() {
  return { key: "", value: "" };
}

function omitInternalConfig(config: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => !internalPluginConfigKeys.has(key)),
  );
}

function tryParseObject(key: string, val: string) {
  try {
    configData.value[key] = JSON.parse(val);
  } catch (e) {
    // keep raw string, user is still editing
  }
}

async function loadPlugins() {
  if (!currentBotId.value) {
    loadingRef.value = false;
    return;
  }
  loadingRef.value = true;
  try {
    const resp = await axios.get("/api/plugins/list", {
      params: { botId: currentBotId.value },
      withCredentials: true,
    });
    if (resp.status === 200) {
      data.value = resp.data;
    }
  } catch (e: any) {
    message.error(`获取插件列表失败: ${e.message || "未知错误"}`);
  } finally {
    loadingRef.value = false;
  }
}

async function togglePlugin(item: any, enabled: boolean) {
  if (!currentBotId.value) return;
  togglingPlugin.value = item.name;
  try {
    await axios.post(
      "/api/plugins/toggle",
      {
        name: item.name,
        enabled,
        botId: currentBotId.value,
      },
      { withCredentials: true },
    );
    message.success(
      enabled ? `插件 ${item.name} 已启用` : `插件 ${item.name} 已禁用`,
    );
    await loadPlugins();
  } catch (e: any) {
    message.error(
      `操作失败: ${e.response?.data?.message || e.message || "未知错误"}`,
    );
  } finally {
    togglingPlugin.value = null;
  }
}

async function reloadPlugin(item: any) {
  if (!currentBotId.value) return;
  reloadingPlugin.value = item.name;
  try {
    await axios.post(
      "/api/plugins/reload",
      {
        name: item.name,
        botId: currentBotId.value,
      },
      { withCredentials: true },
    );
    message.success(`插件 ${item.name} 已重载`);
    await loadPlugins();
  } catch (e: any) {
    message.error(
      `重载失败: ${e.response?.data?.message || e.message || "未知错误"}`,
    );
  } finally {
    reloadingPlugin.value = null;
  }
}

async function reloadAll() {
  if (!currentBotId.value) return;
  reloadingAll.value = true;
  try {
    await axios.post(
      "/api/plugins/reload",
      {
        botId: currentBotId.value,
      },
      { withCredentials: true },
    );
    message.success("全部插件已重载");
    await loadPlugins();
  } catch (e: any) {
    message.error(
      `重载全部失败: ${e.response?.data?.message || e.message || "未知错误"}`,
    );
  } finally {
    reloadingAll.value = false;
  }
}

async function unloadPlugin(item: any) {
  if (!currentBotId.value) return;
  dialog.warning({
    title: "确认卸载",
    content: `确定要卸载插件 "${item.name}" 吗？卸载后可以重新加载。`,
    positiveText: "确认卸载",
    negativeText: "取消",
    onPositiveClick: async () => {
      try {
        await axios.post(
          "/api/plugins/unload",
          {
            name: item.name,
            botId: currentBotId.value,
          },
          { withCredentials: true },
        );
        message.success(`插件 ${item.name} 已卸载`);
        await loadPlugins();
      } catch (e: any) {
        message.error(
          `卸载失败: ${e.response?.data?.message || e.message || "未知错误"}`,
        );
      }
    },
  });
}

async function loadPlugin(item: any) {
  if (!currentBotId.value) return;
  loadingPlugin.value = item.name;
  try {
    await axios.post(
      "/api/plugins/load",
      {
        name: item.name,
        botId: currentBotId.value,
      },
      { withCredentials: true },
    );
    message.success(`插件 ${item.name} 已加载`);
    await loadPlugins();
  } catch (e: any) {
    message.error(
      `加载失败: ${e.response?.data?.message || e.message || "未知错误"}`,
    );
  } finally {
    loadingPlugin.value = null;
  }
}

async function openConfig(item: any) {
  if (!currentBotId.value) return;
  currentPlugin.value = item;
  configDrawerVisible.value = true;
  configLoading.value = true;

  try {
    const resp = await axios.post(
      "/api/plugins/getConfig",
      {
        name: item.name,
        botId: currentBotId.value,
      },
      { withCredentials: true },
    );

    const cfg = resp.data.config || {};
    const schema = resp.data.configSchema || null;
    configSchema.value = schema;
    configData.value = omitInternalConfig(cfg);

    // Reset object fields
    Object.keys(objectFields).forEach((k) => delete objectFields[k]);

    if (pluginConfigFields.value.length > 0) {
      for (const field of pluginConfigFields.value) {
        if (
          field.type === "object" &&
          configData.value[field.key] !== undefined
        ) {
          objectFields[field.key] = JSON.stringify(
            configData.value[field.key],
            null,
            2,
          );
        }
        if (
          configData.value[field.key] === undefined &&
          field.default !== undefined
        ) {
          configData.value[field.key] = field.default;
        }
      }
    } else {
      configEntries.value = Object.entries(omitInternalConfig(cfg)).map(
        ([key, value]) => ({
          key,
          value:
            typeof value === "object"
              ? JSON.stringify(value)
              : String(value ?? ""),
        }),
      );
    }
  } catch (e: any) {
    message.error(`获取配置失败: ${e.message || "未知错误"}`);
  } finally {
    configLoading.value = false;
  }
}

async function saveConfig() {
  if (!currentPlugin.value || !currentBotId.value) return;
  savingConfig.value = true;

  try {
    let configToSave: Record<string, any>;

    if (pluginConfigFields.value.length > 0) {
      configToSave = {};
      // Ensure object fields are properly parsed
      for (const field of pluginConfigFields.value) {
        configToSave[field.key] = configData.value[field.key];
        if (field.type === "object" && objectFields[field.key]) {
          try {
            configToSave[field.key] = JSON.parse(objectFields[field.key]);
          } catch (e) {
            message.error(`配置项 "${field.key}" 不是有效的 JSON`);
            savingConfig.value = false;
            return;
          }
        }
        if (
          field.type === "number" &&
          typeof configToSave[field.key] === "string"
        ) {
          configToSave[field.key] = Number(configToSave[field.key]);
        }
      }
    } else {
      configToSave = {};
      for (const entry of configEntries.value) {
        const key = entry.key.trim();
        if (!key || internalPluginConfigKeys.has(key)) continue;
        let parsedValue: any = entry.value;
        try {
          parsedValue = JSON.parse(entry.value);
        } catch (e) {
          /* keep as string */
        }
        configToSave[key] = parsedValue;
      }
    }

    await axios.post(
      "/api/plugins/setConfig",
      {
        name: currentPlugin.value.name,
        config: configToSave,
        botId: currentBotId.value,
      },
      { withCredentials: true },
    );

    message.success("配置保存成功，请重载插件后生效");
    configDrawerVisible.value = false;
  } catch (e: any) {
    message.error(
      `配置保存失败: ${e.response?.data?.errors?.join(", ") || e.message || "未知错误"}`,
    );
  } finally {
    savingConfig.value = false;
  }
}

watch(currentBotId, () => {
  loadPlugins();
});

onMounted(() => {
  loadPlugins();
});
</script>

<style scoped></style>
