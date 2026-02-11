/**
 * 估值接口（天天/东方财富公开数据）
 * 合规：数据仅供个人参考，不构成任何投资建议；请控制请求频率。
 * 小程序正式版仅支持 https，需在后台将 fundgz.1234567.com.cn 加入 request 合法域名；
 * 若该接口仅支持 http，请使用自家后端代理并在此处改为代理地址。
 */

/** 开发期间为 true：不走接口，用本地模拟；上线前改为 false */
const USE_MOCK = false;

const REALTIME_BASE = 'https://fundgz.1234567.com.cn';

/** 本地写死数据（开发用） */
const MOCK_LIST = [
  { fundcode: '005827', name: '易方达蓝筹精选混合', jzrq: '2026-01-30', dwjz: '2.1234', gsz: '2.1312', gszzl: 0.42, gztime: '15:00' },
  { fundcode: '260108', name: '景顺长城新兴成长混合', jzrq: '2026-01-30', dwjz: '1.5678', gsz: '1.5651', gszzl: -0.18, gztime: '15:00' },
  { fundcode: '003359', name: '大成360互联网+大数据100C', jzrq: '2026-01-30', dwjz: '1.2345', gsz: '1.2442', gszzl: 0.79, gztime: '15:00' },
  { fundcode: '021740', name: '前海开源黄金ETF联接C', jzrq: '2026-01-30', dwjz: '0.9876', gsz: '0.9248', gszzl: -6.36, gztime: '15:30' }
];

function getMockValuation(fundCode) {
  try {
    const code = String(fundCode).trim();
    const hit = MOCK_LIST.find(item => item.fundcode === code);
    if (hit) return Promise.resolve({ ...hit });
    return Promise.reject(new Error('未查到'));
  } catch (e) {
    console.error('getMockValuation error', e);
    return Promise.reject(new Error('解析失败'));
  }
}

/**
 * 获取单只实时估值（估算净值、估算涨幅）
 * @param {string} fundCode 代码，如 '000001'
 * @returns {Promise<Object>} { fundcode, name, jzrq, dwjz, gsz, gszzl, gztime }
 */
function getRealtimeValuation(fundCode) {
  if (USE_MOCK) {
    return getMockValuation(fundCode);
  }

  const url = `${REALTIME_BASE}/js/${fundCode}.js?rt=${Date.now()}`;
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      timeout: 10000,
      success(res) {
        try {
          if (res.statusCode === 404) {
            reject(new Error('未查到'));
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error('网络异常'));
            return;
          }
          const text = typeof res.data === 'string' ? res.data : '';
          const match = text.match(/^jsonpgz\((.*)\);?\s*$/s);
          if (!match) {
            reject(new Error('数据格式异常'));
            return;
          }
          const data = JSON.parse(match[1]);
          if (data.fundcode == null || data.fundcode === '') {
            reject(new Error('未查到'));
            return;
          }
          resolve({
            fundcode: data.fundcode,
            name: data.name,
            jzrq: data.jzrq,
            dwjz: data.dwjz,
            gsz: data.gsz,
            gszzl: data.gszzl,
            gztime: data.gztime
          });
        } catch (e) {
          console.error('getRealtimeValuation parse error', e);
          reject(new Error('解析失败'));
        }
      },
      fail(err) {
        try {
          const msg = (err && (err.message || err.errMsg)) ? String(err.message || err.errMsg) : '请求失败';
          reject(new Error(msg));
        } catch (e) {
          console.error('getRealtimeValuation fail error', e);
          reject(new Error('请求失败'));
        }
      }
    });
  });
}

module.exports = {
  getRealtimeValuation,
  USE_MOCK
};
