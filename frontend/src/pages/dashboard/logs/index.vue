<template>
  <n-layout style="height: 100vh">
    <n-layout-content
      style="margin-top: 10px; margin-left: 30px; margin-right: 30px"
    >
      <n-space vertical size="small">
        <n-flex justify="space-between" align="center">
          <div>
            <h2 style="margin: 0 0 6px">运行日志</h2>
          </div>
          <n-space align="center" size="small">
            <n-input
              v-model:value="prefixFilter"
              size="small"
              placeholder="前缀匹配 如 plugin"
              clearable
              style="width: 150px"
              @update:value="onSearchChange"
            />
            <n-button-group size="small">
              <n-button
                v-for="lv in levelOptions"
                :key="lv.value"
                :type="filterLevel === lv.value ? 'primary' : 'default'"
                @click="filterLevel = lv.value"
              >
                {{ lv.label }}
              </n-button>
            </n-button-group>
            <n-input
              v-model:value="searchText"
              size="small"
              placeholder="搜索日志..."
              clearable
              style="width: 160px"
              @update:value="onSearchChange"
            />
            <n-button
              size="small"
              :type="autoScroll ? 'primary' : 'default'"
              @click="autoScroll = !autoScroll"
            >
              {{ autoScroll ? "自动滚动" : "手动滚动" }}
            </n-button>
            <n-button size="small" @click="clearLogs">清空</n-button>
          </n-space>
        </n-flex>

        <n-flex size="small">
          <n-tag :bordered="false" size="small" type="info">
            连接:
            {{
              sseStatus === "connected"
                ? "已连接"
                : sseStatus === "connecting"
                  ? "连接中"
                  : "已断开"
            }}
          </n-tag>
          <n-tag :bordered="false" size="small">
            共 {{ filteredLogs.length }} 条
          </n-tag>
          <n-tag
            v-if="prefixFilter"
            :bordered="false"
            size="small"
            type="warning"
          >
            前缀: [{{ prefixFilter }}]
          </n-tag>
        </n-flex>

        <div ref="logContainerRef" class="log-viewer" @scroll="onScroll">
          <div
            v-for="entry in filteredLogs"
            :key="entry.id"
            :class="['log-line', `log-level-${entry.level.toLowerCase()}`]"
          >
            <span class="log-time">{{ entry.timestamp }}</span>
            <span
              :class="['log-level', `level-${entry.level.toLowerCase()}`]"
              >{{ entry.level }}</span
            >
            <span class="log-source"
              >[{{ entry.filename }}:{{ entry.func }}:{{ entry.line }}]</span
            >
            <span class="log-message">{{ entry.message }}</span>
          </div>
          <n-empty
            v-if="filteredLogs.length === 0"
            description="暂无日志"
            style="margin-top: 60px"
          />
        </div>
      </n-space>
    </n-layout-content>
  </n-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, nextTick } from "vue";

interface LogEntry {
  id: number;
  timestamp: string;
  level: string;
  message: string;
  filename: string;
  func: string;
  line: number;
}

const logs = ref<LogEntry[]>([]);
const filterLevel = ref<string>("ALL");
const searchText = ref("");
const prefixFilter = ref("");
const autoScroll = ref(true);
const sseStatus = ref<"connected" | "connecting" | "disconnected">(
  "disconnected",
);
const logContainerRef = ref<HTMLElement | null>(null);
const lastEntryId = ref(0);

let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const levelOptions = [
  { label: "ALL", value: "ALL" },
  { label: "TRACE", value: "TRACE" },
  { label: "DEBUG", value: "DEBUG" },
  { label: "INFO", value: "INFO" },
  { label: "SUCCESS", value: "SUCCESS" },
  { label: "WARN", value: "WARN" },
  { label: "ERROR", value: "ERROR" },
];

function matchPrefix(entry: LogEntry): boolean {
  if (!prefixFilter.value) return true;
  const tag = `[${prefixFilter.value.toLowerCase()}]`;
  return (
    entry.message.toLowerCase().includes(tag) ||
    entry.filename.toLowerCase().includes(prefixFilter.value.toLowerCase()) ||
    entry.func.toLowerCase().includes(prefixFilter.value.toLowerCase())
  );
}

