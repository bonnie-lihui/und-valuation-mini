// pages/tiantian/mine/index.js - 我的页：占位昵称/id（静默登录下发）+ 其他
const { buildShareConfig, buildTimelineConfig } = require('../../../utils/share');
const { getUser } = require('../../../utils/auth');

Page({
  data: {
    user: {
      avatar: '',
      nickname: '微信用户',
      desc: 'ID: -'
    },
    menuGroups: [
      {
        title: '其他',
        items: [
          { label: '关于我们', icon: 'info-o', path: '/pages/tiantian/about/index' },
          { label: '联系客服', icon: 'chat-o', openType: 'contact' },
          { label: '版本更新', icon: 'replay', action: 'checkUpdate' }
        ]
      }
    ]
  },

  onLoad() {
    const u = getUser();
    if (u && (u.nickname || u.id)) {
      this.setData({
        user: {
          avatar: '',
          nickname: u.nickname || '微信用户',
          desc: u.id ? 'ID: ' + u.id : ''
        }
      });
    }
  },

  onShow() {
    const u = getUser();
    if (u && (u.nickname || u.id)) {
      this.setData({
        user: {
          avatar: '',
          nickname: u.nickname || '微信用户',
          desc: u.id ? 'ID: ' + u.id : ''
        }
      });
    }
  },

  onMenuItemTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.label) return;
    if (item.path) {
      wx.navigateTo({
        url: item.path,
        fail: () => wx.showToast({ title: '跳转失败', icon: 'none' }),
      });
      return;
    }
    if (item.action === 'checkUpdate') {
      this.handleCheckUpdate();
      return;
    }
    wx.showToast({ title: item.label + '（待开发）', icon: 'none' });
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
          } else if (res && res.hasUpdate === true) {
            wx.showToast({ title: '发现新版本，正在下载', icon: 'none' });
          }
        });
        updateManager.onUpdateReady(() => {
          clearTimeout(timeout);
          closeLoading();
          wx.showModal({
            title: '发现新版本',
            content: '新版本已就绪，是否立即重启应用？',
            showCancel: true,
            fail: () => wx.showToast({ title: '操作已取消', icon: 'none' }),
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
