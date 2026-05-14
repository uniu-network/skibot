<template>
  <n-card size="small">
    <n-flex justify="space-between" align="center" style="gap: 12px;">
      <n-flex align="center" style="gap: 12px;">
        <n-avatar
          round
          size="medium"
          src="https://avatars.githubusercontent.com/u/198344200" />
        <div>
          Skibot Dashboard
        </div>
        <n-select
          v-if="botList.length > 0"
          :value="currentBotId"
          :options="botSelectOptions"
          placeholder="选择Bot"
          size="small"
          style="width: 180px;"
          @update:value="setCurrentBotId"
        />
      </n-flex>
      <n-flex align="center" style="gap: 8px;">
        <n-button v-if="!isdarkVal" strong secondary size="small" @click="switchTheme">
          <template #icon><n-icon :component="Moon" /></template>
        </n-button>
        <n-button v-if="isdarkVal" strong secondary size="small" @click="switchTheme">
          <template #icon><n-icon :component="Sunny" /></template>
        </n-button>
        <n-button v-if="isLoggedIn" strong secondary type="error" size="small" @click="handleLogout">
          <template #icon><n-icon :component="LogOut" /></template>
          登出
        </n-button>
      </n-flex>
    </n-flex>
  </n-card>
</template>

<script setup>
import { computed } from 'vue'
import { useStore } from 'vuex'
import {
  Moon,
  Sunny,
  LogOut
} from '@vicons/ionicons5'

const store = useStore()
const switchTheme = () => store.commit('toggleTheme')
const isdarkVal = computed(() => store.state.isdark)
const currentBotId = computed(() => store.state.currentBotId)
const botList = computed(() => store.state.botList)
const botSelectOptions = computed(() => store.getters.botSelectOptions)
const isLoggedIn = computed(() => !!store.getters.token)

function setCurrentBotId(botId) {
  store.commit('setCurrentBotId', botId)
}

function handleLogout() {
  document.cookie = "token=; path=/; max-age=0"
  window.location.href = '/dashboard/'
}
</script>