
<template>
  <n-config-provider :theme="theme">
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
import { computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import router from './router';

const store = useStore()
const theme = computed(() => store.state.theme)

onMounted(async () => {
  store.dispatch('initTheme')
  if(store.getters.token) {
    await store.dispatch('fetchBotList');
    if (window.location.pathname === '/') {
      router.push('/dashboard/');
    }
  }
});
</script>
