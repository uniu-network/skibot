<template>
  <n-layout style="height: 100vh;">
    <n-layout-content style="margin-top: 30px; margin-left: 30px; margin-right: 30px">
      <n-space vertical size="large">
        <n-flex justify="space-between" align="center">
          <div>
            <h2 style="margin: 0 0 6px;">Bot 管理</h2>
          </div>
          <n-space>
            <n-button type="primary" size="small" @click="showCreateModal = true">
              添加 Bot
            </n-button>
            <n-button secondary size="small" @click="loadBots">
              刷新
            </n-button>
          </n-space>
        </n-flex>

        <n-spin :show="loadingRef">
          <n-grid :cols="1" x-gap="12" y-gap="12">
            <n-gi v-for="bot in botListData" :key="bot.botId">
              <n-card hoverable :title="`${bot.name} (${bot.botId})`" size="small">
                <n-descriptions bordered :column="isPhone ? 2 : 4" label-placement="left">
                  <n-descriptions-item label="Bot ID">{{ bot.botId }}</n-descriptions-item>
                  <n-descriptions-item label="名称">{{ bot.name }}</n-descriptions-item>
                  <n-descriptions-item label="Self ID">{{ bot.self_id }}</n-descriptions-item>
                   <n-descriptions-item label="前缀">
                     <n-flex size="small">
                       <n-tag v-for="p in (bot.prefix || ['/'])" :key="p" size="small" type="info">{{ p }}</n-tag>
                     </n-flex>
                   </n-descriptions-item>
                  <n-descriptions-item label="状态">
                    <n-tag :type="bot.running ? 'success' : 'error'" size="small">
                      {{ bot.running ? '运行中' : '已停止' }}
                    </n-tag>
                  </n-descriptions-item>
                  <n-descriptions-item label="插件数">{{ bot.pluginCount }}</n-descriptions-item>
                  <n-descriptions-item label="适配器数">{{ bot.adapterCount }}</n-descriptions-item>
                </n-descriptions>
                <template #action>
                  <n-flex>
                    <n-button
                      v-if="bot.running && botListData.length > 1"
                      tertiary
                      type="warning"
                      size="small"
                      :loading="operatingBotId === bot.botId"
                      @click="handleStop(bot.botId)"
                    >
                      停止
                    </n-button>
                    <n-tooltip v-if="bot.running && botListData.length <= 1" trigger="hover">
                      <template #trigger>
                        <n-button tertiary type="warning" size="small" disabled>
                          停止
                        </n-button>
                      </template>
                      仅有一个 Bot 时不允许停止
                    </n-tooltip>
                    <n-button
                      v-if="!bot.running"
                      tertiary
                      type="success"
                      size="small"
                      :loading="operatingBotId === bot.botId"
                      @click="handleStart(bot.botId)"
                    >
                      启动
                    </n-button>
                    <n-button v-if="bot.running" tertiary type="info" size="small" @click="handleReload(bot.botId)" :loading="reloadingBotId === bot.botId">
                      重载
                    </n-button>
                    <n-button tertiary size="small" @click="openConfig(bot)">
                      配置
                    </n-button>
                    <n-button tertiary type="error" size="small" @click="handleDelete(bot)">
                      删除
                    </n-button>
                  </n-flex>
                </template>
              </n-card>
            </n-gi>
          </n-grid>
          <n-empty v-if="botListData.length === 0 && !loadingRef" description="暂无 Bot 实例，点击上方按钮添加" style="margin-top: 50px;" />
        </n-spin>
      </n-space>
    </n-layout-content>
  </n-layout>

  <n-modal v-model:show="showCreateModal" preset="dialog" title="添加 Bot" positive-text="创建" negative-text="取消"
    :loading="creating" @positive-click="onCreateBot">
    <n-space vertical>
      <n-form-item label="Bot ID" required>
        <n-input v-model:value="createForm.botId" placeholder="只能包含字母、数字、下划线和连字符" />
      </n-form-item>
      <n-form-item label="名称">
        <n-input v-model:value="createForm.name" placeholder="Bot 显示名称" />
      </n-form-item>
      <n-form-item label="Self ID">
        <n-input-number v-model:value="createForm.self_id" placeholder="Bot 的 QQ 号" style="width: 100%" />
      </n-form-item>
      <n-form-item label="命令前缀">
        <n-dynamic-tags v-model:value="createForm.prefix" />
      </n-form-item>
    </n-space>
  </n-modal>

  <n-drawer v-model:show="configDrawerVisible" :width="560" placement="right">
    <n-drawer-content :title="`Bot 配置 - ${currentBot?.name || currentBot?.botId || ''}`" closable>
      <n-spin :show="configLoading">
        <n-space vertical>
          <n-form-item label="名称">
            <n-input v-model:value="configData.name" placeholder="Bot 显示名称" />
          </n-form-item>
          <n-form-item label="Self ID">
            <n-input-number v-model:value="configData.self_id" style="width: 100%" />
          </n-form-item>
          <n-form-item label="命令前缀">
            <n-dynamic-tags v-model:value="configData.prefix" />
          </n-form-item>
          <n-divider>适配器配置</n-divider>
          <n-alert type="info" :bordered="false" style="margin-bottom: 8px;">
            适配器的增删改请在「适配器管理」页面操作，此处仅展示当前配置。
          </n-alert>
          <template v-for="(adapter, index) in configData.adapters" :key="index">
            <n-card size="small" :title="adapter.type || `适配器 ${index + 1}`">
              <n-descriptions bordered :column="1" label-placement="left" size="small">
                <n-descriptions-item label="类型">{{ adapter.type }}</n-descriptions-item>
                <n-descriptions-item label="配置">
                  <n-text code>{{ JSON.stringify(adapter.config || {}) }}</n-text>
                </n-descriptions-item>
              </n-descriptions>
            </n-card>
          </template>
          <template v-if="!configData.adapters || configData.adapters.length === 0">
            <n-text depth="3">暂无适配器配置</n-text>
          </template>
        </n-space>
      </n-spin>
      <template #footer>
        <n-flex>
          <n-button @click="configDrawerVisible = false">取消</n-button>
          <n-button type="primary" :loading="savingConfig" @click="saveConfig">
            保存
          </n-button>
        </n-flex>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import axios from 'axios';
