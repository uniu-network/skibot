<template>
  <n-layout style="height: 100vh">
    <n-layout-content
      style="margin-top: 30px; margin-left: 30px; margin-right: 30px"
    >
      <n-space vertical size="large">
        <n-flex justify="space-between" align="center">
          <div>
            <h2 style="margin: 0 0 6px">消息记录</h2>
          </div>
          <n-space align="center">
            <n-select
              v-model:value="filterType"
              :options="typeOptions"
              placeholder="消息类型"
              style="width: 140px"
              size="small"
              @update:value="onFilterChange"
            />
            <n-button
              type="primary"
              secondary
              size="small"
              @click="loadMessages"
            >
              刷新
            </n-button>
          </n-space>
        </n-flex>

        <n-spin :show="loadingRef">
          <n-data-table
            :columns="columns"
            :data="messages"
            :bordered="true"
            :single-line="false"
            size="small"
            :row-key="(row) => row.id"
          />
          <n-flex justify="center" style="margin-top: 16px">
            <n-pagination
              v-model:page="currentPage"
              :page-count="totalPages"
              :page-size="pageSize"
              show-size-picker
              :page-sizes="[20, 50, 100]"
              @update:page="onPageChange"
              @update:page-size="onPageSizeChange"
            />
          </n-flex>
        </n-spin>
      </n-space>
    </n-layout-content>
  </n-layout>

  <n-drawer v-model:show="detailVisible" :width="560" placement="right">
    <n-drawer-content title="消息详情" closable>
      <n-pre>{{ detailContent }}</n-pre>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, h } from "vue";
import { useStore } from "vuex";
import axios from "axios";
import { useMessage, NTag, NButton } from "naive-ui";

const store = useStore();
const message = useMessage();
const currentBotId = computed(() => store.state.currentBotId);

const messages = ref<any[]>([]);
const loadingRef = ref(false);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const filterType = ref<string>("");

const typeOptions = [
  { label: "全部", value: "" },
  { label: "收到消息", value: "recv" },
  { label: "Bot 发送", value: "bot_send" },
];

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / pageSize.value)),
);

const columns = [
  {
    title: "ID",
    key: "id",
    width: 70,
  },
  {
    title: "类型",
    key: "type",
    width: 100,
    render(row: any) {
      const isRecv = row.type === "recv";
      return h(
        NTag,
        { type: isRecv ? "info" : "success", size: "small" },
        {
          default: () => (isRecv ? "收到" : "Bot发送"),
        },
      );
    },
  },
  {
    title: "平台",
    key: "platform",
    width: 120,
    render(row: any) {
      try {
        const event =
          typeof row.event_json === "string"
            ? JSON.parse(row.event_json)
            : row.event_json;
        return event.adapter_id || "-";
      } catch {
        return "-";
      }
    },
  },
  {
    title: "时间",
    key: "created_at",
    width: 180,
    render(row: any) {
      return new Date(row.created_at).toLocaleString();
    },
  },
  {
    title: "内容",
    key: "summary",
    ellipsis: { tooltip: true },
    render(row: any) {
      try {
        const event =
          typeof row.event_json === "string"
            ? JSON.parse(row.event_json)
            : row.event_json;
        if (row.type === "bot_send") {
          const msg = extractMessageContent(event.message);
          const target =
            event.message_type === "group"
              ? `群${event.target_id}`
              : `私聊${event.target_id}`;
          return h(
            "span",
            {
              style:
                "display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;",
              title: msg,
            },
            `[${target}] ${msg}`,
          );
        }
        const raw = event.raw_message || "";
        return h(
          "span",
          {
            style:
              "display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;",
            title: raw,
          },
          raw,
        );
      } catch {
        return h(
          "span",
          {
            style:
              "display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;",
          },
          String(row.event_json),
        );
      }
    },
  },
  {
    title: "操作",
    key: "actions",
    width: 80,
    render(row: any) {
      return h(
        NButton,
        { size: "small", tertiary: true, onClick: () => showDetail(row) },
        { default: () => "详情" },
      );
    },
  },
];

function showDetail(row: any) {
  try {
    const event =
      typeof row.event_json === "string"
        ? JSON.parse(row.event_json)
        : row.event_json;
    detailContent.value = JSON.stringify(event, null, 2);
  } catch {
    detailContent.value = String(row.event_json);
  }
  detailVisible.value = true;
}

function extractMessageContent(message: any): string {
  if (!message) return "";
  if (typeof message === "string") return message;
  if (Array.isArray(message)) {
    return message
      .map((seg: any) => {
        if (typeof seg === "string") return seg;
        if (seg.type === "text") return seg.data?.text || "";
        if (seg.type === "image" || seg.type === "img") return "[图片]";
        if (seg.type === "face") return "[表情]";
        if (seg.type === "at") return seg.data?.qq ? `@${seg.data.qq}` : "@";
        if (seg.type === "reply") return "[回复]";
        if (seg.type === "record") return "[语音]";
        if (seg.type === "video") return "[视频]";
        if (seg.type === "file") return "[文件]";
        if (seg.type === "poke") return "[戳一戳]";
        return `[${seg.type || "消息段"}]`;
      })
      .join("");
  }
  return String(message);
}

async function loadMessages() {
  if (!currentBotId.value) {
    loadingRef.value = false;
    return;
  }
  loadingRef.value = true;
  const offset = (currentPage.value - 1) * pageSize.value;
  const params: any = {
    botId: currentBotId.value,
    limit: pageSize.value,
    offset,
  };
  if (filterType.value) {
    params.type = filterType.value;
  }
  try {
    const resp = await axios.get("/api/messages", {
      params,
      withCredentials: true,
    });
    if (resp.status === 200) {
      messages.value = resp.data.data || [];
      total.value = resp.data.total || 0;
    }
  } catch (e: any) {
    message.error(`获取消息列表失败: ${e.message || "未知错误"}`);
  } finally {
    loadingRef.value = false;
  }
}

function onFilterChange() {
  currentPage.value = 1;
  loadMessages();
}

function onPageChange(page: number) {
  currentPage.value = page;
  loadMessages();
}

function onPageSizeChange(size: number) {
  pageSize.value = size;
  currentPage.value = 1;
  loadMessages();
}

watch(currentBotId, () => {
  currentPage.value = 1;
  loadMessages();
});

onMounted(() => {
  loadMessages();
});
</script>

<style scoped>
n-pre {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
