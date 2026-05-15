<template>
  <n-layout style="height: 100vh">
    <n-layout-content
      style="margin-top: 30px; margin-left: 30px; margin-right: 30px"
    >
      <n-space vertical size="large">
        <n-flex justify="space-between" align="center">
          <div>
            <h2 style="margin: 0 0 6px">适配器管理</h2>
          </div>
          <n-space align="center">
            <n-button type="primary" size="small" @click="showAddModal = true">
              添加适配器
            </n-button>
            <n-button
              secondary
              size="small"
              :loading="reloadingAll"
              @click="reloadAdapter()"
            >
              重载全部
            </n-button>
          </n-space>
        </n-flex>

        <n-spin :show="loadingRef">
          <n-grid :cols="1" x-gap="12" y-gap="12">
            <n-gi v-for="adapter in adapters" :key="adapter.id">
              <n-card
                hoverable
                :title="adapter.name || adapter.id"
                size="small"
              >
                <n-descriptions
                  bordered
                  :column="isPhone ? 1 : 3"
                  label-placement="left"
                >
                  <n-descriptions-item label="类型">{{
                    adapter.id
                  }}</n-descriptions-item>
                  <n-descriptions-item label="状态">
                    <n-tag
                      :type="adapter.loaded ? 'success' : 'warning'"
                      size="small"
                    >
                      {{ adapter.loaded ? "已加载" : "未加载" }}
                    </n-tag>
                  </n-descriptions-item>
                  <n-descriptions-item label="配置项">
                    {{ Object.keys(adapter.config || {}).length }} 项
                  </n-descriptions-item>
                </n-descriptions>
                <template #action>
                  <n-flex>
                    <n-button
                      tertiary
                      type="info"
                      size="small"
                      :loading="reloadingAdapterId === adapter.id"
                      @click="reloadAdapter(adapter.id)"
                    >
                      重载
                    </n-button>
                    <n-button
                      tertiary
                      size="small"
                      @click="openConfig(adapter)"
                    >
                      配置
                    </n-button>
                    <n-button
                      tertiary
                      type="error"
                      size="small"
                      @click="handleRemove(adapter)"
                    >
                      删除
                    </n-button>
                  </n-flex>
                </template>
              </n-card>
            </n-gi>
          </n-grid>
          <n-empty
            v-if="adapters.length === 0 && !loadingRef"
            description="暂无适配器，点击上方按钮添加"
            style="margin-top: 50px"
          />
        </n-spin>
      </n-space>
    </n-layout-content>
  </n-layout>

  <n-drawer v-model:show="configDrawerVisible" :width="560" placement="right">
    <n-drawer-content
      :title="`${currentAdapter?.name || currentAdapter?.id || ''} 配置`"
      closable
    >
      <n-spin :show="savingConfig">
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

  <n-modal
    v-model:show="showAddModal"
    preset="dialog"
    title="添加适配器"
    positive-text="添加"
    negative-text="取消"
    :loading="addingAdapter"
    @positive-click="onAddAdapter"
  >
    <n-space vertical>
      <n-select
        v-model:value="selectedAdapterType"
        :options="availableTypes"
        placeholder="选择适配器类型"
        @update:value="onAdapterTypeSelect"
      />

      <n-dynamic-input
        v-if="selectedAdapterType"
        v-model:value="addConfigEntries"
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
    </n-space>
  </n-modal>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useStore } from "vuex";
import axios from "axios";
import { useMessage, useDialog } from "naive-ui";

const store = useStore();
const message = useMessage();
const dialog = useDialog();
const currentBotId = computed(() => store.state.currentBotId);
const isPhone = computed(() => store.state.isphone);

const adapters = ref([]);
const loadingRef = ref(false);
const reloadingAll = ref(false);
const reloadingAdapterId = ref(null);
const configDrawerVisible = ref(false);
const currentAdapter = ref(null);
const configEntries = ref([]);
const savingConfig = ref(false);

const showAddModal = ref(false);
const selectedAdapterType = ref(null);
const availableTypes = ref([]);
const addingAdapter = ref(false);
const addConfigEntries = ref([]);

function createConfigEntry() {
  return { key: "", value: "" };
}

function stringifyValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseValue(value) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      return value;
    }
  }
  return value;
}

