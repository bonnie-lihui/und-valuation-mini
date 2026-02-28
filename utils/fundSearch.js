/**
 * 前端按名称搜基金（不依赖后端）
 * 数据来源：东方财富 fund.eastmoney.com 全量列表
 * 小程序需在后台将 https://fund.eastmoney.com 加入 request 合法域名
 */

const FUND_LIST_URL = 'https://fund.eastmoney.com/js/fundcode_search.js';

/** 内存缓存：[{ fundCode, fundName }] */
let cachedList = null;

/**
 * 拉取并解析全量基金列表
 * @returns {Promise<Array<{ fundCode: string, fundName: string }>>}
 */
function fetchFundList() {
  if (cachedList && cachedList.length > 0) {
    return Promise.resolve(cachedList);
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: FUND_LIST_URL,
      method: 'GET',
      timeout: 20000,
      success(res) {
        try {
          if (res.statusCode !== 200) {
            reject(new Error('拉取基金列表失败'));
            return;
          }
          let text = '';
          if (typeof res.data === 'string') {
            text = res.data;
          } else if (typeof res.data === 'object' && res.data !== null) {
            text = JSON.stringify(res.data);
          }
          if (!text) {
            reject(new Error('基金列表返回为空'));
            return;
          }
          const start = text.indexOf('[');
          const end = text.lastIndexOf(']') + 1;
          if (start === -1 || end <= start) {
            reject(new Error('基金列表格式异常'));
            return;
          }
          const arrStr = text.substring(start, end);
          const raw = JSON.parse(arrStr);
          if (!Array.isArray(raw)) {
            reject(new Error('基金列表格式异常'));
            return;
          }
          cachedList = raw.map((row) => {
            const code = Array.isArray(row) && row[0] != null ? String(row[0]).trim() : '';
            const name = Array.isArray(row) && row[2] != null ? String(row[2]).trim() : '';
            return { fundCode: code, fundName: name };
          }).filter((item) => item.fundCode.length === 6 && item.fundName);
          console.log('[基金列表] 从 JS 拉取并筛选后的条数:', cachedList.length);
          console.log('[基金列表] 前 5 条示例:', cachedList.slice(0, 5));
          resolve(cachedList);
        } catch (e) {
          console.error('fetchFundList parse error', e);
          reject(new Error('解析基金列表失败'));
        }
      },
      fail(err) {
        const msg = (err && (err.errMsg || err.message)) ? String(err.errMsg || err.message) : '网络异常';
        reject(new Error(msg));
      },
    });
  });
}

/** 清除缓存（用于失败后重试） */
function clearFundListCache() {
  cachedList = null;
}

// ====================== 名称清洗（OCR 失真后还原标准名称） ======================

/** 干扰词：OCR 常混入的表头、广告、按钮文案等，清洗时移除 */
const FUND_NAME_GARBAGE = [
  '金选指数基金', '金选 指数基金', '删除', '未匹配到基金', '将跳过',
  '市场解读', '有色金属大反攻', '行情能否延续', '持有金额', '昨日收益', '持有收益', '收益率',
];

/**
 * 深度清洗基金名称：去除干扰词、修复变形符号、移除开头多余括号
 * @param {string} rawName 原始识别名称（可能含合C、QDIILOFFOF、金选指数基金等）
 * @returns {string} 清洗后名称
 */
function cleanFundName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  let clean = rawName.trim();
  if (!clean) return '';

  // 1. 移除干扰词
  FUND_NAME_GARBAGE.forEach((word) => {
    clean = clean.replace(new RegExp(escapeRegExp(word), 'g'), '');
  });

  // 2. 修复变形的特殊符号（OCR 常把 QDII-LOF-FOF 识别成无横线）
  clean = clean.replace(/QDIIOFFOF/gi, 'QDII-LOF-FOF');
  clean = clean.replace(/QDIILOFFOF/gi, 'QDII-LOF-FOF');
  clean = clean.replace(/QDILOFFOF/gi, 'QDII-LOF-FOF');
  clean = clean.replace(/QDILOFFO/gi, 'QDII-LOF-FOF');

  // 3. 仅移除开头的括号块，不删括号后紧跟的字母（可能是份额后缀 A/C/E）
  clean = clean.replace(/^\([^)]*\)/, '');

  return clean.trim();
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ====================== 模糊匹配 + 代码兜底 ======================

/** 模糊匹配最低得分才返回（避免乱匹配） */
const FUZZY_MATCH_MIN_SCORE = 1;

/** 匹配度档位：用于展示「高/中/低」 */
function matchScoreLabel(score) {
  if (score === 'code') return '代码匹配';
  if (score >= 3) return '高';
  if (score >= 2) return '中';
  if (score >= 1) return '低';
  return '';
}

/**
 * 从名称或文本中提取 6 位基金代码（用于代码兜底）
 * @param {string} text 可能含代码的文本
 * @returns {string|null} 第一个出现的合法 6 位数字，否则 null
 */
function extractFundCode(text) {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(/\d{6}/);
  return m ? m[0] : null;
}

