/* HR工具箱 - 学习：自定义学习链接收藏 */
(function () {
  'use strict';
  const { LS, uid, todayStr, escapeHtml, toast } = window.HR;

  const KEY = 'hr_links';

  const links = () => LS.get(KEY, []);
  const save = (l) => LS.set(KEY, l);

  function normalizeUrl(u) {
    u = u.trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }

  function render() {
    const box = document.getElementById('link-list');
    if (!box) return;
    const arr = links();
    document.getElementById('link-count').textContent = `共 ${arr.length} 条`;
    if (!arr.length) {
      box.innerHTML = '<p class="empty">还没有学习链接，在上方添加喜欢的课程 / 文章 / 工具站点吧。</p>';
      return;
    }
    box.innerHTML = arr.map(l => `
      <div class="link-item" data-lid="${l.id}">
        <span class="badge info">${escapeHtml(l.category || '综合')}</span>
        <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" class="link-title" title="${escapeHtml(l.url)}">${escapeHtml(l.title)}</a>
        <span class="muted link-date">${escapeHtml(l.addDate || '')}</span>
        <button class="btn-link danger" data-op="del">删除</button>
      </div>`).join('');
  }

  function add() {
    const title = document.getElementById('link-title').value.trim();
    const url = normalizeUrl(document.getElementById('link-url').value);
    const category = document.getElementById('link-cat').value.trim() || '综合';
    if (!title || !url) { toast('请填写标题和链接', 'warn'); return; }
    const arr = links();
    arr.push({ id: uid(), title, url, category, addDate: todayStr() });
    save(arr);
    document.getElementById('link-title').value = '';
    document.getElementById('link-url').value = '';
    toast('链接已收藏');
    render();
  }

  function bind() {
    document.getElementById('link-add').addEventListener('click', add);
    document.getElementById('link-url').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    document.getElementById('link-list').addEventListener('click', e => {
      const btn = e.target.closest('[data-op="del"]');
      if (!btn) return;
      const lid = btn.closest('[data-lid]').dataset.lid;
      save(links().filter(l => l.id !== lid));
      toast('已删除');
      render();
    });
    render();
  }

  window.Learning = { bind, render };
})();
