/* HR工具箱 - 日历：面试日程月视图 + 待办管理 */
(function () {
  'use strict';
  const { LS, uid, todayStr, fmtDate, escapeHtml, toast } = window.HR;
  const TKEY = 'hr_todos';
  const PRIORITY = { high: '高', mid: '中', low: '低' };
  const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

  const now = new Date();
  let viewY = now.getFullYear();
  let viewM = now.getMonth();          // 0-11
  let selectedDate = todayStr();

  const todos = () => LS.get(TKEY, []);
  const saveTodos = (l) => LS.set(TKEY, l);

  /* 汇总某月所有日程：面试 + 电话约面 + 待办 */
  function monthEvents(y, m) {
    const map = {};   // 'YYYY-MM-DD' -> {interviews:[], todos:[]}
    const push = (date, kind, item) => {
      if (!date) return;
      const [Y, M, D] = date.split('-').map(Number);
      if (Y !== y || M !== m + 1) return;
      if (!map[date]) map[date] = { interviews: [], todos: [] };
      map[date][kind].push(item);
    };
    (window.Candidates ? window.Candidates.getEvents() : []).forEach(e => {
      push(e.date, 'interviews', e);
    });
    todos().forEach(t => { push(t.dueDate, 'todos', t); });
    return map;
  }

  function render() {
    const grid = document.getElementById('cal-grid');
    if (!grid) return;
    const first = new Date(viewY, viewM, 1);
    const offset = (first.getDay() + 6) % 7;          // 周一为第一列
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const map = monthEvents(viewY, viewM);
    const today = todayStr();

    document.getElementById('cal-title').textContent = `${viewY} 年 ${viewM + 1} 月`;

    let html = WEEK.map(w => `<div class="cal-head ${'六日'.includes(w) ? 'wk' : ''}">${w}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const dayNum = i - offset + 1;
      const d = new Date(viewY, viewM, dayNum);
      const dateStr = fmtDate(d);
      const out = dayNum < 1 || dayNum > daysInMonth;
      const isToday = dateStr === today;
      const isSel = dateStr === selectedDate;
      const ev = map[dateStr];
      let inner = '';
      if (!out && ev) {
        const chips = ev.interviews.slice(0, 2).map(e =>
          `<span class="chip ${e.type === 'phone' ? 'phone' : 'iv'}">${e.type === 'phone' ? '约面' : '面试'}·${escapeHtml(e.name)}</span>`).join('');
        const more = ev.interviews.length > 2 ? `<span class="chip">+${ev.interviews.length - 2}</span>` : '';
        const td = ev.todos.filter(t => !t.done).length;
        const tdc = td ? `<span class="chip todo">待办×${td}</span>` : '';
        inner = chips + more + tdc;
      }
      html += `<div class="cal-cell ${out ? 'out' : ''} ${isToday ? 'today' : ''} ${isSel ? 'sel' : ''}" data-date="${dateStr}">
        <div class="cal-day">${d.getDate()}${isToday ? '<i class="dot-today"></i>' : ''}</div>
        <div class="cal-ev">${inner}</div>
      </div>`;
    }
    grid.innerHTML = html;
    renderPanel();
  }

  function renderPanel() {
    const panel = document.getElementById('cal-panel');
    if (!panel) return;
    const evs = (window.Candidates ? window.Candidates.getEvents() : []).filter(e => e.date === selectedDate);
    evs.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const dayTodos = todos().filter(t => t.dueDate === selectedDate);
    const cands = (window.Candidates ? window.Candidates.list() : []).filter(c => c.status === 'active');

    const d = selectedDate.split('-');
    panel.innerHTML = `
      <h3>${d[0]}年${+d[1]}月${+d[2]}日</h3>
      <div class="panel-sec">
        <div class="panel-title">面试安排（${evs.length}）</div>
        ${evs.length ? evs.map(e => `
          <div class="ev-item">
            <div class="ev-line"><strong>${escapeHtml(e.label)}</strong>${e.time ? `<span class="tag">${escapeHtml(e.time)}</span>` : ''}</div>
            <div class="ev-sub">${[e.mode, e.interviewer ? '面试官：' + e.interviewer : '', e.result && e.result !== 'pending' ? ({ pass: '已通过', fail: '未通过' }[e.result]) : ''].filter(Boolean).join(' · ') || ' '}</div>
          </div>`).join('') : '<p class="muted">当天没有面试安排。</p>'}
      </div>
      <div class="panel-sec">
        <div class="panel-title">当天待办（${dayTodos.length}）</div>
        ${dayTodos.length ? dayTodos.map(t => `
          <div class="todo-item ${t.done ? 'done' : ''}">
            <input type="checkbox" data-todo="${t.id}" ${t.done ? 'checked' : ''}>
            <span class="t-title">${escapeHtml(t.title)}</span>
            <span class="prio ${t.priority}">${PRIORITY[t.priority] || ''}</span>
            <button class="btn-link danger" data-del-todo="${t.id}">删</button>
          </div>`).join('') : '<p class="muted">当天没有待办。</p>'}
        <div class="todo-add">
          <input id="todo-title" class="input" placeholder="新增待办事项…">
          <select id="todo-prio" class="input">
            <option value="high">高</option><option value="mid" selected>中</option><option value="low">低</option>
          </select>
          <select id="todo-cand" class="input">
            <option value="">关联候选人（可选）</option>
            ${cands.map(c => `<option value="${c.id}">${escapeHtml(c.name)}（${escapeHtml(c.position)}）</option>`).join('')}
          </select>
          <button class="btn primary" id="todo-add-btn">添加</button>
        </div>
      </div>
      <div class="panel-sec">
        <div class="panel-title">全部未完成待办（${todos().filter(t => !t.done).length}）</div>
        ${renderAllTodos()}
      </div>`;
  }

  function renderAllTodos() {
    const undone = todos().filter(t => !t.done).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    if (!undone.length) return '<p class="muted">太棒了，没有未完成的待办。</p>';
    return undone.map(t => `
      <div class="todo-item">
        <input type="checkbox" data-todo="${t.id}">
        <span class="t-title" data-jump="${t.dueDate}" title="点击跳转到该日期">${escapeHtml(t.title)}</span>
        <span class="t-date">${t.dueDate || ''}</span>
        <span class="prio ${t.priority}">${PRIORITY[t.priority] || ''}</span>
        <button class="btn-link danger" data-del-todo="${t.id}">删</button>
      </div>`).join('');
  }

  function addTodo() {
    const title = document.getElementById('todo-title').value.trim();
    if (!title) { toast('请填写待办内容', 'warn'); return; }
    const arr = todos();
    arr.push({
      id: uid(), title, dueDate: selectedDate,
      priority: document.getElementById('todo-prio').value,
      done: false, candidateId: document.getElementById('todo-cand').value
    });
    saveTodos(arr);
    toast('待办已添加');
    render();
  }

  function bind() {
    document.getElementById('cal-prev').addEventListener('click', () => { viewM--; if (viewM < 0) { viewM = 11; viewY--; } render(); });
    document.getElementById('cal-next').addEventListener('click', () => { viewM++; if (viewM > 11) { viewM = 0; viewY++; } render(); });
    document.getElementById('cal-today').addEventListener('click', () => {
      const n = new Date(); viewY = n.getFullYear(); viewM = n.getMonth(); selectedDate = todayStr(); render();
    });

    document.getElementById('cal-grid').addEventListener('click', e => {
      const cell = e.target.closest('.cal-cell');
      if (!cell || cell.classList.contains('out')) return;
      selectedDate = cell.dataset.date;
      render();
    });

    const panel = document.getElementById('cal-panel');
    panel.addEventListener('click', e => {
      const del = e.target.closest('[data-del-todo]');
      if (del) {
        saveTodos(todos().filter(t => t.id !== del.dataset.delTodo));
        render();
        return;
      }
      const jump = e.target.closest('[data-jump]');
      if (jump && jump.dataset.jump) {
        const [y, m] = jump.dataset.jump.split('-').map(Number);
        viewY = y; viewM = m - 1; selectedDate = jump.dataset.jump;
        render();
      }
    });
    panel.addEventListener('change', e => {
      const cb = e.target.closest('[data-todo]');
      if (!cb) return;
      const arr = todos();
      const t = arr.find(x => x.id === cb.dataset.todo);
      if (t) { t.done = cb.checked; saveTodos(arr); render(); }
    });
    panel.addEventListener('click', e => {
      if (e.target.id === 'todo-add-btn') addTodo();
    });
    panel.addEventListener('keydown', e => {
      if (e.target.id === 'todo-title' && e.key === 'Enter') addTodo();
    });
  }

  window.Calendar = { render, bind };
})();
