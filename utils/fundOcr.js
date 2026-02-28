/**
 * 基金截图 OCR 识别工具（纯前端 VisionKit，无调用次数限制）
 *
 * 【无次数限制的核心实现点】
 * 使用微信 VisionKit（wx.createVKSession + runOCR），识别在用户设备本地完成，不经过云端，
 * 无任何每日额度限制。与「微信服务市场 OCR」的云端接口（如 100 次/日）完全不同。
 *
 * 模块划分：
 * 模块1 - 图片预处理：压缩、灰度化、可选区域裁剪
 * 模块2 - VisionKit OCR 调用：创建会话、识别、资源释放
 * 模块3 - 文本深度清洗：乱码过滤、干扰项移除、数字修复
 * 模块4 - 通用化解析：以收益率%为锚点锁定行、按格式从右向左拆字段，无基金名预设；输出含 isComplete/isReasonable
 * 模块5 - 数据汇总与异常处理
 *
 * 使用方式：require 后调用 recognizeFundImage(图片路径, { pageContext, canvasId })，
 * 返回 Promise<{ fundList, summary }>。低版本基础库需在页面提供 canvas 并传入 pageContext、canvasId。
 */

const VISION_KIT_MIN_VERSION = '2.27.0';
const MAX_IMAGE_WIDTH = 800;
const COMPRESS_QUALITY = 0.8;
/** 可选：识别区域为图片中间 80%（避开状态栏/导航栏） */
const USE_MIDDLE_REGION = true;
const MIDDLE_REGION_TOP = 0.1;
const MIDDLE_REGION_HEIGHT = 0.8;

/** 通用干扰词：仅表头/广告等非金融内容，不包含任何基金名称或特征词 */
const UNIVERSAL_NOISE = [
  '市场解读', '行情能否延续', '持有收益率排序', '我的持有', '全部偏股', '偏债指数',
  '金选指数基金', '金额/昨日', '持有收益/率', '名称', '查看更多', '涨跌幅', '今日',
];

// ====================== 模块5（部分前置）：基础库与版本检查 ======================

/**
 * 检测当前基础库是否支持 VisionKit OCR（2.27.0+）
 * @returns {{ supported: boolean, message?: string }}
 */
function checkVisionKitSupport() {
  if (typeof wx.createVKSession !== 'function') {
    return { supported: false, message: '当前微信版本不支持识别，请升级至最新版微信（需基础库 2.27.0+）' };
  }
  const sys = wx.getSystemInfoSync();
  const sdkVersion = (sys && sys.SDKVersion) ? String(sys.SDKVersion) : '0.0.0';
  const compare = compareVersion(sdkVersion, VISION_KIT_MIN_VERSION);
  if (compare < 0) {
    return { supported: false, message: `当前基础库 ${sdkVersion} 低于 2.27.0，请更新微信后重试` };
  }
  return { supported: true };
}

function compareVersion(a, b) {
  const arrA = a.split('.').map((n) => parseInt(n, 10) || 0);
  const arrB = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(arrA.length, arrB.length); i++) {
    const vA = arrA[i] || 0;
    const vB = arrB[i] || 0;
    if (vA > vB) return 1;
    if (vA < vB) return -1;
  }
  return 0;
}

// ====================== 模块1：图片预处理（压缩 + 灰度化 + 区域裁剪） ======================

/**
 * 图片压缩：强制宽度不超过 MAX_IMAGE_WIDTH，等比缩放，导出时质量 COMPRESS_QUALITY
 * 真机离屏 Canvas 无 toTempFilePath，需页面 canvas 时传入 pageContext、canvasId
 */
