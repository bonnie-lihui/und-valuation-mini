const { request } = require('../../../utils/request');
const { getRealtimeValuation } = require('../../../utils/fundApi');
const { formatApiError } = require('../../../utils/errorMsg');
const { fetchFundList, clearFundListCache, matchOneByName, cleanFundName } = require('../../../utils/fundSearch');
const { recognizeFundImage, checkVisionKitSupport } = require('../../../utils/fundOcr');

/** 用于 VisionKit 取像素的 canvas-id（兼容基础库 2.27.0） */
const OCR_CANVAS_ID = 'ocrCanvasLegacy';

Page({
  data: {
    step: 'choose',
    imageList: [],
    parsedList: [],
    summary: {},
    fundListReady: false,
    fundListError: '',
    ocrRawText: '',
    ocrNoMatch: false,
    visionKitSupported: true,
    canvasW: 800,
    canvasH: 600,
    inputCodeIndex: null,
    inputCodeValue: '',
  },

  onLoad() {
    const support = checkVisionKitSupport();
    if (!support.supported) {
      this.setData({ visionKitSupported: false });
      wx.showToast({ title: support.message || '请更新微信后使用识别功能', icon: 'none', duration: 3000 });
    }
    wx.showLoading({ title: '加载基金列表中...', mask: true });
    fetchFundList()
      .then(() => {
        wx.hideLoading();
        this.setData({ fundListReady: true, fundListError: '' });
      })
      .catch((e) => {
        wx.hideLoading();
        const msg = (e && e.message) ? e.message : '加载失败';
        this.setData({ fundListReady: false, fundListError: msg });
        wx.showToast({
          title: '基金列表加载失败，请检查网络或在小程序后台将 fund.eastmoney.com 加入 request 合法域名',
          icon: 'none',
          duration: 3500,
        });
      });
  },

  onRetryFundList() {
    if (this.data.fundListReady) return;
    clearFundListCache();
    wx.showLoading({ title: '加载中...', mask: true });
    fetchFundList()
      .then(() => {
        wx.hideLoading();
        this.setData({ fundListReady: true, fundListError: '' });
        wx.showToast({ title: '基金列表加载成功', icon: 'success' });
      })
      .catch((e) => {
        wx.hideLoading();
        const msg = (e && e.message) ? e.message : '加载失败';
        this.setData({ fundListReady: false, fundListError: msg });
        wx.showToast({ title: msg + '，请检查 request 合法域名', icon: 'none', duration: 3000 });
      });
  },

  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const path = (res.tempFiles && res.tempFiles[0]) ? res.tempFiles[0].tempFilePath : '';
        if (path) {
          this.setData({ imageList: [path] });
          this.startOCR(path);
        }
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: err.errMsg || '选择失败', icon: 'none' });
        }
      },
    });
  },

  onRemoveImage(e) {
    const { index } = e.currentTarget.dataset;
    const imageList = this.data.imageList.filter((_, i) => i !== index);
    this.setData({ imageList });
  },

  onRemoveParsed(e) {
    const { index } = e.currentTarget.dataset;
    const parsedList = this.data.parsedList.filter((_, i) => i !== index);
    this.setData({ parsedList });
  },

  onBackToChoose() {
    this.setData({ step: 'choose', imageList: [], parsedList: [], summary: {}, ocrRawText: '', ocrNoMatch: false });
  },

  /**
   * 选图后自动调用，或点击「重新识别」时调用（纯前端 VisionKit OCR，无次数限制）
   */
  startOCR(imgPath) {
    if (!this.data.fundListReady) {
      wx.showToast({ title: '基金列表未就绪，请稍后或检查网络', icon: 'none' });
      return;
    }
    if (!this.data.visionKitSupported) {
      wx.showToast({ title: '当前微信版本不支持识别，请更新后重试', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '识别基金信息中...', mask: true });

    const opts = { pageContext: this, canvasId: OCR_CANVAS_ID };
    recognizeFundImage(imgPath, opts)
      .then(({ fundList }) => {
        if (!fundList || fundList.length === 0) {
          wx.hideLoading();
          this.setData({ ocrRawText: '', ocrNoMatch: true });
          wx.showToast({ title: '未识别到有效基金数据', icon: 'none' });
          return;
        }
        return Promise.all(
          fundList.map((fund) =>
            matchOneByName(fund.name).then((m) => ({
              name: fund.name,
              fundCode: m ? m.fundCode : '',
              fundName: m ? m.fundName : fund.name,
              rawName: fund.name,
              matchScore: m ? m.matchScore : null,
              matchDegree: m ? m.matchScoreLabel : '',
              holdAmount: fund.holdAmount,
              holdProfit: fund.holdProfit,
              isAbnormal: fund.isAbnormal,
              positionAmount: parseFloat(String(fund.holdAmount || '0').replace(/,/g, ''), 10) || 0,
              holdingProfit: parseFloat(String(fund.holdProfit || '0').replace(/,/g, ''), 10) || 0,
            }))
          )
        ).then((parsedList) => {
          const total = parsedList.length;
          const isValid = (item) => {
            if (item.isAbnormal) return false;
            if (!item.fundCode) return false;
            const score = item.matchScore;
            if (score === 'code') return true;
            if (typeof score === 'number' && score >= 3) return true;
            return false;
          };
          const validList = [];
          parsedList.forEach((item) => {
            if (isValid(item)) {
              validList.push(item);
            } else {
              let reason = '未匹配';
              if (item.isAbnormal) reason = '字段异常';
              else if (!item.fundCode) reason = '未匹配';
              else if (item.matchScore !== 'code' && (typeof item.matchScore !== 'number' || item.matchScore < 3)) reason = '匹配度低(＜90%)';
              console.log('[丢弃] 名称：' + (item.rawName || item.name) + '，持有金额：' + (item.holdAmount || '') + '，原因：' + reason);
            }
          });
          const discardCount = total - validList.length;
          wx.hideLoading();
          if (validList.length > 0) {
            wx.showToast({ title: '成功识别' + validList.length + '条，失败' + discardCount + '条', icon: 'none' });
            this.setData({ step: 'confirm', parsedList: validList, summary: {}, ocrRawText: '', ocrNoMatch: false });
          } else {
            wx.showToast({ title: '成功识别0条，失败' + total + '条', icon: 'none' });
            this.setData({ step: 'choose', parsedList: [], summary: {}, ocrRawText: '', ocrNoMatch: true });
          }
        });
      })
      .catch((err) => {
        wx.hideLoading();
        const msg = (err && err.message) ? err.message : '识别失败';
        this.setData({ ocrNoMatch: true });
        wx.showToast({ title: msg, icon: 'none' });
      });
  },

  onReRecognize() {
    if (this.data.imageList.length === 0) return;
    this.startOCR(this.data.imageList[0]);
  },

  /** 未匹配项：打开输入代码弹层 */
  onOpenCodeInput(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ inputCodeIndex: index, inputCodeValue: '' });
  },

  onCodeInput(e) {
    this.setData({ inputCodeValue: (e.detail && e.detail.value) || '' });
  },

  onCancelCodeInput() {
    this.setData({ inputCodeIndex: null, inputCodeValue: '' });
  },

  onConfirmCodeInput() {
    const { inputCodeIndex, inputCodeValue, parsedList } = this.data;
    if (inputCodeIndex == null || !parsedList || !parsedList[inputCodeIndex]) {
      this.setData({ inputCodeIndex: null, inputCodeValue: '' });
      return;
    }
    const code = String(inputCodeValue || '').trim().replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      wx.showToast({ title: '请输入6位基金代码', icon: 'none' });
      return;
    }
    fetchFundList()
      .then((list) => {
        const fund = list.find((f) => f.fundCode === code);
        if (!fund) {
          wx.showToast({ title: '未找到该代码的基金', icon: 'none' });
          return;
        }
        const next = parsedList.slice();
        next[inputCodeIndex] = {
          ...next[inputCodeIndex],
          fundCode: fund.fundCode,
          fundName: fund.fundName,
          matchScoreLabel: '代码匹配',
        };
        this.setData({ parsedList: next, inputCodeIndex: null, inputCodeValue: '' });
        wx.showToast({ title: '已匹配：' + fund.fundName, icon: 'none' });
      })
      .catch(() => {
        wx.showToast({ title: '基金列表加载失败', icon: 'none' });
      });
  },

  onConfirmSubmit() {
    const list = this.data.parsedList.filter((item) => item.fundCode && item.positionAmount > 0);
    if (list.length === 0) {
      wx.showToast({ title: '没有可添加的项', icon: 'none' });
      return;
    }
    const total = list.length;
    console.log('[确认添加] 开始，共', total, '条', list.map((i) => ({ fundCode: i.fundCode, fundName: i.fundName, positionAmount: i.positionAmount })));
    wx.showLoading({ title: '添加中...', mask: true });
    const errors = [];

    const run = (index) => {
      if (index >= list.length) {
        wx.hideLoading();
        console.log('[确认添加] 结束，成功', total - errors.length, '条，失败', errors.length, '条', errors.length ? errors : '');
        if (errors.length > 0) {
          const names = errors.map((e) => e.name).join('、');
          wx.showToast({
            title: `成功 ${total - errors.length} 条，失败 ${errors.length} 条`,
            icon: 'none',
            duration: errors.length > 0 ? 3500 : 2000,
          });
          if (names) console.log('[添加失败]', names, errors.map((e) => e.reason));
        } else {
          wx.showToast({ title: '添加成功', icon: 'success' });
        }
        wx.switchTab({ url: '/pages/tiantian/holdings/index', fail: () => wx.navigateBack({ fail: () => {} }) });
        return;
      }
      const item = list[index];
      const seq = index + 1;
      console.log('[确认添加]', `第${seq}/${total}条 开始`, item.fundCode, item.fundName || item.rawName);

      const advance = (errReason) => {
        try {
          if (errReason) {
            errors.push({ name: item.fundName || item.fundCode, reason: errReason });
            console.log('[确认添加]', `第${seq}/${total}条 失败`, errReason);
          } else {
            console.log('[确认添加]', `第${seq}/${total}条 成功`);
          }
          run(index + 1);
        } catch (e) {
          console.error('[确认添加] advance error', e);
          run(index + 1);
        }
      };

      console.log('[确认添加]', `第${seq}/${total}条 请求估值 getRealtimeValuation(${item.fundCode})`);
      getRealtimeValuation(item.fundCode)
        .then((val) => {
          const yesterdayNav = val && val.dwjz != null ? Number(val.dwjz) : null;
          console.log('[确认添加]', `第${seq}/${total}条 估值返回`, { dwjz: val && val.dwjz, yesterdayNav });
          if (!yesterdayNav || yesterdayNav <= 0) {
            advance('noNav');
            return;
          }
          const postData = {
            fundCode: item.fundCode,
            fundName: item.fundName || item.rawName,
            positionAmount: item.positionAmount,
            holdingProfit: item.holdingProfit || 0,
            yesterdayNav,
          };
          console.log('[确认添加]', `第${seq}/${total}条 请求添加 POST /user/watchlist`, postData);
          request({
            url: '/user/watchlist',
            method: 'POST',
            data: postData,
          })
            .then(() => {
              console.log('[确认添加]', `第${seq}/${total}条 POST /user/watchlist 成功`);
              advance(null);
            })
            .catch((err) => {
              console.log('[确认添加]', `第${seq}/${total}条 POST /user/watchlist 失败`, err && err.message);
              advance('api');
            });
        })
        .catch((err) => {
          console.log('[确认添加]', `第${seq}/${total}条 getRealtimeValuation 失败`, err && err.message);
          advance('noNav');
        });
    };
    run(0);
  },
});
