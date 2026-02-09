const DEFAULT_TITLE = '净值速查：实时估值与涨幅';
const DEFAULT_PATH = '/pages/tiantian/index/index';

function getCurrentPagePath() {
  try {
    const pages = getCurrentPages();
    const current = pages && pages.length ? pages[pages.length - 1] : null;
    const route = current && current.route ? String(current.route) : '';
    if (!route) return '';
    return route.startsWith('/') ? route : '/' + route;
  } catch (e) {
    console.error('getCurrentPagePath error', e);
    return '';
  }
}

function buildShareConfig(options = {}) {
  const title = options.title || DEFAULT_TITLE;
  const path = options.path || getCurrentPagePath() || DEFAULT_PATH;
  const imageUrl = options.imageUrl || '';
  const config = { title, path };
  if (imageUrl) config.imageUrl = imageUrl;
  return config;
}

function buildTimelineConfig(options = {}) {
  const title = options.title || DEFAULT_TITLE;
  const query = options.query || '';
  const imageUrl = options.imageUrl || '';
  const config = { title };
  if (query) config.query = query;
  if (imageUrl) config.imageUrl = imageUrl;
  return config;
}

module.exports = {
  buildShareConfig,
  buildTimelineConfig
};
