import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vuePlugin from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import globals from 'globals'

export default [
  {
    ignores: ['node_modules', 'web/node_modules', 'web/.nuxt', 'dist', 'web/.output'],
  },
  js.configs.recommended,
  {
    rules: {
      'no-empty': 'off',
    },
  },
  {
    files: ['api/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
        fetch: 'readonly',
      },
    },
  },
  {
    files: ['api/test/**/*.{js,mjs}', 'web/test/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
    },
  },
  {
    files: ['web/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tsParser, sourceType: 'module' },
      globals: {
        ...globals.browser,
        defineNuxtPlugin: 'readonly',
        useNuxtApp: 'readonly',
        useRuntimeConfig: 'readonly',
        ref: 'readonly',
        computed: 'readonly',
        watch: 'readonly',
        useToast: 'readonly',
        $fetch: 'readonly',
        process: 'readonly',
      },
    },
    plugins: { vue: vuePlugin },
    rules: {
      ...vuePlugin.configs['vue3-recommended'].rules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['web/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.browser,
        defineNuxtPlugin: 'readonly',
        useNuxtApp: 'readonly',
        useRuntimeConfig: 'readonly',
        ref: 'readonly',
        computed: 'readonly',
        watch: 'readonly',
        useToast: 'readonly',
        $fetch: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]
