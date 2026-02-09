// pages/tiantian/mine/index.js - 我的页：头部头像 + 其他（关于我们、联系客服）
const { buildShareConfig, buildTimelineConfig } = require('../../../utils/share');
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
          { label: '联系客服', icon: 'chat-o', openType: 'contact' }
        ]
      }
    ]
  },

  onLoad() {},

  onMenuItemTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.label) return;
    const path = item.path;
    if (path) {
      wx.navigateTo({ url: path });
    } else {
      wx.showToast({ title: item.label + '（待开发）', icon: 'none' });
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
