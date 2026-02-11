const { BASE_URL } = require('./config');

function getToken() {
  try {
    return wx.getStorageSync('fund_holding_token') || '';
  } catch (e) {
    return '';
  }
}

function request(options) {
  const { url, method = 'GET', data = {}, needAuth = true, _noAuthRetry } = options;
  const fullUrl = url.startsWith('http') ? url : BASE_URL + url;
  const header = { 'Content-Type': 'application/json' };
  if (needAuth) {
    const token = getToken();
    if (token) header['Authorization'] = 'Bearer ' + token;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: fullUrl,
      method,
      data,
      header,
      success(res) {
        if (res.statusCode === 401 && !_noAuthRetry) {
          const auth = require('./auth');
          auth.clearAuth();
          auth.wxLoginSilent()
            .then(() => request({ ...options, _noAuthRetry: true }).then(resolve).catch(reject))
            .catch(reject);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const body = res.data;
          if (body && body.ec === 200) {
            resolve(body.data);
          } else {
            reject(new Error((body && body.em) || '请求失败'));
          }
        } else {
          // 4xx/5xx 时优先使用后端返回的 em，否则用通用提示
          const body = res.data;
          const msg = body && typeof body.em === 'string' ? body.em : '网络异常';
          reject(new Error(msg));
        }
      },
      fail(err) {
        const msg = (err && (err.message || err.errMsg)) ? String(err.message || err.errMsg) : '网络异常，请稍后重试';
        reject(new Error(msg));
      },
    });
  });
}

module.exports = { request };
