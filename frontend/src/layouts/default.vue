<template>
  <n-layout class="layout-shell">
    <n-layout-header>
      <TopBar />
    </n-layout-header>
    <n-layout has-sider class="layout-body">
      <n-layout-sider
        v-if="!isphone"
        bordered
        collapse-mode="width"
        :collapsed-width="64"
        :width="240"
        :collapsed="collapsed"
        show-trigger
        @collapse="collapsed = true"
        @expand="collapsed = false"
      >
        <n-menu
          :collapsed="collapsed"
          :collapsed-width="64"
          :collapsed-icon-size="22"
          :options="filteredMenuOptions"
          :render-label="renderMenuLabel"
          :render-icon="renderMenuIcon"
          :expand-icon="expandIcon"
          :value="currentRouteKey"
          :style="{ width: collapsed ? '64px' : '240px', height: '100%', overflowY: 'auto' }"
        />
      </n-layout-sider>
      <n-layout-sider
        v-else
        bordered
        collapse-mode="width"
        :collapsed-width="10"
        :width="240"
        :collapsed="collapsed"
        show-trigger
        @collapse="collapsed = true"
        @expand="collapsed = false"
      >
        <n-menu
          :collapsed="collapsed"
          :collapsed-width="64"
          :collapsed-icon-size="22"
          :options="filteredMenuOptions"
          :render-label="renderMenuLabel"
          :render-icon="renderMenuIcon"
          :expand-icon="expandIcon"
          :value="currentRouteKey"
          :style="{ width: collapsed ? '64px' : '240px', height: '100%', overflowY: 'auto' }"
        />
      </n-layout-sider>

      <n-layout class="layout-content">
        <router-view />
      </n-layout>
    </n-layout>
  </n-layout>
</template>

<script setup lang="js">
import {
  LogIn,
  AppsSharp,
  Albums,
  People,
  ExtensionPuzzle,
  ChatbubblesSharp,
  TerminalSharp,
  ServerSharp,
  DocumentTextSharp,
  SettingsSharp,
} from "@vicons/ionicons5";
import { ref, h, onMounted, computed } from "vue";
import { useStore } from "vuex";
import { useRoute } from "vue-router";
import TopBar from "../components/TopBar.vue";
import router from "../router";

const store = useStore();
const collapsed = ref(true);
const isphone = computed(() => store.state.isphone);
const route = useRoute();

const currentRouteKey = computed(() => {
  const path = route.path;
  if (path.includes("/plugins")) return "plugins";
  if (path.includes("/bots")) return "bots";
  if (path.includes("/adapters")) return "adapters";
  if (path.includes("/messages")) return "messages";
  if (path.includes("/commands")) return "commands";
  if (path.includes("/database")) return "database";
  if (path.includes("/logs")) return "logs";
  if (path.includes("/settings")) return "settings";
  if (path.includes("/auth/login")) return "login";
  return "overview";
});

const menuOptions = [
  {
    label: "概览",
    key: "overview",
    icon: AppsSharp,
    onClick: () => {
      router.push("/dashboard/");
    },
  },
  {
    label: "插件管理",
    key: "plugins",
    icon: ExtensionPuzzle,
    onClick: () => {
      router.push("/dashboard/plugins");
    },
  },
  {
    label: "Bot管理",
    key: "bots",
    icon: People,
    onClick: () => {
      router.push("/dashboard/bots");
    },
  },
  {
    label: "适配器管理",
    key: "adapters",
    icon: Albums,
    onClick: () => {
      router.push("/dashboard/adapters");
    },
  },
  {
    label: "消息记录",
    key: "messages",
    icon: ChatbubblesSharp,
    onClick: () => {
      router.push("/dashboard/messages");
    },
  },
  {
    label: "指令管理",
    key: "commands",
    icon: TerminalSharp,
    onClick: () => {
      router.push("/dashboard/commands");
    },
  },
  {
    label: "数据库",
    key: "database",
    icon: ServerSharp,
    onClick: () => {
      router.push("/dashboard/database");
    },
  },
  {
    label: "运行日志",
    key: "logs",
    icon: DocumentTextSharp,
    onClick: () => {
      router.push("/dashboard/logs");
    },
  },
  {
    label: "系统设置",
    key: "settings",
    icon: SettingsSharp,
    onClick: () => {
      router.push("/dashboard/settings");
    },
  },
  {
    label: "登录",
    key: "login",
    icon: LogIn,
    onClick: () => {
      router.push("/dashboard/auth/login");
    },
  },
];

const filteredMenuOptions = computed(() => {
  const token = store.getters.token;
  return menuOptions.filter((option) => {
    if (
      !token &&
      [
        "overview",
        "plugins",
        "bots",
        "adapters",
        "messages",
        "commands",
        "database",
        "logs",
        "settings",
      ].includes(option.key)
    )
      return false;
    if (token && option.key === "login") {
      return false;
    }
    return true;
  });
});

function IsPhone() {
  const info = navigator.userAgent;
  const isPhone = /mobile/i.test(info);
  store.commit("setIsphone", isPhone);
  return isPhone;
}

function renderMenuLabel(option) {
  if ("href" in option) {
    return h("a", { href: option.href, target: "_blank" }, option.label);
  }
  return option.label;
}

function renderMenuIcon(option) {
  return h(option.icon);
}

function expandIcon() {
  return h("span", "▶");
}

onMounted(() => {
  IsPhone();
  if (
    !store.getters.token &&
    !window.location.pathname.startsWith("/dashboard/auth")
  ) {
    router.push("/dashboard/auth/login");
  }
});
</script>

<style scoped>
.layout-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.layout-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.layout-body :deep(.n-layout-sider) {
  overflow: hidden;
}

.layout-content {
  overflow-y: auto;
}
</style>