function compressImage(tempFilePath, options) {
  return new Promise((resolve, reject) => {
    console.log('[基金OCR] 模块1: 获取图片信息...');
    wx.getImageInfo({
      src: tempFilePath,
      success: (imgInfo) => {
        let width = imgInfo.width || 1;
        let height = imgInfo.height || 1;
        const path = imgInfo.path || tempFilePath;
        if (width > MAX_IMAGE_WIDTH) {
          height = Math.round(height * (MAX_IMAGE_WIDTH / width));
          width = MAX_IMAGE_WIDTH;
        }
        console.log('[基金OCR] 模块1: 压缩目标尺寸', width, 'x', height);

        if (options && options.pageContext && options.canvasId) {
          const that = options.pageContext;
          let done = false;
          const finish = (result) => {
            if (done) return;
            done = true;
            resolve(result);
          };
          setTimeout(() => {
            if (!done) {
              console.warn('[基金OCR] 模块1: 压缩超时(4s)，使用原图');
              finish({ tempFilePath: path, width, height });
            }
          }, 4000);
          that.setData({ canvasW: width, canvasH: height }, () => {
            const ctx = wx.createCanvasContext(options.canvasId, that);
            ctx.drawImage(path, 0, 0, width, height);
            ctx.draw(false, () => {
              wx.canvasToTempFilePath({
                canvasId: options.canvasId,
                destWidth: width,
                destHeight: height,
                fileType: 'jpg',
                quality: COMPRESS_QUALITY,
                success: (res) => {
                  console.log('[基金OCR] 模块1: 压缩完成');
                  finish({ tempFilePath: res.tempFilePath, width, height });
                },
                fail: (err) => {
                  console.warn('[基金OCR] 模块1: canvasToTempFilePath 失败，使用原图', err);
                  finish({ tempFilePath: path, width, height });
                },
              }, that);
            });
          });
        } else {
          resolve({ tempFilePath: path, width, height });
        }
      },
      fail: (err) => reject(new Error(err.errMsg || '获取图片信息失败')),
    });
  });
}

/**
 * 获取图片像素数据（RGBA ArrayBuffer），并做灰度化、可选区域裁剪（中间 80%）
 * VisionKit runOCR 需要 frameBuffer + width + height；灰度化提升文字对比度、减少乱码
 */
