/**
 * 后端/网络错误转用户可读提示（图四：前后端交互优化）
 * - 后端 em 技术用语映射为友好文案
 * - 网络类错误（超时、连接失败）与业务错误区分提示
 */
const BACKEND_EM_MAP = {
  'fundCode 需为6位数字': '请输入6位基金代码',
  'fundName 格式异常': '基金名称格式异常',
  'positionAmount 格式有误': '持仓金额格式有误，请输入有效数字',
  'positionAmount 超出合理范围': '持仓金额超出合理范围',
  'holdingProfit 格式有误': '持有收益格式有误，请输入有效数字',
  'holdingProfit 超出合理范围': '持有收益超出合理范围',
  'yesterdayNav 需为有效正数': '请先搜索基金获取昨日净值',
  'code 必填': '登录参数异常',
  '登录错误': '登录失败，请重试',
  '登录已过期，请重新打开': '登录已过期，请重新打开',
  'Token verification failed': '登录已过期，请重新打开',
  '取消持有失败': '删除失败，请稍后重试',
  '添加失败': '保存失败，请稍后重试',
  '获取失败': '加载失败，请稍后重试',
  '服务器异常，请稍后重试': '服务器异常，请稍后重试',
};

function formatApiError(msg) {
  if (!msg || typeof msg !== 'string') return '操作失败，请稍后重试';
  const trimmed = msg.trim();
  if (BACKEND_EM_MAP[trimmed]) return BACKEND_EM_MAP[trimmed];
  if (trimmed.indexOf('timeout') !== -1 || trimmed.indexOf('超时') !== -1) {
    return '网络超时，请检查网络后重试';
  }
  if (trimmed.indexOf('request:fail') !== -1 || trimmed.indexOf('request fail') !== -1) {
    return '网络异常，请检查连接后重试';
  }
  return trimmed || '操作失败，请稍后重试';
}

module.exports = { formatApiError };