async function loadAdapters() {
  if (!currentBotId.value) return;
  loadingRef.value = true;
  try {
    const resp = await axios.get("/api/adapters/list", {
      params: { botId: currentBotId.value },
      withCredentials: true,
    });
    adapters.value = resp.data || [];
  } catch (e) {
    message.error(`获取适配器列表失败: ${e.message || "未知错误"}`);
  } finally {
    loadingRef.value = false;
  }
}

async function loadAvailableTypes() {
  try {
    const resp = await axios.get("/api/adapters/available", {
      withCredentials: true,
    });
    availableTypes.value = (resp.data || []).map((t) => ({
      label: `${t.name} (${t.id})`,
      value: t.id,
      defaultConfig: t.defaultConfig,
    }));
  } catch (e) {
    message.error(`获取可用适配器失败: ${e.message || "未知错误"}`);
  }
}

async function reloadAdapter(type) {
  if (!currentBotId.value) return;
  if (type) reloadingAdapterId.value = type;
  else reloadingAll.value = true;

  try {
    await axios.post(
      "/api/adapters/reload",
      { botId: currentBotId.value, type },
      { withCredentials: true },
    );
    message.success(type ? `适配器 ${type} 已重载` : "全部适配器已重载");
    await loadAdapters();
  } catch (e) {
    message.error(`重载失败: ${e.message || "未知错误"}`);
  } finally {
    reloadingAdapterId.value = null;
    reloadingAll.value = false;
  }
}

function openConfig(adapter) {
  currentAdapter.value = adapter;
  configEntries.value = Object.entries(adapter.config || {}).map(
    ([key, value]) => ({
      key,
      value: stringifyValue(value),
    }),
  );
  configDrawerVisible.value = true;
}

async function saveConfig() {
  if (!currentAdapter.value || !currentBotId.value) return;

  const config = {};
  for (const entry of configEntries.value) {
    const key = entry.key.trim();
    if (!key) continue;
    config[key] = parseValue(entry.value);
  }

  savingConfig.value = true;
  try {
    await axios.post(
      "/api/adapters/setConfig",
      {
        botId: currentBotId.value,
        type: currentAdapter.value.id,
        config,
      },
      { withCredentials: true },
    );
    message.success("适配器配置已保存，建议重载后生效");
    configDrawerVisible.value = false;
    await loadAdapters();
  } catch (e) {
    message.error(`保存失败: ${e.message || "未知错误"}`);
  } finally {
    savingConfig.value = false;
  }
}

function handleRemove(adapter) {
  dialog.warning({
    title: "确认删除",
    content: `确定要删除适配器 "${adapter.name || adapter.id}" 吗？将卸载并移除配置。`,
    positiveText: "确认删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      try {
        await axios.post(
          "/api/adapters/remove",
          {
            botId: currentBotId.value,
            type: adapter.id,
          },
          { withCredentials: true },
        );
        message.success(`适配器 ${adapter.id} 已删除`);
        await loadAdapters();
      } catch (e) {
        message.error(
          `删除失败: ${e.response?.data?.message || e.message || "未知错误"}`,
        );
      }
    },
  });
}

function onAdapterTypeSelect(val) {
  const selected = availableTypes.value.find((t) => t.value === val);
  const defaultConfig = selected?.defaultConfig || {};
  addConfigEntries.value = Object.entries(defaultConfig).map(
    ([key, value]) => ({
      key,
      value: stringifyValue(value),
    }),
  );
}

async function onAddAdapter() {
  if (!selectedAdapterType.value || !currentBotId.value) return false;
  addingAdapter.value = true;

  const config = {};
  for (const entry of addConfigEntries.value) {
    const key = entry.key.trim();
    if (!key) continue;
    config[key] = parseValue(entry.value);
  }

  try {
    await axios.post(
      "/api/adapters/add",
      {
        botId: currentBotId.value,
        type: selectedAdapterType.value,
        config,
      },
      { withCredentials: true },
    );
    message.success(`适配器 ${selectedAdapterType.value} 已添加`);
    showAddModal.value = false;
    selectedAdapterType.value = null;
    addConfigEntries.value = [];
    await loadAdapters();
  } catch (e) {
    message.error(
      `添加失败: ${e.response?.data?.message || e.message || "未知错误"}`,
    );
  } finally {
    addingAdapter.value = false;
  }
  return false;
}

watch(currentBotId, () => {
  loadAdapters();
});

watch(showAddModal, (val) => {
  if (val) loadAvailableTypes();
});

onMounted(() => {
  loadAdapters();
});
</script>
