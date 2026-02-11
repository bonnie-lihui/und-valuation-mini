// pages/add-fund/index.js - 我的关注：搜索 → 展示结果 → 用户选择添加关注
const { getFundList, getFundCache, addFundCode, removeFundCode, MAX_FUND_COUNT, setFundCacheEntry } = require('../../../utils/storage');
const { getRealtimeValuation } = require('../../../utils/fundApi');
const { buildShareConfig, buildTimelineConfig } = require('../../../utils/share');

/** 将接口错误转为用户可读提示（兼容 err.message 与 err.errMsg） */
function getSearchErrorTip(err) {
  try {
    const msg = (err && (err.message || err.errMsg)) ? String(err.message || err.errMsg) : '';
    if (msg === '未查到' || msg.indexOf('未查') !== -1) return '未找到该代码，请检查后重试';
    if (msg === '网络异常' || msg.indexOf('网络') !== -1) return '网络异常，请稍后重试';
    if (msg === '数据格式异常') return '数据异常，请稍后重试';
    if (msg === '解析失败') return '数据解析失败，请稍后重试';
    if (msg === '请求失败') return '请求失败，请检查网络后重试';
    if (msg.indexOf('timeout') !== -1 || msg.indexOf('超时') !== -1) return '请求超时，请检查网络后重试';
    return msg || '请求失败，请稍后重试';
  } catch (e) {
    console.error('getSearchErrorTip error', e);
    return '请求失败，请稍后重试';
  }
}

