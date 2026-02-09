// pages/index/index.js
const { getFundList, removeFundCode, getFundCache, setFundCacheEntry } = require('../../../utils/storage');
const { getRealtimeValuation } = require('../../../utils/fundApi');
const { buildShareConfig, buildTimelineConfig } = require('../../../utils/share');

// 计算距离下次刷新的秒数（每逢 :00、:30 秒刷新，倒计时 1～30 秒）
function getNextRefreshCountdown() {
  try {
    const sec = new Date().getSeconds();
    if (sec < 30) return 30 - sec;
    return 60 - sec;
  } catch (e) {
    console.error('getNextRefreshCountdown error', e);
    return 30;
  }
}

Page({
  data: {
    list: [],
    loading: true,
    refreshCountdown: 30 // 倒计时秒数，如 25 表示 25 秒后刷新
  },

  _refreshTimer: null,
  _lastTriggerKey: '',
  _unloaded: false,
  _isFirstShow: true, // 首次打开不在此处拉接口（onLoad 已拉）；仅「从添加页返回」时在 onShow 拉接口

  onLoad() {
    try {
      this._unloaded = false;
      this.setData({ refreshCountdown: getNextRefreshCountdown() });
      this.loadList();
      this._startRefreshTimer();
    } catch (e) {
      console.error('index onLoad error', e);
    }
  },

  _startRefreshTimer() {
    this._clearRefreshTimer();
    const self = this;
    this._refreshTimer = setInterval(function () {
      try {
        if (self._unloaded) return;
        self.setData({ refreshCountdown: getNextRefreshCountdown() });
        if (self.data.list.length === 0 || self.data.loading) return;
        const now = new Date();
        const sec = now.getSeconds();
        const slot = sec === 0 ? 0 : sec === 30 ? 30 : -1;
        if (slot < 0) return;
        const key = `${now.getMinutes()}:${slot}`;
        if (self._lastTriggerKey !== key) {
          self._lastTriggerKey = key;
          self.loadList();
        }
      } catch (e) {
        console.error('index refresh timer error', e);
      }
    }, 1000);
  },

  _clearRefreshTimer() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  },

  onHide() {
    this._clearRefreshTimer();
  },

  onShow() {
    try {
      this._startRefreshTimer();
      // 刷新列表仅三种时机：① 冷启动 onLoad ② 从「我的关注」后退 ③ 计时 :00/:30 到点
      if (this._isFirstShow) {
        this._isFirstShow = false;
        return;
      }
      // 从「我的关注」等页后退：再次刷新首页列表
      this.loadList();
    } catch (e) {
      console.error('index onShow error', e);
    }
  },

  onUnload() {
    this._unloaded = true;
    this._clearRefreshTimer();
  },

  onPullDownRefresh() {
    // 下拉刷新不走接口，仅关闭下拉动画
    try {
      wx.stopPullDownRefresh();
    } catch (e) {
      console.error('index onPullDownRefresh stop error', e);
    }
  },

  loadList() {
    try {
      const codes = getFundList();
      if (codes.length === 0) {
        this.setData({ list: [], loading: false });
        return Promise.resolve();
      }

      if (this._unloaded) return Promise.resolve();
      this.setData({ loading: true });
      let cache = {};
      try {
        cache = getFundCache();
      } catch (e) {
        console.error('index loadList getFundCache error', e);
      }
      const promises = codes.map(code =>
        getRealtimeValuation(code)
          .then(data => {
            try {
              setFundCacheEntry(code, data);
            } catch (e) {
              console.error('index loadList setFundCacheEntry error', e);
            }
            return { ...data, error: null };
          })
          .catch(err => {
            try {
              const cached = cache[code];
              if (cached && (cached.name || cached.gszzl != null)) {
                return {
                  fundcode: code,
                  name: cached.name || code,
                  gszzl: cached.gszzl,
                  error: null
                };
              }
            } catch (e) {
              console.error('index loadList cache fallback error', e);
            }
            return {
              fundcode: code,
              name: '',
              error: (err && err.message) ? err.message : '获取失败'
            };
          })
      );

      return Promise.all(promises).then(list => {
        if (this._unloaded) return;
        try {
          this.setData({ list, loading: false });
        } catch (e) {
          console.error('index loadList setData error', e);
          if (!this._unloaded) this.setData({ loading: false });
        }
      }).catch(e => {
        console.error('index loadList error', e);
        if (!this._unloaded) this.setData({ loading: false });
      });
    } catch (e) {
      console.error('index loadList error', e);
      if (!this._unloaded) this.setData({ list: [], loading: false });
      return Promise.resolve();
    }
  },

  goAdd() {
    try {
      wx.navigateTo({ url: '/pages/tiantian/add-fund/index' });
    } catch (e) {
      console.error('index goAdd error', e);
      wx.showToast({ title: '跳转失败', icon: 'none' });
    }
  },

  onDelete(e) {
    const code = e.currentTarget.dataset.code;
    if (!code) return;
    wx.showModal({
      title: '确认',
      content: '确定取消关注吗？',
      success: res => {
        if (res.confirm) {
          try {
            removeFundCode(code);
            this.loadList();
            wx.showToast({ title: '已取消关注', icon: 'none' });
          } catch (e) {
            console.error('index onDelete error', e);
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  onSwipeClose() {},

  onShareAppMessage() {
    try {
      const count = (this.data.list || []).length;
      const title = count > 0
        ? `我在关注 ${count} 只基金，快来一起看估值`
        : '净值速查：实时估值与涨幅';
      return buildShareConfig({ title });
    } catch (e) {
      console.error('index onShareAppMessage error', e);
      return buildShareConfig();
    }
  },

  onShareTimeline() {
    try {
      const count = (this.data.list || []).length;
      const title = count > 0
        ? `我在关注 ${count} 只基金，快来一起看估值`
        : '净值速查：实时估值与涨幅';
      return buildTimelineConfig({ title });
    } catch (e) {
      console.error('index onShareTimeline error', e);
      return buildTimelineConfig();
    }
  }
});
