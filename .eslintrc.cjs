module.exports = {
  root: true,
  extends: ['@antfu'],
  rules: {
    '@typescript-eslint/consistent-type-definitions': 'off',
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off', // 取消打印标红提醒
  },
}
