import { fileURLToPath, URL } from 'node:url'

import VueRouter from 'unplugin-vue-router/vite'
import ViteLayouts from 'vite-plugin-vue-layouts'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'

export default defineConfig(async ({ command }) => {
  const plugins = [
    VueRouter({
      routesFolder: fileURLToPath(new URL('./src/pages', import.meta.url)),
      dts: fileURLToPath(new URL('./typed-router.d.ts', import.meta.url)),
    }),
    ViteLayouts({
      defaultLayout: 'Default'
    }),
    vueJsx(),
    vue(),
  ]

  if (command === 'serve') {
    try {
      const { default: vueDevTools } = await import('vite-plugin-vue-devtools')
      plugins.push(vueDevTools())
    } catch {}
  }

  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    plugins,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      open: false,
    },
  }
})
