import tseslint from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: tseslint.parser } }
  }
)
