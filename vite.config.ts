import { defineConfig } from 'vite';

// GitHub Pages 部署在 https://chi-an-yang.github.io/wedding-invite/ 這個子路徑下，
// 所以要把 base 設成 repo 名稱，否則 build 出來的資源路徑會抓錯。
export default defineConfig({
  base: '/wedding-invite/',
});
