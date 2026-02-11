const { request } = require('../../../utils/request');
const { getRealtimeValuation } = require('../../../utils/fundApi');
const { formatApiError } = require('../../../utils/errorMsg');

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

Page({
  data: {
    list: [],
    loading: true,
    headerDate: '', // MM-DD 表头第二行展示的日期
    accountAsset: '0.00',
    totalDailyProfit: '0.00',
    totalDailyRate: '0.00',
    showDailyRate: false,
    amountVisible: true,
    sortBy: '', // 'gszzl' | 'dailyProfit' | 'holdingProfit'
    sortOrder: 'asc', // 'asc' | 'desc'
  },

  _unloaded: false,

  _applySort(list, sortBy, sortOrder) {
    if (!sortBy || !list.length) return list;
    const key = sortBy === 'gszzl' ? 'gszzl' : sortBy === 'dailyProfit' ? 'dailyProfit' : 'holdingProfit';
    return list.slice().sort((a, b) => {
      const va = a[key] != null ? a[key] : -Infinity;
      const vb = b[key] != null ? b[key] : -Infinity;
      if (va === vb) return 0;
      return sortOrder === 'asc' ? (va - vb) : (vb - va);
    });
  },

  onSortHeader(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    let { sortBy, sortOrder, list } = this.data;
    if (sortBy === field) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = field;
      sortOrder = 'desc';
    }
    const sorted = this._applySort(list, sortBy, sortOrder);
    this.setData({ sortBy, sortOrder, list: sorted });
  },

  onLoad() {
    this._unloaded = false;
    const now = new Date();
    const headerDate = (now.getMonth() + 1).toString().padStart(2, '0') + '-' + now.getDate().toString().padStart(2, '0');
    this.setData({ headerDate });
    try {
      const amountVisible = wx.getStorageSync('holdings_amount_visible');
      this.setData({ amountVisible: amountVisible !== false });
    } catch (e) {
      // 忽略存储读取失败，使用默认 true
    }
    this.loadList();
  },

  toggleAmountVisible() {
    const amountVisible = !this.data.amountVisible;
    this.setData({ amountVisible });
    try {
      wx.setStorageSync('holdings_amount_visible', amountVisible);
    } catch (e) {
      // 忽略存储写入失败
    }
  },

  onShow() {
    if (this._unloaded) return;
    this.loadList();
  },

  onUnload() {
    this._unloaded = true;
  },

  toggleDailyDisplay() {
    this.setData({ showDailyRate: !this.data.showDailyRate });
  },

  loadList() {
    this.setData({ loading: true });
    request({ url: '/user/watchlist', method: 'GET' })
      .then((watchlist) => {
        if (this._unloaded) return;
        if (!watchlist || watchlist.length === 0) {
          this.setData({ list: [], loading: false, accountAsset: '0.00', totalDailyProfit: '0.00', totalDailyRate: '0.00' });
          return;
        }
        const codes = watchlist.map((w) => w.fundCode);
        const promises = codes.map((code) =>
          getRealtimeValuation(code).catch(() => null)
        );
        Promise.all(promises).then((valuations) => {
          if (this._unloaded) return;
          const failCount = (valuations || []).filter((v) => v == null).length;
          if (failCount > 0) {
            wx.showToast({
              title: failCount === codes.length ? '基金估值获取失败，请稍后重试' : '部分基金估值获取失败',
              icon: 'none'
            });
          }
          const list = [];
          let sumPosition = 0;
          let sumDaily = 0;
          watchlist.forEach((w, i) => {
            const val = valuations[i];
            const shares = toNum(w.shares);
            const gsz = val ? toNum(val.gsz) : 0;
            const dwjz = val ? toNum(val.dwjz) : 0;
            const gszzl = val && val.gszzl != null ? toNum(val.gszzl) : null;
            // 持仓金额：优先用数据库保存值，无则用份额×估值
            const storedPositionAmount = w.position_amount != null && !Number.isNaN(Number(w.position_amount)) ? Number(w.position_amount) : null;
            const computedValue = shares && gsz ? shares * gsz : 0;
            const positionAmount = storedPositionAmount != null ? storedPositionAmount.toFixed(2) : (computedValue ? computedValue.toFixed(2) : '0.00');
            const positionAmountNum = Number(positionAmount);
            // 持有收益：优先用数据库保存值
            const storedHoldingProfit = w.holding_profit != null && !Number.isNaN(Number(w.holding_profit)) ? Number(w.holding_profit) : null;
            const holdingProfitNum = storedHoldingProfit;
            const holdingProfitDisplay = holdingProfitNum != null ? (holdingProfitNum >= 0 ? '+' : '') + holdingProfitNum.toFixed(2) : '-';
            const cost = positionAmountNum - holdingProfitNum;
            const holdingRateNum = positionAmountNum > 0 && holdingProfitNum != null && cost > 0
              ? Math.round((holdingProfitNum / cost) * 10000) / 100
              : null;
            const holdingRateDisplay = holdingRateNum != null ? (holdingRateNum >= 0 ? '+' : '') + holdingRateNum.toFixed(2) + '%' : '-';
            const dailyProfit = shares && gsz && dwjz ? ((shares * (gsz - dwjz))).toFixed(2) : null;
            const dailyRate = dwjz && gsz ? (((gsz - dwjz) / dwjz) * 100).toFixed(2) : null;
            const latestNav = gsz > 0 ? gsz.toFixed(4) : null;
            const yesterdayNav = dwjz > 0 ? dwjz : null;
            list.push({
              fundCode: w.fundCode,
              fundName: w.fundName,
              shares: shares,
              positionAmount,
              gszzl,
              latestNav,
              yesterdayNav,
              dailyProfit: dailyProfit != null ? Number(dailyProfit) : null,
              dailyRate: dailyRate != null ? Number(dailyRate) : null,
              holdingProfit: holdingProfitNum,
              holdingProfitDisplay,
              holdingRateNum,
              holdingRateDisplay,
            });
            sumPosition += positionAmountNum || computedValue;
            sumDaily += Number(dailyProfit || 0);
          });
          const totalDailyRate = sumPosition > 0 ? ((sumDaily / sumPosition) * 100).toFixed(2) : '0.00';
          const { sortBy, sortOrder } = this.data;
          const listToSet = this._applySort(list, sortBy, sortOrder);
          this.setData({
            list: listToSet,
            loading: false,
            accountAsset: sumPosition.toFixed(2),
            totalDailyProfit: sumDaily.toFixed(2),
            totalDailyRate,
          });
        });
      })
      .catch((err) => {
        if (this._unloaded) return;
        wx.showToast({ title: formatApiError(err && err.message), icon: 'none' });
        this.setData({ list: [], loading: false, accountAsset: '0.00', totalDailyProfit: '0.00', totalDailyRate: '0.00' });
      });
  },

  goAddHolding() {
    wx.navigateTo({
      url: '/pages/tiantian/add-holding/index',
      fail: () => wx.showToast({ title: '跳转失败', icon: 'none' }),
    });
  },

  goEditHolding(e) {
    const index = e.currentTarget.dataset.index;
    if (index == null || index === '') return;
    const list = this.data.list;
    const item = list[index];
    if (!item || !item.fundCode) return;
    wx.navigateTo({
      url: '/pages/tiantian/add-holding/index',
      success: (res) => {
        res.eventChannel.emit('holdingData', item);
      },
      fail: () => wx.showToast({ title: '跳转失败', icon: 'none' }),
    });
  },
});
