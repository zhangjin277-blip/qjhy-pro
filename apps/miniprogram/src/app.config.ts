export default defineAppConfig({
  pages: ["pages/index/index", "pages/performance/index", "pages/ranking/index"],
  window: {
    navigationBarTitleText: "QJHY 运营",
    navigationBarBackgroundColor: "#ffffff",
    navigationBarTextStyle: "black",
    backgroundColor: "#f4f6f8",
    backgroundTextStyle: "dark",
    enablePullDownRefresh: true,
  },
  tabBar: {
    color: "#78838e",
    selectedColor: "#3d6b5d",
    backgroundColor: "#ffffff",
    borderStyle: "black",
    list: [
      { pagePath: "pages/index/index", text: "业务数据" },
      { pagePath: "pages/performance/index", text: "我的绩效" },
    ],
  },
});
