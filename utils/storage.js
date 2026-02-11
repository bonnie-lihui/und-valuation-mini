/**
 * 本地存储 key 与读写
 * 关注列表：仅存代码数组
 * 估值缓存：接口成功时写入，请求失败时用于展示，避免「未查到」闪屏
 */
const KEY_FUND_LIST = 'fund_watch_list';
const KEY_FUND_CACHE = 'fund_data_cache';
const MAX_FUND_COUNT = 20;

function getFundList() {
  try {
    const raw = wx.getStorageSync(KEY_FUND_LIST);
    if (raw && Array.isArray(raw)) return raw;
  } catch (e) {
    console.error('getFundList error', e);
  }
  return [];
}

function setFundList(list) {
  if (!Array.isArray(list)) return;
  try {
    wx.setStorageSync(KEY_FUND_LIST, list);
  } catch (e) {
    console.error('setFundList error', e);
  }
}

function addFundCode(code) {
  try {
    const list = getFundList();
    const trim = String(code).trim().replace(/\D/g, '');
    if (!trim || trim.length !== 6 || list.includes(trim)) return false;
    if (list.length >= MAX_FUND_COUNT) return false;
    list.push(trim);
    setFundList(list);
    return true;
  } catch (e) {
    console.error('addFundCode error', e);
    return false;
  }
}

function removeFundCode(code) {
  try {
    const trim = String(code).trim();
    const list = getFundList().filter(c => c !== trim);
    setFundList(list);
    const cache = getFundCache();
    if (cache && typeof cache === 'object') {
      delete cache[trim];
      try {
        wx.setStorageSync(KEY_FUND_CACHE, cache);
      } catch (e) {
        console.error('setFundCache error', e);
      }
    }
  } catch (e) {
    console.error('removeFundCode error', e);
  }
}

function getFundCache() {
  try {
    const raw = wx.getStorageSync(KEY_FUND_CACHE);
    if (raw && typeof raw === 'object') return raw;
  } catch (e) {
    console.error('getFundCache error', e);
  }
  return {};
}

function setFundCacheEntry(code, data) {
  if (!code || !data) return;
  try {
    const key = String(code).trim();
    const cache = getFundCache();
    let gszzl = null;
    if (data.gszzl != null) {
      const n = parseFloat(data.gszzl);
      gszzl = Number.isNaN(n) ? null : n;
    }
    cache[key] = {
      name: data.name != null ? String(data.name) : '',
      gszzl: gszzl,
      gztime: data.gztime != null ? String(data.gztime) : ''
    };
    wx.setStorageSync(KEY_FUND_CACHE, cache);
  } catch (e) {
    console.error('setFundCacheEntry error', e);
  }
}

/** 一键清空关注列表与估值缓存，弹窗确认后再调用 */
function clearAllFundData() {
  try {
    setFundList([]);
    wx.setStorageSync(KEY_FUND_CACHE, {});
  } catch (e) {
    console.error('clearAllFundData error', e);
    throw e;
  }
}

module.exports = {
  KEY_FUND_LIST,
  KEY_FUND_CACHE,
  MAX_FUND_COUNT,
  getFundList,
  setFundList,
  addFundCode,
  removeFundCode,
  getFundCache,
  setFundCacheEntry,
  clearAllFundData
};