function getImageFrameBuffer(tempFilePath, width, height, options) {
  return new Promise((resolve, reject) => {
    console.log('[基金OCR] 模块1: 获取像素数据（灰度化 + 区域裁剪）...');
    wx.getImageInfo({
      src: tempFilePath,
      success: (imgInfo) => {
        const w = width || imgInfo.width || 1;
        const h = height || imgInfo.height || 1;
        const path = imgInfo.path || tempFilePath;
        let cropX = 0;
        let cropY = 0;
        let cropW = w;
        let cropH = h;
        if (USE_MIDDLE_REGION && cropH > 20) {
          cropY = Math.floor(cropH * MIDDLE_REGION_TOP);
          cropH = Math.floor(cropH * MIDDLE_REGION_HEIGHT);
          if (cropH < 1) cropH = h;
          console.log('[基金OCR] 模块1: 区域裁剪 中间80%', cropY, cropH);
        }

        const tryOffscreen = () => {
          try {
            const canvas = wx.createOffscreenCanvas && wx.createOffscreenCanvas({ type: '2d', width: cropW, height: cropH });
            if (!canvas || !canvas.getContext) return false;
            const ctx = canvas.getContext('2d');
            const img = canvas.createImage && canvas.createImage();
            if (!img) return false;
            img.onload = () => {
              ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
              const imageData = ctx.getImageData && ctx.getImageData(0, 0, cropW, cropH);
              if (!imageData || !imageData.data) {
                reject(new Error('离屏画布无法获取像素数据'));
                return;
              }
              const data = imageData.data;
              // 灰度化：R=G=B=gray，提升对比度、减少乱码
              for (let i = 0; i < data.length; i += 4) {
                const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
              }
              const expectedLen = cropW * cropH * 4;
              const buffer = data.buffer.byteLength === expectedLen
                ? data.buffer
                : data.buffer.slice(data.byteOffset, data.byteOffset + expectedLen);
              console.log('[基金OCR] 模块1: 像素就绪(离屏)', cropW, 'x', cropH);
              resolve({ frameBuffer: buffer, width: cropW, height: cropH });
            };
            img.onerror = () => reject(new Error('离屏画布绘制失败'));
            img.src = path;
            return true;
          } catch (e) {
            return false;
          }
        };

        if (tryOffscreen()) return;

        if (options && options.pageContext && options.canvasId) {
          const that = options.pageContext;
          console.log('[基金OCR] 模块1: 使用页面 canvas 取像素...');
          let done = false;
          const finish = (err, result) => {
            if (done) return;
            done = true;
            if (err) reject(err);
            else resolve(result);
          };
          setTimeout(() => {
            if (!done) finish(new Error('获取画布像素超时，请重试'), null);
          }, 6000);
          that.setData({ canvasW: w, canvasH: h }, () => {
            const ctx = wx.createCanvasContext(options.canvasId, that);
            ctx.drawImage(path, 0, 0, w, h);
            ctx.draw(false, () => {
              setTimeout(() => {
                wx.canvasGetImageData({
                  canvasId: options.canvasId,
                  x: cropX,
                  y: cropY,
                  width: cropW,
                  height: cropH,
                  success: (res) => {
                    const raw = res.data;
                    const pixels = raw instanceof Uint8ClampedArray ? raw : new Uint8ClampedArray(raw && raw.buffer ? raw : []);
                    const expectedLen = cropW * cropH * 4;
                    for (let i = 0; i < pixels.length; i += 4) {
                      const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
                      pixels[i] = gray;
                      pixels[i + 1] = gray;
                      pixels[i + 2] = gray;
                    }
                    const buffer = pixels.buffer.byteLength >= expectedLen
                      ? pixels.buffer.slice(pixels.byteOffset, pixels.byteOffset + expectedLen)
                      : pixels.buffer;
                    console.log('[基金OCR] 模块1: 像素就绪(页面canvas)', cropW, 'x', cropH);
                    finish(null, { frameBuffer: buffer, width: cropW, height: cropH });
                  },
                  fail: (err) => finish(new Error(err.errMsg || '获取画布像素失败'), null),
                }, that);
              }, 800);
            });
          });
        } else {
          reject(new Error('当前环境无法获取像素数据，请在页面中提供 canvas 并传入 pageContext、canvasId'));
        }
      },
      fail: (err) => reject(new Error(err.errMsg || '获取图片信息失败')),
    });
  });
}

// ====================== 模块2：VisionKit OCR 调用 ======================

/**
 * 【无次数限制】调用 VisionKit 端侧 OCR，结果在本地返回
 * 创建 VKSession(mode=2 静态图)、runOCR、识别完成后立即 destroy 避免内存泄漏
 */
