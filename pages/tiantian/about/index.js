// pages/tiantian/about/index.js - 关于我们
const { buildShareConfig, buildTimelineConfig } = require('../../../utils/share');
Page({
  data: {},

  onLoad() {},

  onShareAppMessage() {
    try {
      return buildShareConfig();
    } catch (e) {
      console.error('about onShareAppMessage error', e);
      return buildShareConfig();
    }
  },

  onShareTimeline() {
    try {
      return buildTimelineConfig();
    } catch (e) {
      console.error('about onShareTimeline error', e);
      return buildTimelineConfig();
    }
  }
});
