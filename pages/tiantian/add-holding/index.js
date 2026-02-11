const { request } = require('../../../utils/request');
const { getRealtimeValuation } = require('../../../utils/fundApi');
const { formatApiError } = require('../../../utils/errorMsg');

// 数据校验：是否符合正常输入格式，排除乱码等
const VALID = {
  fundCode: /^\d{6}$/,
  positionAmount: /^\d+(\.\d{0,4})?$/, // 正数，最多4位小数，如 123 或 123.45
  holdingProfit: /^$|^-$|^-?(\d+(\.\d{0,4})?|\.\d{1,4})$/, // 空、单独的-、或合法数字（可负）
};
const POSITION_AMOUNT_MIN = 0.01;
const POSITION_AMOUNT_MAX = 999999999999.9999;
const HOLDING_PROFIT_MIN = -999999999999.9999;
const HOLDING_PROFIT_MAX = 999999999999.9999;

Page({
  data: {
    fundCode: '',
    fundName: '',
    addAmount: '',
    holdingProfit: '',
    currentNav: null,
    yesterdayNav: null,
    searchLoading: false,
    submitLoading: false,
    deleteLoading: false,
    isEditMode: false,
  },

  onLoad(options) {
    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (eventChannel) {
      eventChannel.on('holdingData', (item) => {
        if (!item || !item.fundCode) return;
        const holdingProfitStr = item.holdingProfit != null ? String(item.holdingProfit) : '';
        const yesterdayNav = item.yesterdayNav != null ? item.yesterdayNav : null;
        this.setData({
          fundCode: item.fundCode,
          fundName: item.fundName || item.fundCode,
          addAmount: item.positionAmount || '',
          holdingProfit: holdingProfitStr,
          yesterdayNav,
          currentNav: item.latestNav != null ? Number(item.latestNav) : null,
          isEditMode: true,
        });
        wx.setNavigationBarTitle({ title: '编辑持有' });
        if (yesterdayNav == null) {
          setTimeout(() => wx.showToast({ title: '请搜索刷新昨日净值', icon: 'none' }), 400);
        }
      });
    }
  },

  onSearchChange(e) {
    const raw = e.detail && typeof e.detail === 'object' && 'value' in e.detail ? e.detail.value : e.detail;
    const v = String(raw || '').replace(/\D/g, '').slice(0, 6);
    this.setData({ fundCode: v });
  },

  onSearchConfirm() {
    this.onSearch();
  },

  onAmountInput(e) {
    const raw = e.detail && typeof e.detail === 'object' && 'value' in e.detail ? e.detail.value : e.detail;
    this.setData({ addAmount: String(raw || '').trim() });
  },

  onHoldingProfitInput(e) {
    const raw = e.detail && typeof e.detail === 'object' && 'value' in e.detail ? e.detail.value : e.detail;
    let v = String(raw || '').trim();
    // 支持负收益：仅允许 -、数字、一个小数点
    let result = '';
    let hasMinus = false;
    let hasDecimal = false;
    for (let i = 0; i < v.length; i++) {
      const c = v[i];
      if (c === '-' && i === 0) {
        hasMinus = true;
        result += c;
      } else if (c === '.' && !hasDecimal) {
        hasDecimal = true;
        result += c;
      } else if (/\d/.test(c)) {
        result += c;
      }
    }
    this.setData({ holdingProfit: result });
  },

  onSearch() {
    const code = this.data.fundCode.trim();
    if (!code || code.length !== 6) {
      wx.showToast({ title: '请输入6位基金代码', icon: 'none' });
      return;
    }
    this.setData({ searchLoading: true });
    getRealtimeValuation(code)
      .then((data) => {
        const gsz = data.gsz != null ? Number(data.gsz) : null;
        const dwjz = data.dwjz != null ? Number(data.dwjz) : null;
        this.setData({
          fundName: data.name || data.fundcode || '',
          currentNav: gsz,
          yesterdayNav: dwjz,
          searchLoading: false,
        });
        wx.showToast({ title: '已带出名称与净值', icon: 'none' });
      })
      .catch(() => {
        this.setData({ searchLoading: false });
        wx.showToast({ title: '未查到该基金', icon: 'none' });
      });
  },

  onSubmit() {
    const { fundCode, fundName, addAmount, holdingProfit, yesterdayNav } = this.data;
    // 1. 基金代码：必须6位纯数字
    if (!VALID.fundCode.test(String(fundCode || '').trim())) {
      wx.showToast({ title: '请先输入6位基金代码并搜索', icon: 'none' });
      return;
    }
    // 2. 基金名称：搜索后自动带出，需非空且合理长度
    const fn = String(fundName || '').trim();
    if (!fn || fn.length > 128) {
      wx.showToast({ title: '请先搜索基金获取名称', icon: 'none' });
      return;
    }
    // 3. 持仓金额：正数，格式正确，范围合法
    const amtStr = String(addAmount || '').trim();
    if (!VALID.positionAmount.test(amtStr)) {
      wx.showToast({ title: '持仓金额格式有误，请输入有效数字', icon: 'none' });
      return;
    }
    const amount = Number(amtStr);
    if (amount < POSITION_AMOUNT_MIN || amount > POSITION_AMOUNT_MAX) {
      wx.showToast({ title: '持仓金额需在 0.01～999999999999 之间', icon: 'none' });
      return;
    }
    // 4. 持有收益：可为负，格式正确，范围合法
    const profitStr = String(holdingProfit || '').trim();
    if (!VALID.holdingProfit.test(profitStr)) {
      wx.showToast({ title: '持有收益格式有误，请输入有效数字', icon: 'none' });
      return;
    }
    const profitNum = profitStr === '' || profitStr === '-' ? 0 : Number(profitStr);
    const profit = Number.isNaN(profitNum) ? 0 : profitNum;
    if (profit < HOLDING_PROFIT_MIN || profit > HOLDING_PROFIT_MAX) {
      wx.showToast({ title: '持有收益超出合理范围', icon: 'none' });
      return;
    }
    // 5. 昨日净值：必须为正数
    const nav = Number(yesterdayNav);
    if (!yesterdayNav || Number.isNaN(nav) || nav <= 0) {
      wx.showToast({ title: '请先搜索基金获取昨日净值', icon: 'none' });
      return;
    }
    // 持有份额 = 持仓金额 / 昨日净值
    this.setData({ submitLoading: true });
    request({
      url: '/user/watchlist',
      method: 'POST',
      data: {
        fundCode: fundCode.trim(),
        fundName: fn,
        positionAmount: amount,
        holdingProfit: profit,
        yesterdayNav: nav,
      },
    })
      .then(() => {
        this.setData({ submitLoading: false });
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack({ fail: () => wx.showToast({ title: '已保存', icon: 'none' }) });
        }, 1500);
      })
      .catch((err) => {
        this.setData({ submitLoading: false });
        wx.showToast({ title: formatApiError(err && err.message), icon: 'none' });
      });
  },

  onDelete() {
    const { fundCode, fundName } = this.data;
    if (!fundCode) return;
    wx.showModal({
      title: '确认删除',
      content: `确定删除「${fundName || fundCode}」的持有记录？`,
      confirmText: '删除',
      confirmColor: '#e74c3c',
      fail: () => wx.showToast({ title: '操作已取消', icon: 'none' }),
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ deleteLoading: true });
        request({
          url: `/user/watchlist/${fundCode}`,
          method: 'DELETE',
        })
          .then(() => {
            this.setData({ deleteLoading: false });
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => wx.navigateBack({ fail: () => wx.showToast({ title: '已删除', icon: 'none' }) }), 800);
          })
          .catch((err) => {
            this.setData({ deleteLoading: false });
            wx.showToast({ title: formatApiError(err && err.message), icon: 'none' });
          });
      },
    });
  },
});
