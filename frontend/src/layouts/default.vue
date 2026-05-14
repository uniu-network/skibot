<template>
  <n-space vertical>
    <n-layout>
      <n-layout-header>
        <TopBar />
      </n-layout-header>
      <n-layout has-sider>
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
            :style="{ width: collapsed ? '64px' : '240px' }"
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
            :style="{ width: collapsed ? '64px' : '240px' }"
          />
        </n-layout-sider>

        <n-layout>
          <span>
            <router-view />
          </span>
        </n-layout>
      </n-layout>
    </n-layout>
  </n-space>
</template>

<script setup lang="js">
import { LogIn, AppsSharp, Albums, People, ExtensionPuzzle, ChatbubblesSharp, TerminalSharp } from "@vicons/ionicons5";
import { ref, h, onMounted, computed } from "vue";
import { useStore } from "vuex";
import TopBar from '../components/TopBar.vue';
import router from '../router';

const store = useStore();
const collapsed = ref(true);
const isphone = computed(() => store.state.isphone);

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
    icon: Albums,
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
    icon: ExtensionPuzzle,
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
    label: "登录",
    key: "login",
    icon: LogIn,
    onClick: () => {
      router.push('/dashboard/auth/login');
    },
  },
];

const filteredMenuOptions = computed(() => {
  const token = store.getters.token;
  return menuOptions.filter(option => {
    if (!token && ['overview', 'plugins', 'bots', 'adapters', 'messages', 'commands'].includes(option.key)) return false;
    if (token && option.key === 'login') {
      return false;
    }
    return true;
  });
});

function IsPhone() {
  const info = navigator.userAgent;
  const isPhone = /mobile/i.test(info);
  store.commit('setIsphone', isPhone);
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
  return h('span', '▶');
}

onMounted(() => {
  IsPhone();
  if (!store.getters.token && !window.location.pathname.startsWith('/dashboard/auth')) {
    router.push('/dashboard/auth/login');
  }
});
</script>