import { useMessage, useDialog } from 'naive-ui';

const store = useStore();
const message = useMessage();
const dialog = useDialog();
const isPhone = computed(() => store.state.isphone);

const botListData = ref([]);
const loadingRef = ref(true);
const reloadingBotId = ref(null);
const operatingBotId = ref(null);

const showCreateModal = ref(false);
const creating = ref(false);
const createForm = ref({
  botId: '',
  name: '',
  self_id: 10000,
  prefix: ['/'],
});

const configDrawerVisible = ref(false);
const configLoading = ref(false);
const savingConfig = ref(false);
const currentBot = ref(null);
const configData = ref({
  name: '',
  self_id: 0,
  prefix: ['/'],
  adapters: [],
  plugin_config: {},
});

async function loadBots() {
  loadingRef.value = true;
  try {
    const resp = await axios.get('/api/bots/list', {
      withCredentials: true,
    });
    if (resp.status === 200) {
      botListData.value = resp.data;
      store.commit('setBotList', resp.data);
    }
  } catch (e) {
    message.error(`获取Bot列表失败: ${e.message || '未知错误'}`);
  } finally {
    loadingRef.value = false;
  }
}

async function handleReload(botId) {
  reloadingBotId.value = botId;
  try {
    await axios.post('/api/bots/reload', { botId }, { withCredentials: true });
    message.success(`Bot ${botId} 重载成功`);
    await loadBots();
  } catch (e) {
    message.error(`重载失败: ${e.message || '未知错误'}`);
  } finally {
    reloadingBotId.value = null;
  }
}

async function handleStart(botId) {
  operatingBotId.value = botId;
  try {
    await axios.post('/api/bots/start', { botId }, { withCredentials: true });
    message.success(`Bot ${botId} 启动成功`);
    await loadBots();
  } catch (e) {
    message.error(`启动失败: ${e.response?.data?.message || e.message || '未知错误'}`);
  } finally {
    operatingBotId.value = null;
  }
}

async function handleStop(botId) {
  operatingBotId.value = botId;
  try {
    await axios.post('/api/bots/stop', { botId }, { withCredentials: true });
    message.success(`Bot ${botId} 已停止`);
    await loadBots();
  } catch (e) {
    message.error(`停止失败: ${e.response?.data?.message || e.message || '未知错误'}`);
  } finally {
    operatingBotId.value = null;
  }
}

function handleDelete(bot) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除 Bot "${bot.name || bot.botId}" 吗？这将停止实例并删除配置文件，此操作不可恢复。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await axios.post('/api/bots/delete', { botId: bot.botId }, { withCredentials: true });
        message.success(`Bot ${bot.botId} 已删除`);
        await loadBots();
      } catch (e) {
        message.error(`删除失败: ${e.response?.data?.message || e.message || '未知错误'}`);
      }
    },
  });
}

async function onCreateBot() {
  if (!createForm.value.botId.trim()) {
    message.error('Bot ID 不能为空');
    return false;
  }
  creating.value = true;
  try {
    await axios.post('/api/bots/create', {
      botId: createForm.value.botId.trim(),
      name: createForm.value.name || createForm.value.botId.trim(),
      self_id: createForm.value.self_id,
      prefix: createForm.value.prefix,
    }, { withCredentials: true });
    message.success(`Bot ${createForm.value.botId} 创建成功`);
    showCreateModal.value = false;
    createForm.value = { botId: '', name: '', self_id: 10000, prefix: ['/'] };
    await loadBots();
  } catch (e) {
    message.error(`创建失败: ${e.response?.data?.message || e.message || '未知错误'}`);
  } finally {
    creating.value = false;
  }
  return false;
}

async function openConfig(bot) {
  currentBot.value = bot;
  configDrawerVisible.value = true;
  configLoading.value = true;

  try {
    const resp = await axios.get('/api/bots/config', {
      params: { botId: bot.botId },
      withCredentials: true,
    });
    const cfg = resp.data || {};
    configData.value = {
      name: cfg.name || bot.name || '',
      self_id: cfg.self_id ?? bot.self_id ?? 0,
      prefix: Array.isArray(cfg.prefix) ? cfg.prefix : (cfg.prefix ? [cfg.prefix] : ['/']),
      adapters: cfg.adapters || [],
      plugin_config: cfg.plugin_config || {},
    };
  } catch (e) {
    message.error(`获取配置失败: ${e.message || '未知错误'}`);
  } finally {
    configLoading.value = false;
  }
}

async function saveConfig() {
  if (!currentBot.value) return;
  savingConfig.value = true;
  try {
    await axios.post('/api/bots/setConfig', {
      botId: currentBot.value.botId,
      name: configData.value.name,
      self_id: configData.value.self_id,
      prefix: configData.value.prefix,
    }, { withCredentials: true });
    message.success('配置已保存并已自动重载');
    configDrawerVisible.value = false;
    await loadBots();
  } catch (e) {
    message.error(`保存失败: ${e.response?.data?.message || e.message || '未知错误'}`);
  } finally {
    savingConfig.value = false;
  }
}

onMounted(() => {
  loadBots();
});
</script>
