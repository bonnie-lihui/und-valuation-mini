Page({
  goScreenshot() {
    wx.navigateTo({
      url: '/pages/tiantian/add-holding-screenshot/index',
      fail: () => wx.showToast({ title: '跳转失败', icon: 'none' }),
    });
  },

  goManual() {
    wx.navigateTo({
      url: '/pages/tiantian/add-holding/index',
      fail: () => wx.showToast({ title: '跳转失败', icon: 'none' }),
    });
  },
});
