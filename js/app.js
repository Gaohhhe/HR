/* HR工具箱 - 应用入口：Tab 导航、JSON 备份、模块初始化 */
(function () {
  'use strict';
  const { exportJSON, importJSON, LS, toast } = window.HR;

  /* ---------- Tab 切换 ---------- */
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    if (name === 'calendar') window.Calendar.render();
  }

  /* ---------- JSON 全量备份 ---------- */
  function bindBackup() {
    document.getElementById('btn-export-json').addEventListener('click', exportJSON);

    const input = document.getElementById('json-input');
    document.getElementById('btn-import-json').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      if (!confirm('导入将覆盖当前全部数据（候选人 / 待办 / 学习链接），且不可恢复。确定继续？')) return;
      try {
        const data = await importJSON(file);
        LS.set('hr_candidates', data.candidates || []);
        LS.set('hr_todos', data.todos || []);
        LS.set('hr_links', data.links || []);
        toast('导入成功，数据已恢复');
        window.Candidates.render();
        window.Calendar.render();
        window.Learning.render();
        window.Resume.refresh();
      } catch (e) {
        toast('导入失败：' + e.message, 'err');
      }
    });
  }

  /* ---------- 启动 ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => switchTab(t.dataset.tab));
    });

    window.News.bind();
    window.Candidates.bind();
    window.Candidates.render();
    window.Calendar.bind();
    window.Resume.bind();
    window.Resume.renderTemplateForm();
    window.Learning.bind();
    bindBackup();

    // 默认投递日期 = 今天
    const cdate = document.getElementById('c-date');
    if (cdate) cdate.value = new Date().toISOString().slice(0, 10);
  });
})();