/**
 * 将中文名称切成可匹配的短词（2~4 字或数字段），便于「大成中证360互联网+大数据100」类长名匹配
 */
function tokenizeForMatch(name) {
  if (!name || typeof name !== 'string') return [];
  const s = name.replace(/\s+/g, '');
  const tokens = [];
  for (let i = 0; i < s.length; i++) {
    if (/\d/.test(s[i])) {
      let num = '';
      while (i < s.length && /\d/.test(s[i])) {
        num += s[i];
        i++;
      }
      i--;
      if (num.length >= 2) tokens.push(num);
    } else if (/[\u4e00-\u9fa5]/.test(s[i])) {
      const two = s.slice(i, i + 2);
      const three = s.slice(i, i + 3);
      if (two.length === 2) tokens.push(two);
      if (three.length === 3) tokens.push(three);
    } else if (/[A-Za-z+]/.test(s[i])) {
      let word = '';
      while (i < s.length && /[A-Za-z+]/.test(s[i])) {
        word += s[i];
        i++;
      }
      i--;
      if (word.length >= 2) tokens.push(word);
    }
  }
  return [...new Set(tokens)];
}

/**
 * 模糊匹配单只基金：仅当识别名与库名后缀一致（A/C/E）时才匹配，不跨后缀、不默认A类
 * 识别名无后缀时返回 null，提示用户手动选择份额类型
 */
function fuzzyMatchFund(cleanName, list) {
  if (!cleanName || !list || list.length === 0) return null;

  const cleanSuffix = cleanName.slice(-1).toUpperCase();
  const hasSuffix = ['A', 'C', 'E'].includes(cleanSuffix);
  if (!hasSuffix) {
    console.log('[基金匹配] 识别名无后缀(A/C/E)，不匹配，请手动选择份额:', cleanName);
    return null;
  }

  const cleanLower = cleanName.toLowerCase();
  const tokens = tokenizeForMatch(cleanName);
  const hasDistinct = /360|互联网|大数据|100|红利/.test(cleanName);

  let best = null;
  let maxScore = 0;

  for (let i = 0; i < list.length; i++) {
    const fund = list[i];
    const name = fund.fundName || '';
    if (!name) continue;
    const dbSuffix = name.slice(-1).toUpperCase();
    if (dbSuffix !== cleanSuffix) continue;

    const nameLower = name.toLowerCase();
    let score = 0;
    tokens.forEach((tk) => {
      if (tk.length >= 2 && nameLower.indexOf(tk.toLowerCase()) !== -1) score += 1;
    });
    if (hasDistinct) {
      if (/360/.test(cleanName) && /360/.test(name)) score += 3;
      if (/互联网/.test(cleanName) && /互联网/.test(name)) score += 2;
      if (/大数据/.test(cleanName) && /大数据/.test(name)) score += 2;
      if (/100/.test(cleanName) && /100/.test(name)) score += 1;
      if (/红利/.test(cleanName) && /红利/.test(name)) score += 2;
    }
    if (name.indexOf('黄金ETF') !== -1 && (cleanLower.indexOf('黄金') !== -1 || cleanLower.indexOf('etf') !== -1)) score += 2;
    if (name.indexOf('汇添富') !== -1 && cleanLower.indexOf('汇添富') !== -1) score += 2;
    if (name.indexOf('大成中证') !== -1 && cleanLower.indexOf('大成') !== -1) score += 1;
    if (name.indexOf('前海开源') !== -1 && cleanLower.indexOf('前海') !== -1) score += 2;
    if (name.indexOf('国泰') !== -1 && cleanLower.indexOf('国泰') !== -1) score += 1;

    if (score > maxScore) {
      maxScore = score;
      best = fund;
    } else if (score === maxScore && best && name.length > (best.fundName || '').length) {
      best = fund;
    }
  }

  if (maxScore >= FUZZY_MATCH_MIN_SCORE && best) {
    console.log('[基金匹配] 模糊匹配:', cleanName, '->', best.fundName, '得分', maxScore);
    return { fund: best, matchScore: maxScore };
  }

  const code = extractFundCode(cleanName);
  if (code) {
    const byCode = list.find((f) => f.fundCode === code);
    if (byCode && (byCode.fundName || '').slice(-1).toUpperCase() === cleanSuffix) {
      console.log('[基金匹配] 代码兜底:', code, '->', byCode.fundName);
      return { fund: byCode, matchScore: 'code' };
    }
  }
  return null;
}

/**
 * 按名称或关键词搜索基金（模糊匹配）
 * @param {string} keyword 基金名称或关键词
 * @param {number} limit 最多返回条数
 * @returns {Promise<Array<{ fundCode: string, fundName: string }>>}
 */
function searchByName(keyword, limit = 20) {
  const k = String(keyword || '').trim();
  if (!k) return Promise.resolve([]);

  return fetchFundList().then((list) => {
    const lower = k.toLowerCase();
    const filtered = list.filter((item) =>
      item.fundName && item.fundName.toLowerCase().indexOf(lower) !== -1
    );
    return filtered.slice(0, limit);
  });
}