function runVisionKitOcr(frameBuffer, width, height) {
  return new Promise((resolve, reject) => {
    try {
      console.log('[基金OCR] 模块2: VisionKit OCR 准备...');
      const expectedBytes = width * height * 4;
      const buf = frameBuffer instanceof ArrayBuffer ? frameBuffer : (frameBuffer && frameBuffer.buffer);
      if (!buf || buf.byteLength < expectedBytes) {
        reject(new Error('图像数据长度与宽高不一致'));
        return;
      }
      const buffer = buf.byteLength === expectedBytes ? buf : buf.slice(0, expectedBytes);
      const session = wx.createVKSession({ track: { OCR: { mode: 2 } } });
      const rawTextList = [];
      let resolved = false;

      const done = (err, list) => {
        if (resolved) return;
        resolved = true;
        try {
          if (session.destroy) session.destroy();
        } catch (e) {}
        if (err) reject(err);
        else resolve(list || []);
      };

      session.on('updateAnchors', (anchors) => {
        try {
          const list = Array.isArray(anchors) ? anchors : (anchors ? [anchors] : []);
          list.forEach((anchor) => {
            const text = anchor && (anchor.text != null ? anchor.text : (anchor.words != null ? anchor.words : (typeof anchor === 'string' ? anchor : '')));
            if (text != null && String(text).trim()) rawTextList.push(String(text).trim());
          });
          if (list.length > 0) {
            console.log('[基金OCR] 模块2: updateAnchors 块数', list.length, '累计', rawTextList.length);
          }
          setTimeout(() => done(null, rawTextList), 0);
        } catch (e) {
          console.error('[基金OCR] 模块2: updateAnchors 异常', e);
          setTimeout(() => done(null, rawTextList), 0);
        }
      });

      const startTimeout = setTimeout(() => {
        if (!resolved) {
          console.warn('[基金OCR] 模块2: session.start 超时(5s)');
          done(new Error('VisionKit 启动超时，请重试'));
        }
      }, 5000);

      session.start((errno) => {
        clearTimeout(startTimeout);
        if (errno) {
          console.error('[基金OCR] 模块2: session.start 失败 errno', errno);
          done(new Error('VisionKit 启动失败(errno: ' + errno + ')，请使用真机或体验版重试'));
          return;
        }
        console.log('[基金OCR] 模块2: runOCR 执行中...');
        session.runOCR({ frameBuffer: buffer, width, height });
        setTimeout(() => {
          if (!resolved) {
            console.log('[基金OCR] 模块2: 8s 超时，返回已识别', rawTextList.length, '块');
            done(null, rawTextList.length ? rawTextList : []);
          }
        }, 8000);
      });
    } catch (e) {
      reject(e && e.message ? e : new Error('OCR 初始化失败'));
    }
  });
}

// ====================== 模块3：通用文本清洗（无预设基金名） ======================

/**
 * 通用文本清洗：仅保留中文+数字+金融符号，过滤非金融干扰，修复数字格式，不删任何基金名称相关字符
 * @param {string} rawText OCR 原始文本
 * @returns {string} 清洗后文本
 */
