import { createStore } from "vuex";
import axios from "axios";
import { darkTheme, lightTheme } from "naive-ui";

function getTokenFromCookie() {
  const tokenMatch = document.cookie.match(/(^| )token=([^;]+)/);
  return tokenMatch ? tokenMatch[2] : null;
}

const store = createStore({
  state() {
    return {
      theme: lightTheme,
      isdark: false,
      isphone: false,
      currentBotId: null,
      botList: [],
    };
  },
  getters: {
    token() {
      return getTokenFromCookie();
    },
    botSelectOptions(state) {
      return state.botList.map((bot) => ({
        label: `${bot.name} (${bot.botId})`,
        value: bot.botId,
      }));
    },
  },
  mutations: {
    setTheme(state, theme) {
      state.theme = theme;
      state.isdark = theme.name === "dark";
    },
    toggleTheme(state) {
      const useDark = state.theme.name === "light";
      state.theme = useDark ? darkTheme : lightTheme;
      state.isdark = useDark;
    },
    setIsphone(state, isphone) {
      state.isphone = isphone;
    },
    setBotList(state, botList) {
      state.botList = botList;
      if (botList.length > 0 && !state.currentBotId) {
        state.currentBotId = botList[0].botId;
      }
    },
    setCurrentBotId(state, botId) {
      state.currentBotId = botId;
    },
  },
  actions: {
    async fetchBotList({ commit }) {
      try {
        const res = await axios.get("/api/bots/list", {
          withCredentials: true,
        });
        commit("setBotList", res.data || []);
      } catch (e) {
        commit("setBotList", []);
      }
    },
    initViewport({ commit }) {
      commit("setIsphone", /mobile/i.test(navigator.userAgent));
    },
    initTheme({ commit }) {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        commit("setTheme", darkTheme);
      }
    },
  },
});

export default store;