/** 名称变体：标准名 + 去掉末尾单字母（OCR 常漏 A/B/C），便于匹配 */
function fundNameSearchVariants(name) {
  const out = [name];
  const trimmed = name && name.replace(/[A-Za-z]$/, '').trim();
  if (trimmed && trimmed.length >= 2 && trimmed !== name) {
    out.push(trimmed);
  }
  return out;
}

/**
 * 在 OCR 文本中按 6 位基金代码匹配（截图常有代码，比名称更稳）
 * @param {string} fullText 去空格后的整段 OCR 文本
 * @returns {Promise<Array<{ index: number, endIndex: number, fundCode: string, fundName: string }>>}
 */
function findAllFundMatchesByCodeInText(fullText) {
  const text = String(fullText || '');
  if (!text) return Promise.resolve([]);

  return fetchFundList().then((list) => {
    const codeSet = new Set(list.map((item) => item.fundCode));
    const codeToItem = {};
    list.forEach((item) => { codeToItem[item.fundCode] = item; });
    const ranges = [];
    const re = /\d{6}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const code = m[0];
      if (!codeSet.has(code)) continue;
      const start = m.index;
      const end = start + 6;
      ranges.push({
        index: start,
        endIndex: end,
        fundCode: code,
        fundName: (codeToItem[code] && codeToItem[code].fundName) || '',
      });
    }
    return ranges;
  });
}

/**
 * 在整段 OCR 文案中找出所有出现的基金及其位置（用于无换行时的多段解析）
 * 按名称长度从长到短匹配，重叠区间保留先匹配到的
 * @param {string} fullText OCR 识别出的整段文字
 * @returns {Promise<Array<{ index: number, endIndex: number, fundCode: string, fundName: string }>>}
 */
function findAllFundMatchesInText(fullText) {
  const text = String(fullText || '');
  if (!text) return Promise.resolve([]);

  return fetchFundList().then((list) => {
    const byLen = list.slice().sort((a, b) => (b.fundName.length - a.fundName.length));
    const ranges = [];

    function overlaps(start, end) {
      return ranges.some((r) => !(end <= r.index || start >= r.endIndex));
    }

    for (let i = 0; i < byLen.length; i++) {
      const item = byLen[i];
      const name = item.fundName;
      if (!name) continue;
      const patterns = fundNameSearchVariants(name);
      for (let p = 0; p < patterns.length; p++) {
        const pattern = patterns[p];
        if (!pattern) continue;
        let idx = 0;
        while (true) {
          const pos = text.indexOf(pattern, idx);
          if (pos === -1) break;
          const end = pos + pattern.length;
          if (!overlaps(pos, end)) {
            ranges.push({ index: pos, endIndex: end, fundCode: item.fundCode, fundName: item.fundName });
          }
          idx = pos + 1;
        }
      }
    }

    ranges.sort((a, b) => a.index - b.index);
    console.log('[基金匹配] 全文多段匹配到条数:', ranges.length, ranges);
    return ranges;
  });
}

/**
 * 根据名称匹配单只基金：先清洗名称 → 代码兜底 → 模糊匹配
 * @param {string} name 识别出的基金名称（可能含多余字符、变形符号）
 * @returns {Promise<{ fundCode: string, fundName: string, matchScore?: number|'code', matchScoreLabel?: string } | null>}
 */
function matchOneByName(name) {
  const raw = String(name || '').trim();
  if (!raw) return Promise.resolve(null);

  return fetchFundList().then((list) => {
    const cleanName = cleanFundName(raw);
    if (cleanName) {
      const result = fuzzyMatchFund(cleanName, list);
      if (result) {
        const { fund, matchScore } = result;
        return {
          fundCode: fund.fundCode,
          fundName: fund.fundName,
          matchScore,
          matchScoreLabel: matchScoreLabel(matchScore),
        };
      }
    }
    // 未清洗出有效名或模糊匹配失败时，仍尝试一次「原始名包含/被包含」兜底
    const exact = list.find((item) => item.fundName === raw);
    if (exact) return { fundCode: exact.fundCode, fundName: exact.fundName, matchScore: 3, matchScoreLabel: '高' };
    const contains = list.filter(
      (item) => raw.indexOf(item.fundName) !== -1 || item.fundName.indexOf(raw) !== -1
    );
    if (contains.length > 0) {
      contains.sort((a, b) => b.fundName.length - a.fundName.length);
      const match = contains[0];
      return { fundCode: match.fundCode, fundName: match.fundName, matchScore: 2, matchScoreLabel: '中' };
    }
    console.log('[基金匹配] 未匹配:', raw, '清洗后:', cleanName);
    return null;
  });
}

module.exports = {
  fetchFundList,
  searchByName,
  matchOneByName,
  cleanFundName,
  fuzzyMatchFund,
  extractFundCode,
  matchScoreLabel,
  findAllFundMatchesInText,
  findAllFundMatchesByCodeInText,
  clearFundListCache,
};
