<template>
  <n-layout style="height: 100vh">
    <n-layout-content
      style="margin-top: 30px; margin-left: 30px; margin-right: 30px"
    >
      <n-space vertical size="large">
        <n-flex justify="space-between" align="center">
          <div>
            <h2 style="margin: 0 0 6px">概览</h2>
          </div>
          <n-button type="primary" secondary size="small" @click="loadData">
            刷新
          </n-button>
        </n-flex>

        <n-spin :show="loadingRef">
          <n-grid :cols="isPhone ? 2 : 4" :x-gap="16" :y-gap="16">
            <n-grid-item>
              <n-card size="small" title="群聊数" hoverable>
                {{ data.today.groups }}
              </n-card>
            </n-grid-item>
            <n-grid-item>
              <n-card size="small" title="用户数" hoverable>
                {{ data.today.users }}
              </n-card>
            </n-grid-item>
            <n-grid-item>
              <n-card size="small" title="消息数" hoverable>
                {{ data.today.messages }}
              </n-card>
            </n-grid-item>
            <n-grid-item>
              <n-card size="small" title="加载插件数" hoverable>
                {{ data.plugins }}
              </n-card>
            </n-grid-item>
          </n-grid>
          <n-grid
            :cols="isPhone ? 1 : 2"
            :x-gap="16"
            :y-gap="16"
            style="margin-top: 16px"
          >
            <n-grid-item>
              <n-card size="small" title="用户/群聊数" hoverable>
                <div
                  ref="userGroupChart"
                  style="width: 100%; height: 400px"
                ></div>
              </n-card>
            </n-grid-item>
            <n-grid-item>
              <n-card size="small" title="消息数" hoverable>
                <div
                  ref="messageChart"
                  style="width: 100%; height: 400px"
                ></div>
              </n-card>
            </n-grid-item>
          </n-grid>
        </n-spin>
      </n-space>
    </n-layout-content>
  </n-layout>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useStore } from "vuex";
import axios from "axios";
import { useMessage } from "naive-ui";
import * as echarts from "echarts";
const message = useMessage();

const store = useStore();
const currentBotId = computed(() => store.state.currentBotId);
const isPhone = computed(() => store.state.isphone);

const data = ref({
  today: {
    groups: 0,
    users: 0,
    messages: 0,
  },
  plugins: 0,
  daily: {
    dates: [],
    messages: [],
    users: [],
    groups: [],
  },
});

function normalizeDailyData(daily) {
  if (Array.isArray(daily)) {
    return {
      dates: daily.map((item) => item.date || ""),
      messages: daily.map((item) => item.messages || 0),
      users: daily.map((item) => item.users || 0),
      groups: daily.map((item) => item.groups || 0),
    };
  }

  return {
    dates: daily?.dates || [],
    messages: daily?.messages || [],
    users: daily?.users || [],
    groups: daily?.groups || [],
  };
}

function normalizeStatusData(statusData) {
  return {
    ...statusData,
    today: statusData?.today || { groups: 0, users: 0, messages: 0 },
    plugins: statusData?.plugins || 0,
    daily: normalizeDailyData(statusData?.daily),
  };
}

const UserGroupChartOption = {
  tooltip: {
    trigger: "axis",
    axisPointer: {
      type: "shadow",
    },
    borderWidth: 1,
    textStyle: {
      color: "#000",
      fontSize: 12,
    },
  },
  xAxis: {
    type: "category",
    data: data.value.daily.dates,
  },
  yAxis: {
    type: "value",
  },
  series: [
    {
      data: data.value.daily.users,
      type: "line",
      name: "用户数",
    },
    {
      data: data.value.daily.groups,
      type: "line",
      name: "群聊数",
    },
  ],
};

const MessageChartOption = {
  tooltip: {
    trigger: "axis",
    axisPointer: {
      type: "shadow",
    },
    borderWidth: 1,
    textStyle: {
      color: "#000",
      fontSize: 12,
    },
  },
  xAxis: {
    type: "category",
    data: data.value.daily.dates,
  },
  yAxis: {
    type: "value",
  },
  series: [
    {
      data: data.value.daily.messages,
      type: "line",
      name: "消息数",
    },
  ],
};

const loadingRef = ref(true);
const userGroupChart = ref(null);
const messageChart = ref(null);

let userGroupChartInstance = null;
let messageChartInstance = null;

async function loadData() {
  if (!currentBotId.value) {
    loadingRef.value = false;
    return;
  }
  loadingRef.value = true;
  try {
    const res = await axios.get("/api/status", {
      params: { botId: currentBotId.value },
      withCredentials: true,
    });
    data.value = normalizeStatusData(res.data);
    UserGroupChartOption.xAxis.data = data.value.daily.dates;
    UserGroupChartOption.series[0].data = data.value.daily.users;
    UserGroupChartOption.series[1].data = data.value.daily.groups;
    MessageChartOption.xAxis.data = data.value.daily.dates;
    MessageChartOption.series[0].data = data.value.daily.messages;

    if (userGroupChart.value) {
      if (userGroupChartInstance) userGroupChartInstance.dispose();
      userGroupChartInstance = echarts.init(userGroupChart.value);
      userGroupChartInstance.setOption(UserGroupChartOption);
    }
    if (messageChart.value) {
      if (messageChartInstance) messageChartInstance.dispose();
      messageChartInstance = echarts.init(messageChart.value);
      messageChartInstance.setOption(MessageChartOption);
    }
  } catch (e) {
    message.error(`获取数据失败: ${e.message || "未知错误"}`);
  } finally {
    loadingRef.value = false;
  }
}

watch(currentBotId, () => {
  loadData();
});

onMounted(() => {
  loadData();
});
</script>