Page({
  data: {
    searchValue: '',
    list: [],
    maxCount: MAX_FUND_COUNT,
    loading: false,
    searchLoading: false,
    searchResult: null,
    searchResultFollowed: false,
    searchError: null
  },

  _unloaded: false,

  onShow() {
    try {
      this._unloaded = false;
      // 进入「我的关注」页仅用缓存展示列表，不请求接口；只有搜索时才请求接口
      this.loadListFromCache();
    } catch (e) {
      console.error('add-fund onShow error', e);
    }
  },

  onUnload() {
    this._unloaded = true;
  },

  /** 仅从缓存组装列表，不发请求（用于 onShow、删除后刷新） */
  loadListFromCache() {
    try {
      const codes = getFundList();
      if (codes.length === 0) {
        if (!this._unloaded) this.setData({ list: [], loading: false });
        return;
      }
      const cache = getFundCache();
      const list = codes.map(code => ({
        fundcode: code,
        name: (cache[code] && cache[code].name) ? cache[code].name : ''
      }));
      if (!this._unloaded) this.setData({ list, loading: false });
    } catch (e) {
      console.error('add-fund loadListFromCache error', e);
      if (!this._unloaded) this.setData({ list: [], loading: false });
    }
  },

  loadList() {
    try {
      const codes = getFundList();
      if (codes.length === 0) {
        if (!this._unloaded) this.setData({ list: [], loading: false });
        return;
      }
      if (this._unloaded) return;
      this.setData({ loading: true });
      const self = this;
      const promises = codes.map(code =>
        getRealtimeValuation(code)
          .then(data => ({ fundcode: data.fundcode, name: data.name || data.fundcode }))
          .catch(() => ({ fundcode: code, name: '' }))
      );
      Promise.all(promises).then(list => {
        if (self._unloaded) return;
        try {
          self.setData({ list, loading: false });
        } catch (e) {
          console.error('add-fund loadList setData error', e);
          if (!self._unloaded) self.setData({ loading: false });
        }
      }).catch(e => {
        console.error('add-fund loadList error', e);
        if (!self._unloaded) self.setData({ loading: false });
      });
    } catch (e) {
      console.error('add-fund loadList error', e);
      if (!this._unloaded) this.setData({ list: [], loading: false });
    }
  },

  onSearchChange(e) {
    try {
      const raw = e && e.detail;
      const v = raw == null ? '' : (typeof raw === 'string' ? raw : (raw.value != null ? raw.value : ''));
      this.setData({ searchValue: String(v || ''), searchResult: null, searchError: null });
    } catch (err) {
      console.error('add-fund onSearchChange error', err);
    }
  },

  onSearchConfirm() {
    try {
      this.doSearch(this.data.searchValue);
    } catch (e) {
      console.error('add-fund onSearchConfirm error', e);
    }
  },

  onSearch(e) {
    try {
      const raw = e && e.detail;
      const value = raw == null ? '' : (typeof raw === 'string' ? raw : (raw.value != null ? raw.value : ''));
      this.doSearch(value);
    } catch (err) {
      console.error('add-fund onSearch error', err);
    }
  },

  doSearch(input) {
    try {
      const raw = (input != null && typeof input !== 'string') ? String(input.detail || '').trim() : String(input || '').trim();
      const code = raw.replace(/\D/g, '');
      if (!code) {
        wx.showToast({ title: '请输入代码', icon: 'none' });
        return;
      }
      if (code.length !== 6) {
        wx.showToast({ title: '代码一般为 6 位数字', icon: 'none' });
        return;
      }
      this.setData({ searchLoading: true, searchResult: null, searchError: null });
      const self = this;
      getRealtimeValuation(code)
        .then(data => {
          if (self._unloaded) return;
          try {
            let gszzl = null;
            if (data.gszzl != null) {
              const n = parseFloat(data.gszzl);
              gszzl = Number.isNaN(n) ? null : n;
            }
            const item = {
              fundcode: data.fundcode,
              name: data.name || data.fundcode,
              gszzl: gszzl,
              gztime: data.gztime || ''
            };
            const followed = getFundList().includes(data.fundcode);
            self.setData({
              searchLoading: false,
              searchResult: item,
              searchResultFollowed: followed,
              searchError: null
            });
          } catch (e) {
            console.error('add-fund doSearch then error', e);
            if (!self._unloaded) self.setData({ searchLoading: false, searchResult: null, searchError: '数据解析失败，请稍后重试' });
          }
        })
        .catch(err => {
          if (self._unloaded) return;
          try {
            self.setData({
              searchLoading: false,
              searchResult: null,
              searchError: getSearchErrorTip(err)
            });
          } catch (e) {
            console.error('add-fund doSearch catch error', e);
            if (!self._unloaded) self.setData({ searchLoading: false, searchResult: null, searchError: '请求失败，请稍后重试' });
          }
        });
    } catch (e) {
      console.error('add-fund doSearch error', e);
      this.setData({ searchLoading: false, searchResult: null, searchError: '请求失败，请稍后重试' });
    }
  },

  onAddFollow(e) {
    try {
      const code = e.currentTarget.dataset.code;
      if (!code) return;
      const list = getFundList();
      if (list.includes(code)) {
        wx.showToast({ title: '已关注', icon: 'none' });
        return;
      }
      if (list.length >= MAX_FUND_COUNT) {
        wx.showToast({ title: '最多可关注 ' + MAX_FUND_COUNT + ' 只', icon: 'none' });
        return;
      }
      const item = this.data.searchResult;
      if (item) {
        try {
          setFundCacheEntry(code, item);
        } catch (e) {
          console.error('add-fund onAddFollow setFundCacheEntry error', e);
        }
      }
      if (!addFundCode(code)) {
        wx.showToast({ title: '添加失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已添加', icon: 'success' });
      const newItem = item ? { fundcode: item.fundcode, name: item.name || item.fundcode } : { fundcode: code, name: '' };
      this.setData({
        searchResult: null,
        searchError: null,
        searchValue: '',
        list: (this.data.list || []).concat([newItem])
      });
    } catch (e) {
      console.error('add-fund onAddFollow error', e);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  onDelete(e) {
    const code = e.currentTarget.dataset.code;
    if (!code) return;
    wx.showModal({
      title: '确认',
      content: '确定取消关注吗？',
      fail: () => wx.showToast({ title: '操作已取消', icon: 'none' }),
      success: res => {
        if (res.confirm) {
          try {
            removeFundCode(code);
            this.loadListFromCache();
            wx.showToast({ title: '已取消关注', icon: 'none' });
          } catch (e) {
            console.error('add-fund onDelete error', e);
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  onShareAppMessage() {
    try {
      return buildShareConfig();
    } catch (e) {
      console.error('add-fund onShareAppMessage error', e);
      return buildShareConfig();
    }
  },

  onShareTimeline() {
    try {
      return buildTimelineConfig();
    } catch (e) {
      console.error('add-fund onShareTimeline error', e);
      return buildTimelineConfig();
    }
  }
});