function deepCleanText(rawText) {
  let clean = String(rawText || '');
  // 1. 仅保留中文、数字、金融符号（, . % + - ( ) /）及字母（基金名含 ETF、QDII 等）
  clean = clean.replace(/[^\u4e00-\u9fa5\d,.%+\-()/A-Za-z]/g, '');
  // 2. 仅过滤通用干扰（表头/广告），不删任何基金名相关字符
  UNIVERSAL_NOISE.forEach((word) => {
    clean = clean.replace(new RegExp(escapeRegExp(word), 'g'), '');
  });
  // 3. 时间戳/状态栏（如 15:16）
  clean = clean.replace(/\d{1,2}:\d{1,2}\d?/g, '');
  // 4. 数字格式修复：粘连数字（如 1019348 → 10,193.48），不修改数字本身含义
  clean = clean.replace(/(^|[^\d.])(\d{6,})($|[^\d.])/g, (_, pre, num, suf) => {
    const len = num.length;
    const intPart = num.slice(0, len - 2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = num.slice(-2);
    return pre + intPart + '.' + decPart + suf;
  });
  // 5. 收益率正负号：紧挨 % 的两位小数若无正负号则补 +
  clean = clean.replace(/(^|[^\d+])(\d+[.,]\d{2})(?=%)/g, (_, pre, num) => pre + '+' + num.replace(',', '.'));
  return clean.trim();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ====================== 模块4：量级区分解析（无汇总） ======================

/**
 * 数字标准化：修复千分位/小数点，保留正负号（正数输出无前导+，负数保留-）
 * @param {string} numStr 原始数字（可含 %）
 * @returns {string} 如 10,193.48 或 -10.34，带%时保留
 */
function normalizeNumber(numStr) {
  if (numStr == null || String(numStr).trim() === '') return '';
  let normalized = String(numStr).trim();
  const trailingPct = normalized.indexOf('%') >= 0 ? '%' : '';
  normalized = normalized.replace(/%/g, '');
  const sign = normalized.startsWith('-') ? '-' : (normalized.startsWith('+') ? '+' : '');
  const pureDigits = normalized.replace(/^[+-]/, '').replace(/[^0-9]/g, '');
  if (pureDigits.length < 2) return numStr;
  const integer = pureDigits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimal = pureDigits.slice(-2);
  const out = (sign === '-' ? '-' : '') + integer + '.' + decimal + trailingPct;
  return out;
}

/**
 * 从行文本提取名称，强制保留末尾单个字母（A/C/E），不删不改
 */
function extractNameWithSuffix(rowText) {
  const name = rowText.replace(/[+-]?\d+[.,]?\d{2}%?/g, '').replace(/[+-]?[\d,]+[.,]\d{2}/g, '').replace(/\s+/g, ' ').trim();
  const lastChar = name.slice(-1);
  if (/[A-Za-z]/.test(lastChar)) return name;
  return name;
}

/**
 * 解析：收益率%锚点锁定行 → 提取所有数字块 → 按量级分配 + 强校验，仅输出单只基金数据（无汇总）
 * 量级：持有金额=无正负且最大，昨日收益=有正负且最小，持有收益=有正负且居中
 * 强校验：持有金额 > 持有收益(绝对值) > 昨日收益(绝对值)，否则 isAbnormal: true
 */
function parseFundData(cleanText) {
  const fundList = [];
  if (!cleanText || !cleanText.trim()) {
    console.log('[基金OCR] 模块4: 输入为空');
    return fundList;
  }

  const rateReg = /[+-]?\d+[.,]?\d{2}%/g;
  const rateAnchors = [];
  let rateMatch;
  while ((rateMatch = rateReg.exec(cleanText)) !== null) {
    rateAnchors.push({
      value: rateMatch[0],
      start: rateMatch.index,
      end: rateMatch.index + rateMatch[0].length,
    });
  }
  console.log('[基金OCR] 模块4: 锚点数量', rateAnchors.length);

  rateAnchors.forEach((anchor, index) => {
    const prevAnchor = rateAnchors[index - 1];
    const rowStart = prevAnchor ? prevAnchor.end : 0;
    const rowEnd = anchor.end;
    const fundRow = cleanText.slice(rowStart, rowEnd);
    const rowBeforeRate = fundRow.slice(0, fundRow.length - anchor.value.length);

    const fundName = extractNameWithSuffix(rowBeforeRate) || '(未识别名称)';

    const numBlockReg = /[+-]?[\d,]+[.,]\d{2}(?!%)/g;
    const rawBlocks = (rowBeforeRate.match(numBlockReg) || []).map((s) => s.trim()).filter(Boolean);
    const uniqueRaw = rawBlocks.filter((v, i, a) => a.indexOf(v) === i);
    const withValue = uniqueRaw.map((raw) => {
      const n = normalizeNumber(raw);
      const num = Number(n.replace(/,/g, ''));
      return { raw: n, abs: Math.abs(num), value: num };
    }).filter((x) => !Number.isNaN(x.value));

    if (withValue.length < 3) {
      fundList.push({ name: fundName, holdAmount: '', holdProfit: '', isAbnormal: true });
      console.log('[基金OCR] 模块4: 行' + index + ' 数字不足3个');
      return;
    }

    const sorted = withValue.slice().sort((a, b) => b.abs - a.abs);
    const holdAmount = normalizeNumber(sorted[0].raw.replace(/^[+-]/, '')).replace(/^[+-]/, '');
    const holdProfit = sorted[1].raw;
    const amountAbs = sorted[0].abs;
    const profitAbs = sorted[1].abs;
    const yesterdayAbs = sorted[sorted.length - 1].abs;
    const isAbnormal = amountAbs <= profitAbs || profitAbs <= yesterdayAbs;

    fundList.push({ name: fundName, holdAmount, holdProfit, isAbnormal });
    console.log('[基金OCR] 模块4: 行' + index, { name: fundName.slice(0, 20) + (fundName.length > 20 ? '...' : ''), holdAmount, holdProfit, isAbnormal });
  });

  const seen = new Set();
  const deduped = fundList.filter((f) => {
    const k = f.name + '|' + f.holdAmount + '|' + f.holdProfit;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  console.log('[基金OCR] 模块4: 解析条数', deduped.length, '异常', deduped.filter((f) => f.isAbnormal).length);
  return deduped;
}

// ====================== 模块5：数据汇总 ======================

/**
 * 汇总：仅总持有金额、总持有收益
 */
function calcFundSummary(fundList) {
  if (!Array.isArray(fundList) || fundList.length === 0) {
    return { totalHoldAmount: '0.00', totalHoldProfit: '0.00' };
  }
  let totalHoldAmount = 0;
  let totalHoldProfit = 0;
  fundList.forEach((fund) => {
    const holdAmount = Number(String(fund.holdAmount || '0').replace(/,/g, ''));
    const holdProfit = Number(String(fund.holdProfit || '0').replace(/,/g, ''));
    if (!Number.isNaN(holdAmount)) totalHoldAmount += holdAmount;
    if (!Number.isNaN(holdProfit)) totalHoldProfit += holdProfit;
  });
  return {
    totalHoldAmount: totalHoldAmount.toFixed(2),
    totalHoldProfit: totalHoldProfit.toFixed(2),
  };
}

// ====================== 主入口 ======================

/**
 * 核心入口：基金截图识别（纯前端 + 无次数限制）
 * @param {string} tempFilePath 图片临时路径
 * @param {{ pageContext?: any, canvasId?: string }} options 低版本时必传 pageContext、canvasId
 * @returns {Promise<{ fundList: Array, summary: Object }>}
 */
function recognizeFundImage(tempFilePath, options) {
  const opts = options || {};

  return Promise.resolve()
    .then(() => {
      console.log('[基金OCR] ========== 开始识别 ==========');
      const support = checkVisionKitSupport();
      if (!support.supported) throw new Error(support.message);
      if (!tempFilePath) throw new Error('图片路径无效');
      return compressImage(tempFilePath, opts);
    })
    .then(({ tempFilePath: path, width, height }) => getImageFrameBuffer(path, width, height, opts))
    .then(({ frameBuffer, width, height }) => runVisionKitOcr(frameBuffer, width, height))
    .then((rawTextList) => {
      console.log('[基金OCR] 模块3/4: 原始文字块数', rawTextList ? rawTextList.length : 0);
      if (!rawTextList || rawTextList.length === 0) {
        throw new Error('OCR识别为空：图片模糊或未包含基金数据');
      }
      const rawText = rawTextList.join('');
      const cleanText = deepCleanText(rawText);
      console.log('[基金OCR] 模块3: 清洗后文本长度', cleanText.length, '前200字', cleanText.slice(0, 200));
      if (!cleanText.trim()) {
        throw new Error('识别内容均为干扰文本，未包含有效基金数据');
      }
      const fundList = parseFundData(cleanText);
      console.log('[基金OCR] 模块5: 解析条数', fundList.length);
      console.log('[基金OCR] ========== 识别结束 ==========');
      return { fundList };
    })
    .catch((err) => {
      const msg = err && err.message ? err.message : '识别失败';
      if (msg.indexOf('启动失败') !== -1 || msg.indexOf('errno') !== -1) {
        throw new Error('设备不支持或环境异常，请使用真机/体验版重试');
      }
      if (msg.indexOf('OCR识别为空') !== -1) {
        throw new Error('图片模糊或无基金数据，请重试');
      }
      if (msg.indexOf('未包含有效基金数据') !== -1 || msg.indexOf('干扰文本') !== -1) {
        throw new Error('尝试重新截图（清晰无反光、包含持有列表）');
      }
      throw new Error(msg);
    });
}

module.exports = {
  recognizeFundImage,
  checkVisionKitSupport,
  parseFundData,
  calcFundSummary,
  deepCleanText,
  normalizeNumber,
  compressImage,
  getImageFrameBuffer,
  runVisionKitOcr,
};
