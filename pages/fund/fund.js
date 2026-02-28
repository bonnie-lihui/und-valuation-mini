/**
 * 基金截图 OCR 示例页（纯前端 VisionKit，无调用次数限制）
 * 使用方式：从相册/拍照选择截图后调用 recognizeFundImage，展示 fundList 与 summary
 */
const { recognizeFundImage, checkVisionKitSupport } = require('../../utils/fundOcr');

Page({
  data: {
    fundList: [],
    summary: {},
    visionKitSupported: true,
    canvasW: 800,
    canvasH: 600,
  },

  onLoad() {
    const support = checkVisionKitSupport();
    if (!support.supported) {
      this.setData({ visionKitSupported: false });
      wx.showToast({
        title: support.message || '请更新微信至最新版（需基础库 2.27.0+）',
        icon: 'none',
        duration: 3500,
      });
    }
  },

  /**
   * 选择基金截图并触发识别（无次数限制：VisionKit 在本地执行）
   */
  chooseFundImage() {
    if (!this.data.visionKitSupported) {
      wx.showToast({ title: '当前微信版本不支持，请更新后重试', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = (res.tempFiles && res.tempFiles[0]) ? res.tempFiles[0].tempFilePath : '';
        if (!tempFilePath) {
          wx.showToast({ title: '未获取到图片', icon: 'none' });
          return;
        }
        wx.showLoading({ title: '识别基金信息中...', mask: true });

        const opts = { pageContext: this, canvasId: 'ocrCanvas' };
        recognizeFundImage(tempFilePath, opts)
          .then(({ fundList }) => {
            wx.hideLoading();
            if (fundList && fundList.length > 0) {
              this.setData({ fundList, summary: {} });
              wx.showModal({
                title: '识别成功',
                content: `共识别 ${fundList.length} 只基金`,
                showCancel: false,
              });
              console.log('【结构化基金数据】', fundList);
            } else {
              this.setData({ fundList: [], summary: {} });
              wx.showToast({ title: '未识别到有效基金数据', icon: 'none' });
            }
          })
          .catch((err) => {
            wx.hideLoading();
            const msg = (err && err.message) ? err.message : '识别失败';
            wx.showToast({ title: msg, icon: 'none' });
            console.error('【基金OCR识别失败】', err);
          });
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: err.errMsg || '选择图片失败', icon: 'none' });
        }
      },
    });
  },
});
