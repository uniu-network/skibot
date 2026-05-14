<template>
  <n-layout style="height: 100vh;">
    <n-layout-content style="margin-top: 30px; margin-left: 30px; margin-right: 30px">
      <n-space vertical size="large">
        <n-flex justify="space-between" align="center">
          <div>
            <h2 style="margin: 0 0 6px;">指令管理</h2>
            <n-text depth="3" style="font-size: 13px;">查看当前 Bot 实例已注册的指令列表</n-text>
          </div>
          <n-space>
            <n-button secondary size="small" @click="loadCommands" :loading="loadingRef">
              刷新
            </n-button>
          </n-space>
        </n-flex>

        <n-spin :show="loadingRef">
          <n-data-table
            :columns="columns"
            :data="commands"
            :bordered="true"
            :single-line="false"
            :row-key="rowKey"
            size="small"
          />
          <n-empty v-if="commands.length === 0 && !loadingRef" description="暂无已注册指令，请确认 Bot 已启动并加载了插件" style="margin-top: 50px;" />
        </n-spin>
      </n-space>
    </n-layout-content>
  </n-layout>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue';
import { useStore } from 'vuex';
import axios from 'axios';
import { useMessage, NTag, NText, type DataTableColumns } from 'naive-ui';

const store = useStore();
const message = useMessage();
const currentBotId = computed(() => store.state.currentBotId);
const isPhone = computed(() => store.state.isphone);

interface Command {
  command: string;
  description: string;
  scope?: string;
}

const commands = ref<Command[]>([]);
const loadingRef = ref(true);
const prefixList = ref<string[]>(['/']);

const columns = computed<DataTableColumns<Command>>(() => {
  const cols: DataTableColumns<Command> = [
    {
      title: '指令',
      key: 'command',
      render(row) {
        const p = prefixList.value;
        const prefixStr = p.length === 1 ? `${p[0]}` : `[${p.join('/')}]`;
        return h('span', { style: 'font-weight: 600;' }, `${prefixStr}${row.command}`);
      },
    },
    {
      title: '描述',
      key: 'description',
    },
  ];
  if (!isPhone.value) {
    cols.push({
      title: '来源',
      key: 'scope',
      render(row) {
        return row.scope
          ? h(NTag, { size: 'small', type: 'info' }, () => row.scope)
          : h(NText, { depth: 3 }, () => '全局');
      },
    });
  }
  return cols;
});

function rowKey(row: Command) {
  return `${row.scope || '_'}:${row.command}`;
}

async function loadCommands() {
  if (!currentBotId.value) {
    loadingRef.value = false;
    commands.value = [];
    return;
  }
  loadingRef.value = true;
  try {
    const [cmdResp, configResp] = await Promise.all([
      axios.get('/api/commands/list', {
        params: { botId: currentBotId.value },
        withCredentials: true,
      }),
      axios.get('/api/bots/config', {
        params: { botId: currentBotId.value },
        withCredentials: true,
      }).catch(() => ({ data: {} })),
    ]);
    if (cmdResp.status === 200) {
      commands.value = cmdResp.data || [];
    }
    const cfg = configResp.data || {};
    const p = cfg.prefix;
    prefixList.value = Array.isArray(p) ? p : (p ? [p] : ['/']);
  } catch (e: any) {
    message.error(`获取指令列表失败: ${e.message || '未知错误'}`);
  } finally {
    loadingRef.value = false;
  }
}

watch(currentBotId, () => {
  loadCommands();
});

onMounted(() => {
  loadCommands();
});
</script>

<style scoped>
</style>