/* HR工具箱 - 招聘台账：候选人 CRUD、智能流程状态机、Excel 导出 */
(function () {
  'use strict';
  const { LS, uid, todayStr, escapeHtml, toast, DB, download, ensureLib } = window.HR;

  const KEY = 'hr_candidates';
  const RESULT = { pending: '待定', pass: '通过', fail: '未通过' };
  const STATUS = { active: '进行中', hired: '已录用', rejected: '已淘汰' };
  const MODES = ['现场', '视频', '电话'];

  let filterStatus = 'all';
  let keyword = '';
  let editingId = null;

  const list = () => LS.get(KEY, []);
  const save = (l) => LS.set(KEY, l);
  const getById = (id) => list().find(c => c.id === id);

  /* 把修改过的候选人对象写回存储 */
  function saveCandidate(c) {
    const arr = list();
    const i = arr.findIndex(x => x.id === c.id);
    if (i >= 0) arr[i] = c;
    save(arr);
  }

  function touch(c) { c.updatedAt = new Date().toISOString(); }

  function newCandidate(data) {
    return Object.assign({
      id: uid(), name: '', position: '', phone: '', email: '', source: '',
      appliedDate: todayStr(), status: 'active', resumeFileId: '', notes: '',
      stage: {
        screen: { result: 'pending' },
        phone: { result: 'pending', date: '', note: '' },
        interviews: [],
        offer: { result: 'pending', salary: '', note: '' }
      },
      updatedAt: new Date().toISOString()
    }, data);
  }

  /* ---------- 智能流程控制（状态机） ---------- */
  function visibleStages(c) {
    const s = c.stage;
    const lastRound = s.interviews.length ? s.interviews[s.interviews.length - 1] : null;
    return {
      screen: true,
      phone: s.screen.result === 'pass',
      interviews: s.screen.result === 'pass' && s.phone.result === 'pass',
      passed: !!(lastRound && lastRound.result === 'pass'),
      offer: !!(lastRound && lastRound.result === 'pass')
    };
  }

  function terminatedReason(c) {
    const s = c.stage;
    if (s.screen.result === 'fail') return '简历筛选未通过';
    if (s.phone.result === 'fail') return '电话约面未成功';
    const f = s.interviews.find(r => r.result === 'fail');
    if (f) return `第${f.round}轮面试未通过`;
    return '';
  }

  /* 无终止原因且 Offer 未否决时，允许把「已淘汰」恢复为「进行中」 */
  function shouldReactivate(c) {
    return !terminatedReason(c) && c.stage.offer.result !== 'fail';
  }

  /* ---------- 渲染 ---------- */
  function statusBadge(st) {
    const cls = st === 'hired' ? 'ok' : st === 'rejected' ? 'bad' : 'info';
    return `<span class="badge ${cls}">${STATUS[st]}</span>`;
  }

  function selResult(cid, field, val, extra) {
    return `<select class="input" data-cid="${cid}" data-field="${field}" ${extra || ''}>
      ${Object.keys(RESULT).map(k => `<option value="${k}" ${val === k ? 'selected' : ''}>${RESULT[k]}</option>`).join('')}
    </select>`;
  }

  function roundHtml(c, r, idx) {
    return `<div class="round">
      <div class="round-head">
        <strong>第 ${r.round} 轮面试</strong>
        <button class="btn-link danger" data-action="del-round" data-idx="${idx}">删除本轮</button>
      </div>
      <div class="grid4">
        <label>日期<input type="date" class="input" data-cid="${c.id}" data-field="round" data-idx="${idx}" data-key="date" value="${escapeHtml(r.date || '')}"></label>
        <label>时间<input type="time" class="input" data-cid="${c.id}" data-field="round" data-idx="${idx}" data-key="time" value="${escapeHtml(r.time || '')}"></label>
        <label>方式<select class="input" data-cid="${c.id}" data-field="round" data-idx="${idx}" data-key="mode">
          <option value="">请选择</option>
          ${MODES.map(m => `<option ${r.mode === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select></label>
        <label>面试官<input type="text" class="input" data-cid="${c.id}" data-field="round" data-idx="${idx}" data-key="interviewer" value="${escapeHtml(r.interviewer || '')}"></label>
      </div>
      <div class="grid2">
        <label>结果${selResult(c.id, 'round-result', r.result, `data-idx="${idx}"`)}</label>
        <label>备注<input type="text" class="input" data-cid="${c.id}" data-field="round" data-idx="${idx}" data-key="note" value="${escapeHtml(r.note || '')}"></label>
      </div>
    </div>`;
  }

  function cardHtml(c) {
    const v = visibleStages(c);
    const reason = terminatedReason(c);
    const phone = c.stage.phone, offer = c.stage.offer;
    return `<div class="card candidate" data-cid="${c.id}">
      <div class="card-head">
        <div class="card-title">
          <strong class="cname">${escapeHtml(c.name)}</strong>
          <span class="pos">${escapeHtml(c.position)}</span>
          ${statusBadge(c.status)}
        </div>
        <div class="card-ops">
          <button class="btn-link" data-action="edit">编辑</button>
          <button class="btn-link" data-action="resume-op">${c.resumeFileId ? '下载简历' : '上传简历'}</button>
          <button class="btn-link danger" data-action="del">删除</button>
        </div>
      </div>
      <div class="meta">
        <span>电话：${escapeHtml(c.phone || '-')}</span>
        <span>邮箱：${escapeHtml(c.email || '-')}</span>
        <span>来源：${escapeHtml(c.source || '-')}</span>
        <span>投递：${escapeHtml(c.appliedDate || '-')}</span>
      </div>

      ${reason ? `<div class="banner bad">流程已终止：${reason}</div>` : ''}
      ${c.status === 'hired' ? '<div class="banner ok">Offer 审批通过，已录用</div>' : ''}

      <div class="flow">
        <div class="stage ${v.screen ? '' : 'hide'}">
          <div class="stage-title">① 简历筛选</div>
          <div class="stage-body">${selResult(c.id, 'screen.result', c.stage.screen.result)}</div>
        </div>

        <div class="stage ${v.phone ? '' : 'hide'}">
          <div class="stage-title">② 电话约面</div>
          <div class="stage-body grid3">
            <label>约面日期<input type="date" class="input" data-cid="${c.id}" data-field="phone.date" value="${escapeHtml(phone.date || '')}"></label>
            <label>结果${selResult(c.id, 'phone.result', phone.result)}</label>
            <label>备注<input type="text" class="input" data-cid="${c.id}" data-field="phone.note" value="${escapeHtml(phone.note || '')}"></label>
          </div>
        </div>

        <div class="stage ${v.interviews ? '' : 'hide'}">
          <div class="stage-title">③ 多轮面试
            <button class="btn-link" data-action="add-round">＋ 添加一轮面试</button>
          </div>
          <div class="stage-body">
            ${c.stage.interviews.length ? c.stage.interviews.map((r, i) => roundHtml(c, r, i)).join('') : '<p class="muted">暂未安排面试，点击上方按钮添加。</p>'}
          </div>
        </div>

        <div class="banner ok ${v.passed ? '' : 'hide'}">✓ 面试已通过${v.passed ? '（' + escapeHtml(c.stage.interviews[c.stage.interviews.length - 1].date || '') + '）' : ''}</div>

        <div class="stage ${v.offer ? '' : 'hide'}">
          <div class="stage-title">④ Offer 审批</div>
          <div class="stage-body grid3">
            <label>审批结果${selResult(c.id, 'offer.result', offer.result)}</label>
            <label>薪资<input type="text" class="input" placeholder="如 20K×15" data-cid="${c.id}" data-field="offer.salary" value="${escapeHtml(offer.salary || '')}"></label>
            <label>备注<input type="text" class="input" data-cid="${c.id}" data-field="offer.note" value="${escapeHtml(offer.note || '')}"></label>
          </div>
        </div>
      </div>
    </div>`;
  }

  function editHtml(c) {
    return `<div class="card candidate editing" data-cid="${c.id}">
      <div class="card-head"><div class="card-title"><strong>编辑候选人</strong></div></div>
      <div class="grid4 edit-form">
        <label>姓名<input id="e-name" class="input" value="${escapeHtml(c.name)}"></label>
        <label>应聘职位<input id="e-position" class="input" value="${escapeHtml(c.position)}"></label>
        <label>电话<input id="e-phone" class="input" value="${escapeHtml(c.phone)}"></label>
        <label>邮箱<input id="e-email" class="input" value="${escapeHtml(c.email)}"></label>
        <label>简历来源<input id="e-source" class="input" placeholder="内推/BOSS/官网…" value="${escapeHtml(c.source)}"></label>
        <label>投递日期<input id="e-date" type="date" class="input" value="${escapeHtml(c.appliedDate)}"></label>
        <label class="span2">备注<input id="e-notes" class="input" value="${escapeHtml(c.notes)}"></label>
      </div>
      <div class="ops">
        <button class="btn primary" data-action="save-edit">保存</button>
        <button class="btn" data-action="cancel-edit">取消</button>
      </div>
    </div>`;
  }

  function render() {
    const box = document.getElementById('cand-list');
    if (!box) return;
    let arr = list();
    if (filterStatus !== 'all') arr = arr.filter(c => c.status === filterStatus);
    if (keyword) {
      const k = keyword.toLowerCase();
      arr = arr.filter(c => (c.name + c.position).toLowerCase().includes(k));
    }
    arr.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    document.getElementById('cand-count').textContent = `共 ${arr.length} 人`;
    box.innerHTML = arr.length
      ? arr.map(c => c.id === editingId ? editHtml(c) : cardHtml(c)).join('')
      : '<p class="empty">暂无候选人，请在上方添加。</p>';
  }

  /* ---------- 新增 / 删除 / 编辑 ---------- */
  function addFromForm() {
    const name = document.getElementById('c-name').value.trim();
    const position = document.getElementById('c-position').value.trim();
    if (!name || !position) { toast('请填写姓名和应聘职位', 'warn'); return; }
    const c = newCandidate({
      name, position,
      phone: document.getElementById('c-phone').value.trim(),
      email: document.getElementById('c-email').value.trim(),
      source: document.getElementById('c-source').value.trim(),
      appliedDate: document.getElementById('c-date').value || todayStr()
    });
    const arr = list(); arr.push(c); save(arr);
    ['c-name', 'c-position', 'c-phone', 'c-email', 'c-source'].forEach(id => { document.getElementById(id).value = ''; });
    toast('已添加候选人');
    render();
  }

  function removeCandidate(id) {
    const c = getById(id);
    if (!c) return;
    if (!confirm(`确认删除候选人「${c.name}」？该操作不可恢复。`)) return;
    save(list().filter(x => x.id !== id));
    if (c.resumeFileId) DB.del('files', c.resumeFileId).catch(() => {});
    toast('已删除');
    render();
  }

  /* ---------- 字段保存（含状态机联动） ---------- */
  function confirmFail(msg) { return confirm(msg + '\n确认后流程将终止并移入「已淘汰」。'); }

  function applyFieldChange(c, field, target) {
    const s = c.stage;
    if (field === 'screen.result' || field === 'phone.result') {
      if (target.value === 'fail' && !confirmFail(field === 'screen.result' ? '确认「简历筛选未通过」？' : '确认「电话约面未成功」？')) { render(); return; }
      if (field === 'screen.result') s.screen.result = target.value;
      else s.phone.result = target.value;
      if (terminatedReason(c)) c.status = 'rejected';
      else if (c.status === 'rejected' && shouldReactivate(c)) c.status = 'active';
    } else if (field === 'phone.date') { s.phone.date = target.value; }
    else if (field === 'phone.note') { s.phone.note = target.value; }
    else if (field === 'offer.result') {
      if (target.value === 'fail' && !confirmFail('确认「Offer 审批未通过」？')) { render(); return; }
      s.offer.result = target.value;
      if (target.value === 'pass') c.status = 'hired';
      else if (target.value === 'fail') c.status = 'rejected';
      else if (shouldReactivate(c)) c.status = 'active';
    } else if (field === 'offer.salary') { s.offer.salary = target.value; }
    else if (field === 'offer.note') { s.offer.note = target.value; }
    else if (field === 'round-result') {
      const idx = +target.dataset.idx;
      if (target.value === 'fail' && !confirmFail(`确认「第${s.interviews[idx].round}轮面试未通过」？`)) { render(); return; }
      s.interviews[idx].result = target.value;
      if (terminatedReason(c)) c.status = 'rejected';
      else if (c.status === 'rejected' && shouldReactivate(c)) c.status = 'active';
    } else if (field === 'round') {
      const r = s.interviews[+target.dataset.idx];
      if (r) r[target.dataset.key] = target.value;
    }
    touch(c); saveCandidate(c);
  }

  /* ---------- 简历关联 ---------- */
  async function attachResume(cid, file) {
    if (file.size > 20 * 1024 * 1024) { toast('文件不能超过 20MB', 'warn'); return; }
    const c = getById(cid);
    if (!c) return;
    try {
      const rec = {
        id: uid(), blob: file, name: file.name, mime: file.type || 'application/octet-stream',
        size: file.size, candidateId: cid, candidateName: c.name, position: c.position,
        uploadDate: todayStr()
      };
      await DB.put('files', rec);
      c.resumeFileId = rec.id; touch(c); saveCandidate(c);
      toast('简历已归档');
      render();
    } catch (e) { toast('保存失败：' + e.message, 'err'); }
  }

  async function downloadResume(cid) {
    const c = getById(cid);
    if (!c) return;
    const rec = await DB.get('files', c.resumeFileId);
    if (!rec) { toast('简历文件不存在（可能已被删除）', 'err'); return; }
    const ext = (rec.name || '').includes('.') ? rec.name.slice(rec.name.lastIndexOf('.')) : '';
    download(`${c.name}_${c.position}_${c.appliedDate || todayStr()}${ext}`, rec.blob);
  }

  /* ---------- Excel 导出 ---------- */
  async function exportExcel() {
    const arr = list();
    if (!arr.length) { toast('暂无候选人数据', 'warn'); return; }
    try { await ensureLib('xlsx'); } catch (e) { toast('Excel 组件加载失败，请检查网络', 'err'); return; }
    const rows = arr.map(c => {
      const v = visibleStages(c);
      const rounds = c.stage.interviews.map(r => `第${r.round}轮 ${r.date || ''} ${r.time || ''} ${r.mode || ''} ${r.interviewer || ''} ${RESULT[r.result]}`).join('；');
      let interviewResult = '';
      if (c.stage.interviews.length) {
        interviewResult = c.stage.interviews.some(r => r.result === 'fail') ? '未通过'
          : (v.passed ? '通过' : '进行中');
      }
      return {
        '姓名': c.name, '应聘职位': c.position, '电话': c.phone, '邮箱': c.email,
        '简历来源': c.source, '投递日期': c.appliedDate,
        '简历筛选': RESULT[c.stage.screen.result],
        '电话约面': v.phone ? RESULT[c.stage.phone.result] : '',
        '约面日期': v.phone ? c.stage.phone.date : '',
        '面试轮次': v.interviews ? c.stage.interviews.length : '',
        '面试记录': v.interviews ? rounds : '',
        '面试结果': interviewResult,
        'Offer审批': v.offer ? RESULT[c.stage.offer.result] : '',
        '薪资': v.offer ? c.stage.offer.salary : '',
        '状态': STATUS[c.status], '备注': c.notes, '更新时间': (c.updatedAt || '').replace('T', ' ').slice(0, 16)
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(() => ({ wch: 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '招聘台账');
    XLSX.writeFile(wb, `招聘台账_${todayStr()}.xlsx`);
    toast('已导出 Excel');
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    document.getElementById('cand-add').addEventListener('click', addFromForm);
    document.getElementById('cand-export-xlsx').addEventListener('click', exportExcel);
    document.getElementById('cand-filter').addEventListener('change', e => { filterStatus = e.target.value; render(); });
    document.getElementById('cand-search').addEventListener('input', e => { keyword = e.target.value.trim(); render(); });

    let pendingResumeCid = '';
    const fileInput = document.getElementById('cand-resume-input');
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      if (f && pendingResumeCid) attachResume(pendingResumeCid, f);
      fileInput.value = '';
    });

    const box = document.getElementById('cand-list');
    box.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const holder = btn.closest('[data-cid]');
      if (!holder) return;
      const cid = holder.dataset.cid;
      const c = getById(cid);
      if (!c) return;
      const act = btn.dataset.action;
      if (act === 'del') removeCandidate(cid);
      else if (act === 'edit') { editingId = cid; render(); }
      else if (act === 'cancel-edit') { editingId = null; render(); }
      else if (act === 'save-edit') {
        c.name = document.getElementById('e-name').value.trim();
        c.position = document.getElementById('e-position').value.trim();
        c.phone = document.getElementById('e-phone').value.trim();
        c.email = document.getElementById('e-email').value.trim();
        c.source = document.getElementById('e-source').value.trim();
        c.appliedDate = document.getElementById('e-date').value || c.appliedDate;
        c.notes = document.getElementById('e-notes').value;
        editingId = null;
        touch(c); saveCandidate(c);
        toast('已保存'); render();
      }
      else if (act === 'add-round') {
        c.stage.interviews.push({ round: c.stage.interviews.length + 1, date: '', time: '', mode: '', interviewer: '', result: 'pending', note: '' });
        touch(c); saveCandidate(c); render();
      }
      else if (act === 'del-round') {
        if (!confirm('确认删除该轮面试记录？')) return;
        c.stage.interviews.splice(+btn.dataset.idx, 1);
        c.stage.interviews.forEach((r, i) => { r.round = i + 1; });
        if (c.status === 'rejected' && shouldReactivate(c)) c.status = 'active';
        touch(c); saveCandidate(c); render();
      }
      else if (act === 'resume-op') {
        if (c.resumeFileId) downloadResume(cid);
        else { pendingResumeCid = cid; fileInput.click(); }
      }
    });

    box.addEventListener('change', e => {
      const t = e.target;
      const cid = t.dataset && t.dataset.cid;
      if (!cid || !t.dataset.field) return;
      const c = getById(cid);
      if (!c) return;
      applyFieldChange(c, t.dataset.field, t);
      render();
    });

    /* 日期/时间选择器在值变化时即保存（change 需失焦才触发，容易漏存） */
    box.addEventListener('input', e => {
      const t = e.target;
      if (!t.dataset || !t.dataset.cid || !t.dataset.field) return;
      if (t.tagName !== 'INPUT' || (t.type !== 'date' && t.type !== 'time')) return;
      const c = getById(t.dataset.cid);
      if (!c) return;
      applyFieldChange(c, t.dataset.field, t);
      render();
    });
  }

  /* ---------- 提供给日历的面试事件 ---------- */
  function getEvents() {
    const evts = [];
    list().forEach(c => {
      const v = visibleStages(c);
      if (v.phone && c.stage.phone.date) {
        evts.push({ date: c.stage.phone.date, type: 'phone', name: c.name, position: c.position, label: `电话约面：${c.name}（${c.position}）`, time: '', candidateId: c.id });
      }
      if (v.interviews) {
        c.stage.interviews.forEach(r => {
          if (r.date) evts.push({ date: r.date, type: 'interview', name: c.name, position: c.position, label: `第${r.round}轮面试：${c.name}（${c.position}）`, time: r.time || '', mode: r.mode, interviewer: r.interviewer, result: r.result, candidateId: c.id });
        });
      }
    });
    return evts;
  }

  window.Candidates = { render, bind, getEvents, list };
})();
