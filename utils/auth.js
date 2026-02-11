// 避免与 request.js 循环依赖：在 wxLoginSilent 内再 require

const KEY_TOKEN = 'fund_holding_token';
const KEY_USER = 'fund_holding_user';

function getToken() {
  try {
    return wx.getStorageSync(KEY_TOKEN) || '';
  } catch (e) {
    return '';
  }
}

function setToken(token) {
  try {
    wx.setStorageSync(KEY_TOKEN, token || '');
  } catch (e) {
    console.error('setToken error', e);
  }
}

function getUser() {
  try {
    const raw = wx.getStorageSync(KEY_USER);
    return raw || null;
  } catch (e) {
    return null;
  }
}

function setUser(user) {
  try {
    wx.setStorageSync(KEY_USER, user || null);
  } catch (e) {
    console.error('setUser error', e);
  }
}

function clearAuth() {
  setToken('');
  setUser(null);
}

/**
 * 静默登录：wx.login 取 code，请求后端 /auth/wx-login，存 token、user
 */
function wxLoginSilent() {
  const { request } = require('./request');
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        const code = res.code;
        if (!code) {
          reject(new Error('获取 code 失败'));
          return;
        }
        request({
          url: '/auth/wx-login',
          method: 'POST',
          data: { code },
          needAuth: false,
        })
          .then(data => {
            if (data && data.token) {
              setToken(data.token);
              setUser(data.user || {});
            }
            resolve(data);
          })
          .catch(reject);
      },
      fail: reject,
    });
  });
}

module.exports = {
  getToken,
  setToken,
  getUser,
  setUser,
  clearAuth,
  wxLoginSilent,
};
