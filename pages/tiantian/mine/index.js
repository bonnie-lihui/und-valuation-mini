// pages/tiantian/mine/index.js - 我的页：头部头像 + 其他（关于我们、联系客服、一键清关注数据、版本更新）
const { buildShareConfig, buildTimelineConfig } = require('../../../utils/share');
const { clearAllFundData } = require('../../../utils/storage');

Page({
  data: {
    user: {
      avatar: '',
      nickname: '微信用户',
      desc: 'ID: 10086'
    },
    menuGroups: [
      {
        title: '其他',
        items: [
          { label: '关于我们', icon: 'info-o', path: '/pages/tiantian/about/index' },
          { label: '联系客服', icon: 'chat-o', openType: 'contact' },
          { label: '清除数据', icon: 'delete-o', action: 'clearData' },
          { label: '版本更新', icon: 'replay', action: 'checkUpdate' }
        ]
      }
    ]
  },

  onLoad() {},

  onMenuItemTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.label) return;
    if (item.path) {
      wx.navigateTo({ url: item.path });
      return;
    }
    if (item.action === 'clearData') {
      this.handleClearData();
      return;
    }
    if (item.action === 'checkUpdate') {
      this.handleCheckUpdate();
      return;
    }
    wx.showToast({ title: item.label + '（待开发）', icon: 'none' });
  },

  /** 一键清关注数据：弹窗确认后清空本地关注列表与估值缓存 */
  handleClearData() {
    wx.showModal({
      title: '确认清空',
      content: '将清空所有关注基金及估值缓存，是否继续？',
      success: (res) => {
        if (!res.confirm) return;
        try {
          clearAllFundData();
          wx.showToast({ title: '已清空', icon: 'success' });
        } catch (e) {
          console.error('mine handleClearData error', e);
          wx.showToast({ title: '清空失败', icon: 'none' });
        }
      }
    });
  },

  /** 版本更新检测：有更新时提示并应用（部分环境无 checkUpdate，仅注册监听并提示） */
  handleCheckUpdate() {
    if (this._checkUpdateInProgress) {
      wx.showToast({ title: '正在检测中', icon: 'none' });
      return;
    }
    let loadingClosed = false;
    const closeLoading = () => {
      if (loadingClosed) return;
      loadingClosed = true;
      this._checkUpdateInProgress = false;
      wx.hideLoading();
    };
    try {
      if (!wx.getUpdateManager) {
        wx.showToast({ title: '当前环境不支持更新', icon: 'none' });
        return;
      }
      const updateManager = wx.getUpdateManager();
      if (typeof updateManager.checkUpdate === 'function') {
        this._checkUpdateInProgress = true;
        wx.showLoading({ title: '检测中…' });
        const timeout = setTimeout(() => {
          closeLoading();
        }, 8000);
        updateManager.onCheckForUpdate((res) => {
          clearTimeout(timeout);
          closeLoading();
          if (res && res.hasUpdate === false) {
            wx.showToast({ title: '当前已是最新版本', icon: 'none' });
          }
        });
        updateManager.onUpdateReady(() => {
          clearTimeout(timeout);
          closeLoading();
          wx.showModal({
            title: '发现新版本',
            content: '新版本已就绪，是否立即重启应用？',
            showCancel: true,
            success: (res) => {
              if (res.confirm) updateManager.applyUpdate();
            }
          });
        });
        updateManager.onUpdateFailed(() => {
          clearTimeout(timeout);
          closeLoading();
          wx.showToast({ title: '更新失败，请稍后重试', icon: 'none' });
        });
        updateManager.checkUpdate();
      } else {
        wx.showToast({
          title: '请关闭小程序后重新打开以检查更新',
          icon: 'none'
        });
      }
    } catch (e) {
      closeLoading();
      console.error('mine handleCheckUpdate error', e);
      wx.showToast({ title: '检测失败', icon: 'none' });
    }
  },

  onShareAppMessage() {
    try {
      return buildShareConfig();
    } catch (e) {
      console.error('mine onShareAppMessage error', e);
      return buildShareConfig();
    }
  },

  onShareTimeline() {
    try {
      return buildTimelineConfig();
    } catch (e) {
      console.error('mine onShareTimeline error', e);
      return buildTimelineConfig();
    }
  }
});
