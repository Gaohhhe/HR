/* HR工具箱 - 每日新闻：AI 行业资讯（多源容错 + 本地缓存） */
(function () {
  'use strict';
  const { LS, escapeHtml, toast } = window.HR;

  const KEY = 'hr_news_cache';
  const TTL = 30 * 60 * 1000;   // 30 分钟节流

  const SOURCES = [
    { name: '量子位', type: 'rss2json', url: 'https://www.qbitai.com/feed', aiOnly: false },
    { name: '36氪', type: 'rss2json', url: 'https://36kr.com/feed', aiOnly: true },
    { name: '量子位', type: 'allorigins', url: 'https://www.qbitai.com/feed', aiOnly: false },
    { name: '机器之心', type: 'allorigins', url: 'https://www.jiqizhixin.com/rss', aiOnly: false }
  ];
  const AI_RE = /AI|人工智能|大模型|LLM|Agent|智能|GPT|机器人|OpenAI|算力|芯片/i;

  function withTimeout(ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return { signal: ctrl.signal, clear: () => clearTimeout(t) };
  }

  function stripHtml(s) {
    const d = document.createElement('div');
    d.innerHTML = s || '';
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  async function tryRss2json(src) {
    const t = withTimeout(10000);
    try {
      const api = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(src.url);
      const res = await fetch(api, { signal: t.signal });
      const data = await res.json();
      if (data.status !== 'ok' || !Array.isArray(data.items)) throw new Error('bad response');
      let items = data.items.map(it => ({
        title: it.title || '', link: it.link || '#',
        pubDate: (it.pubDate || '').slice(0, 10),
        source: src.name, summary: stripHtml(it.description).slice(0, 130)
      }));
      if (src.aiOnly) items = items.filter(it => AI_RE.test(it.title + it.summary));
      if (!items.length) throw new Error('no AI items');
      return items;
    } finally { t.clear(); }
  }

  async function tryAllOrigins(src) {
    const t = withTimeout(10000);
    try {
      const api = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(src.url);
      const res = await fetch(api, { signal: t.signal });
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      const nodes = Array.from(doc.querySelectorAll('item'));
      if (!nodes.length) throw new Error('no items');
      let items = nodes.slice(0, 30).map(n => ({
        title: (n.querySelector('title') || {}).textContent || '',
        link: (n.querySelector('link') || {}).textContent || '#',
        pubDate: ((n.querySelector('pubDate') || {}).textContent || '').slice(5, 16),
        source: src.name,
        summary: stripHtml((n.querySelector('description') || {}).textContent || '').slice(0, 130)
      }));
      if (src.aiOnly) items = items.filter(it => AI_RE.test(it.title + it.summary));
      if (!items.length) throw new Error('no AI items');
      return items;
    } finally { t.clear(); }
  }

  async function fetchNews() {
    for (const src of SOURCES) {
      try {
        const items = src.type === 'rss2json' ? await tryRss2json(src) : await tryAllOrigins(src);
        items.sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
        return items.slice(0, 20);
      } catch (e) { /* 尝试下一个源 */ }
    }
    throw new Error('所有新闻源均不可用');
  }

  async function load(force) {
    const status = document.getElementById('news-status');
    const cache = LS.get(KEY, null);
    if (!force && cache && Date.now() - cache.fetchedAt < TTL && cache.items.length) {
      render(cache.items, cache.fetchedAt, true);
      return;
    }
    status.textContent = '正在获取最新资讯…';
    try {
      const items = await fetchNews();
      LS.set(KEY, { fetchedAt: Date.now(), items });
      render(items, Date.now(), false);
    } catch (e) {
      if (cache && cache.items.length) {
        render(cache.items, cache.fetchedAt, true);
        status.textContent = '在线获取失败，当前展示历史缓存。';
      } else {
        status.textContent = '获取失败，请检查网络后点击「刷新」重试。';
        document.getElementById('news-list').innerHTML = '<p class="empty">暂无新闻数据。</p>';
      }
    }
  }

  function render(items, fetchedAt, fromCache) {
    const status = document.getElementById('news-status');
    const t = new Date(fetchedAt);
    const p = n => String(n).padStart(2, '0');
    status.textContent = `${fromCache ? '缓存数据' : '已更新'} · 更新于 ${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
    document.getElementById('news-list').innerHTML = items.map(it => `
      <a class="news-item" href="${escapeHtml(it.link)}" target="_blank" rel="noopener">
        <div class="news-title">${escapeHtml(it.title)}</div>
        ${it.summary ? `<div class="news-sum">${escapeHtml(it.summary)}…</div>` : ''}
        <div class="news-meta"><span class="badge info">${escapeHtml(it.source)}</span><span>${escapeHtml(it.pubDate || '')}</span></div>
      </a>`).join('');
  }

  function bind() {
    document.getElementById('news-refresh').addEventListener('click', () => load(true));
    load(false);
  }

  window.News = { bind };
})();
