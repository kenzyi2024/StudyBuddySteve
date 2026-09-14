// vite.config.js
import { defineConfig } from "file:///sessions/pensive-peaceful-volta/mnt/StudyBuddySteve/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/pensive-peaceful-volta/mnt/StudyBuddySteve/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls to the Node/Express gateway during development
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true
      }
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: false,
    // Component/logic tests only — never pull in node_modules specs.
    include: ["src/**/*.{test,spec}.{ts,tsx}"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvcGVuc2l2ZS1wZWFjZWZ1bC12b2x0YS9tbnQvU3R1ZHlCdWRkeVN0ZXZlXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvc2Vzc2lvbnMvcGVuc2l2ZS1wZWFjZWZ1bC12b2x0YS9tbnQvU3R1ZHlCdWRkeVN0ZXZlL3ZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9zZXNzaW9ucy9wZW5zaXZlLXBlYWNlZnVsLXZvbHRhL21udC9TdHVkeUJ1ZGR5U3RldmUvdml0ZS5jb25maWcuanNcIjsvLy8gPHJlZmVyZW5jZSB0eXBlcz1cInZpdGVzdC9jb25maWdcIiAvPlxuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCdcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtyZWFjdCgpXSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogNTE3MyxcbiAgICAvLyBQcm94eSBBUEkgY2FsbHMgdG8gdGhlIE5vZGUvRXhwcmVzcyBnYXRld2F5IGR1cmluZyBkZXZlbG9wbWVudFxuICAgIHByb3h5OiB7XG4gICAgICAnL2FwaSc6IHtcbiAgICAgICAgdGFyZ2V0OiAnaHR0cDovL2xvY2FsaG9zdDo0MDAwJyxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxuICB0ZXN0OiB7XG4gICAgZW52aXJvbm1lbnQ6ICdqc2RvbScsXG4gICAgZ2xvYmFsczogdHJ1ZSxcbiAgICBzZXR1cEZpbGVzOiAnLi9zcmMvdGVzdC9zZXR1cC50cycsXG4gICAgY3NzOiBmYWxzZSxcbiAgICAvLyBDb21wb25lbnQvbG9naWMgdGVzdHMgb25seSBcdTIwMTQgbmV2ZXIgcHVsbCBpbiBub2RlX21vZHVsZXMgc3BlY3MuXG4gICAgaW5jbHVkZTogWydzcmMvKiovKi57dGVzdCxzcGVjfS57dHMsdHN4fSddLFxuICB9LFxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFDQSxTQUFTLG9CQUFvQjtBQUM3QixPQUFPLFdBQVc7QUFHbEIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQTtBQUFBLElBRU4sT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLE1BQ2hCO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE1BQU07QUFBQSxJQUNKLGFBQWE7QUFBQSxJQUNiLFNBQVM7QUFBQSxJQUNULFlBQVk7QUFBQSxJQUNaLEtBQUs7QUFBQTtBQUFBLElBRUwsU0FBUyxDQUFDLCtCQUErQjtBQUFBLEVBQzNDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
