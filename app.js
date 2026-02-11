// app.js - 估值查询小程序，数据仅供参考，不构成任何投资建议
const { wxLoginSilent } = require('./utils/auth');

App({
  onLaunch() {
    try {
      wxLoginSilent().catch(() => {
        // 静默登录失败（如网络/后端未启）不阻塞启动，后续需登录的接口会再试
      });
    } catch (e) {
      console.error('app onLaunch wxLoginSilent error', e);
    }
  },
  onHide() {},
  globalData: {},
});
