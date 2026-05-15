
<template>
  <n-config-provider :theme="theme">
    <div v-show="routeLoading" class="route-progress">
      <div
        class="route-progress__bar"
        :style="{ width: `${routeProgress}%` }"
      />
    </div>
    <n-dialog-provider>
      <n-message-provider>
        <DefaultLayout />
      </n-message-provider>
    </n-dialog-provider>
    <n-global-style />
  </n-config-provider>
</template>

<script setup>
import DefaultLayout from '@/layouts/default.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import router from './router';

const store = useStore()
const theme = computed(() => store.state.theme)
const routeLoading = ref(false)
const routeProgress = ref(0)
let progressTimer
let finishTimer

function startRouteProgress() {
  clearInterval(progressTimer)
  clearTimeout(finishTimer)
  routeLoading.value = true
  routeProgress.value = 12
  progressTimer = setInterval(() => {
    routeProgress.value = Math.min(routeProgress.value + (100 - routeProgress.value) * 0.18, 90)
  }, 180)
}

function finishRouteProgress() {
  clearInterval(progressTimer)
  routeProgress.value = 100
  finishTimer = setTimeout(() => {
    routeLoading.value = false
    routeProgress.value = 0
  }, 250)
}

const removeBeforeGuard = router.beforeEach((to, from, next) => {
  if (to.fullPath !== from.fullPath) {
    startRouteProgress()
  }
  next()
})

const removeAfterGuard = router.afterEach(() => {
  finishRouteProgress()
})

const removeErrorHandler = router.onError(() => {
  finishRouteProgress()
})

onMounted(async () => {
  store.dispatch('initTheme')
  if(store.getters.token) {
    await store.dispatch('fetchBotList');
    if (window.location.pathname === '/') {
      router.push('/dashboard/');
    }
  }
});

onBeforeUnmount(() => {
  clearInterval(progressTimer)
  clearTimeout(finishTimer)
  removeBeforeGuard()
  removeAfterGuard()
  removeErrorHandler()
})
</script>

<style scoped>
.route-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  height: 3px;
  pointer-events: none;
}

.route-progress__bar {
  height: 100%;
  background: #18a058;
  box-shadow: 0 0 8px rgba(24, 160, 88, 0.45);
  transition: width 0.18s ease, opacity 0.25s ease;
}
</style>