const filteredLogs = computed(() => {
  let entries = logs.value;
  if (filterLevel.value !== "ALL") {
    entries = entries.filter((e) => e.level === filterLevel.value);
  }
  if (prefixFilter.value) {
    entries = entries.filter(matchPrefix);
  }
  if (searchText.value) {
    const lower = searchText.value.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.message.toLowerCase().includes(lower) ||
        e.filename.toLowerCase().includes(lower) ||
        e.func.toLowerCase().includes(lower),
    );
  }
  return entries;
});

function scrollToBottom() {
  if (!autoScroll.value || !logContainerRef.value) return;
  nextTick(() => {
    const el = logContainerRef.value;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  });
}

function onScroll() {
  const el = logContainerRef.value;
  if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  if (!atBottom && autoScroll.value) {
    autoScroll.value = false;
  }
}

function clearLogs() {
  logs.value = [];
  lastEntryId.value = 0;
}

function onSearchChange() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    scrollToBottom();
  }, 300);
}

function connectSSE() {
  disconnectSSE();
  sseStatus.value = "connecting";

  try {
    eventSource = new EventSource("/api/logs/stream");

    eventSource.onopen = () => {
      sseStatus.value = "connected";
    };

    eventSource.onmessage = (event) => {
      try {
        const entry: LogEntry = JSON.parse(event.data);
        if (entry && entry.id !== undefined) {
          if (entry.id > lastEntryId.value) {
            lastEntryId.value = entry.id;
          }
          const idx = logs.value.findIndex((e) => e.id === entry.id);
          if (idx === -1) {
            logs.value.push(entry);
            if (logs.value.length > 3000) {
              logs.value.splice(0, logs.value.length - 3000);
            }
          } else {
            logs.value[idx] = entry;
          }
          scrollToBottom();
        }
      } catch {}
    };

    eventSource.onerror = () => {
      sseStatus.value = "disconnected";
      disconnectSSE();
      reconnectTimer = setTimeout(() => {
        connectSSE();
      }, 3000);
    };
  } catch {
    sseStatus.value = "disconnected";
    reconnectTimer = setTimeout(() => {
      connectSSE();
    }, 3000);
  }
}

function disconnectSSE() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  sseStatus.value = "disconnected";
}

async function fetchInitialLogs() {
  try {
    const params = new URLSearchParams();
    params.set("limit", "500");
    const resp = await fetch(`/api/logs?${params}`, { credentials: "include" });
    if (resp.ok) {
      const data = await resp.json();
      if (data.entries && Array.isArray(data.entries)) {
        logs.value = data.entries;
        if (data.entries.length > 0) {
          lastEntryId.value = data.entries[data.entries.length - 1].id;
        }
        scrollToBottom();
      }
    }
  } catch {}
}

onMounted(() => {
  fetchInitialLogs();
  connectSSE();
});

onUnmounted(() => {
  disconnectSSE();
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
});
</script>

<style scoped>
.log-viewer {
  height: calc(100vh - 160px);
  overflow-y: auto;
  background-color: #1e1e1e;
  border-radius: 6px;
  padding: 8px 0;
  font-family:
    "Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace;
  font-size: 13px;
  line-height: 1.6;
}

.log-line {
  padding: 1px 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-line:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.log-time {
  color: #9cdcfe;
  margin-right: 6px;
}

.log-level {
  display: inline-block;
  min-width: 56px;
  text-align: center;
  margin-right: 6px;
  font-weight: bold;
}

.log-level.level-trace {
  color: #858585;
}
.log-level.level-debug {
  color: #4ec9b0;
}
.log-level.level-info {
  color: #dcdcdc;
}
.log-level.level-success {
  color: #6a9955;
}
.log-level.level-warn {
  color: #d7ba7d;
}
.log-level.level-error {
  color: #f44747;
}

.log-source {
  color: #569cd6;
  margin-right: 6px;
}

.log-message {
  color: #d4d4d4;
}

.log-level-trace .log-message {
  color: #858585;
}
.log-level-debug .log-message {
  color: #4ec9b0;
}
.log-level-success .log-message {
  color: #6a9955;
}
.log-level-warn .log-message {
  color: #d7ba7d;
}
.log-level-error .log-message {
  color: #f44747;
}
.log-level-error {
  background-color: rgba(244, 71, 71, 0.08);
}
</style>