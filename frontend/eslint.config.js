import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...pluginVue.configs['flat/recommended'],
  ...tseslint.configs.recommended,
  {
    // typescript-eslint's recommended config sets languageOptions.parser globally
    // (no `files` filter), which otherwise clobbers vue-eslint-parser for .vue
    // files since this entry comes last in the array. Reassert both parsers here.
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  }
);
