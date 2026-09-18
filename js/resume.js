/* HR工具箱 - 简历管理：文件归档(IndexedDB)+重命名下载、标准模板简历生成 PDF */
(function () {
  'use strict';
  const { DB, uid, todayStr, escapeHtml, toast, download, ensureLib, fmtSize } = window.HR;

  let editingFileId = null;

  /* ---------- 归档文件 ---------- */
  async function renderFiles() {
    const box = document.getElementById('rf-list');
    if (!box) return;
    let files;
    try { files = await DB.all('files'); } catch (e) { box.innerHTML = '<p class="empty">本地数据库不可用</p>'; return; }
    files.sort((a, b) => (b.uploadDate || '').localeCompare(a.uploadDate || ''));
    if (!files.length) {
      box.innerHTML = '<p class="empty">还没有归档简历。上传后将按「姓名_职位_日期」规范命名。</p>';
      return;
    }
    box.innerHTML = files.map(f => {
      if (f.id === editingFileId) {
        return `<div class="rf-item editing" data-fid="${f.id}">
          <div class="grid4">
            <label>姓名<input id="rf-e-name" class="input" value="${escapeHtml(f.candidateName || '')}"></label>
            <label>职位<input id="rf-e-pos" class="input" value="${escapeHtml(f.position || '')}"></label>
            <label>日期<input id="rf-e-date" type="date" class="input" value="${escapeHtml(f.uploadDate || todayStr())}"></label>
          </div>
          <div class="ops">
            <button class="btn primary" data-op="save-edit">保存</button>
            <button class="btn" data-op="cancel-edit">取消</button>
          </div>
        </div>`;
      }
      return `<div class="rf-item" data-fid="${f.id}">
        <div class="rf-info">
          <strong>${escapeHtml(stdName(f))}</strong>
          <span class="muted">原文件：${escapeHtml(f.name)} · ${fmtSize(f.size)} · 上传于 ${escapeHtml(f.uploadDate || '-')}</span>
        </div>
        <div class="rf-ops">
          <button class="btn-link" data-op="download">下载</button>
          <button class="btn-link" data-op="edit">编辑</button>
          <button class="btn-link danger" data-op="del">删除</button>
        </div>
      </div>`;
    }).join('');
  }

  function stdName(f) {
    const i = (f.name || '').lastIndexOf('.');
    const ext = i >= 0 ? f.name.slice(i) : '';
    const cn = (f.candidateName || '').trim() || '未命名';
    const pos = (f.position || '').trim() || '未填职位';
    const date = f.uploadDate || todayStr();
    return `${cn}_${pos}_${date}${ext}`;
  }

  async function uploadFiles() {
    const input = document.getElementById('rf-input');
    const name = document.getElementById('rf-name').value.trim();
    const pos = document.getElementById('rf-pos').value.trim();
    const date = document.getElementById('rf-date').value || todayStr();
    if (!input.files.length) { toast('请先选择简历文件', 'warn'); return; }
    if (!name) { toast('请填写姓名（用于规范命名）', 'warn'); return; }
    try {
      for (const f of input.files) {
        if (f.size > 20 * 1024 * 1024) { toast(`「${f.name}」超过 20MB，已跳过`, 'warn'); continue; }
        await DB.put('files', {
          id: uid(), blob: f, name: f.name, mime: f.type || 'application/octet-stream',
          size: f.size, candidateId: '', candidateName: name, position: pos, uploadDate: date
        });
      }
      input.value = '';
      toast('简历已归档');
      renderFiles();
    } catch (e) { toast('归档失败：' + e.message, 'err'); }
  }

  async function opDownload(fid) {
    const f = await DB.get('files', fid);
    if (!f) { toast('文件不存在', 'err'); return; }
    download(stdName(f), f.blob);
  }

  /* ---------- 标准模板简历 ---------- */
  const TEMPLATE_FIELDS = [
    ['edu', '教育经历', '每行一条，如：2018.09-2022.06 XX大学 人力资源管理 本科'],
    ['work', '工作经历', '每行一条，如：2022.07-至今 XX公司 HR专员 负责招聘…'],
    ['proj', '项目经验', '每行一条'],
    ['skill', '技能特长', '每行一条，如：熟练使用 Excel 数据透视表'],
    ['summary', '自我评价', '一段话']
  ];

  function escLines(s) {
    return String(s || '').split('\n').map(l => l.trim()).filter(Boolean).map(escapeHtml);
  }

  function renderPreview() {
    const paper = document.getElementById('resume-paper');
    if (!paper) return;
    const g = id => (document.getElementById('rs-' + id) || {}).value || '';
    const sec = (id) => escLines(g(id)).map(l => `<div class="r-item">${l}</div>`).join('');
    paper.innerHTML = `
      <div class="r-head">
        <div class="r-name">${escapeHtml(g('name')) || '姓名'}</div>
        <div class="r-contact">
          <span>求职意向：${escapeHtml(g('position')) || '—'}</span>
          <span>电话：${escapeHtml(g('phone')) || '—'}</span>
          <span>邮箱：${escapeHtml(g('email')) || '—'}</span>
          <span>现居：${escapeHtml(g('city')) || '—'}</span>
        </div>
      </div>
      ${sec('edu') ? `<div class="r-sec"><div class="r-title">教育经历</div>${sec('edu')}</div>` : ''}
      ${sec('work') ? `<div class="r-sec"><div class="r-title">工作经历</div>${sec('work')}</div>` : ''}
      ${sec('proj') ? `<div class="r-sec"><div class="r-title">项目经验</div>${sec('proj')}</div>` : ''}
      ${sec('skill') ? `<div class="r-sec"><div class="r-title">技能特长</div>${sec('skill')}</div>` : ''}
      ${sec('summary') ? `<div class="r-sec"><div class="r-title">自我评价</div>${escLines(g('summary')).map(l => `<div class="r-para">${l}</div>`).join('')}</div>` : ''}`;
  }

  function pdfFileName() {
    const name = (document.getElementById('rs-name').value || '').trim() || '未命名';
    const pos = (document.getElementById('rs-position').value || '').trim() || '职位';
    return `${name}_${pos}_${todayStr()}`;
  }

  async function genPDF() {
    const name = (document.getElementById('rs-name').value || '').trim();
    const pos = (document.getElementById('rs-position').value || '').trim();
    if (!name || !pos) { toast('请先填写姓名和应聘职位（用于命名 PDF）', 'warn'); return; }
    try { await Promise.all([ensureLib('html2canvas'), ensureLib('jspdf')]); }
    catch (e) { toast('PDF 组件加载失败，请检查网络', 'err'); return; }

    const paper = document.getElementById('resume-paper');
    const btn = document.getElementById('rs-gen');
    btn.disabled = true; btn.textContent = '生成中…';
    // 克隆到 body 末尾，脱离预览容器的 transform: scale，保证截图原始尺寸
    const clone = paper.cloneNode(true);
    Object.assign(clone.style, { transform: 'none', position: 'fixed', left: '-99999px', top: '0', boxShadow: 'none', margin: '0' });
    document.body.appendChild(clone);
    try {
      const canvas = await html2canvas(clone, { scale: 2, backgroundColor: '#fbfbfd', useCORS: false });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = 210, pageH = 297;
      const imgH = canvas.height * pageW / canvas.width;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(dataUrl, 'JPEG', 0, 0, pageW, imgH);
      let left = imgH - pageH, pos2 = 0;
      while (left > 0) {
        pos2 -= pageH;
        pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', 0, pos2, pageW, imgH);
        left -= pageH;
      }
      pdf.save(`${name}_${pos}_${todayStr()}.pdf`);
      toast('PDF 已生成');
    } catch (e) {
      toast('生成失败：' + e.message, 'err');
    } finally {
      clone.remove();
      btn.disabled = false; btn.textContent = '生成 PDF（姓名_职位_日期.pdf）';
    }
  }

  function printResume() {
    const name = (document.getElementById('rs-name').value || '').trim();
    const pos = (document.getElementById('rs-position').value || '').trim();
    if (!name || !pos) { toast('请先填写姓名和应聘职位', 'warn'); return; }
    const styleText = document.getElementById('resume-paper-style').textContent;
    const html = document.getElementById('resume-paper').innerHTML;
    const w = window.open('', '_blank');
    if (!w) { toast('浏览器拦截了弹窗，请允许后重试', 'warn'); return; }
    w.document.title = pdfFileName();
    w.document.head.innerHTML = `<style>${styleText} body{background:#fff;margin:0} @page{margin:12mm}</style>`;
    w.document.body.innerHTML = `<div class="resume-paper">${html}</div>`;
    setTimeout(() => { w.focus(); w.print(); }, 300);
  }

  /* ---------- 初始化 ---------- */
  function renderTemplateForm() {
    const box = document.getElementById('rs-fields');
    if (!box || box.dataset.ready) return;
    box.innerHTML = `
      <div class="grid3">
        <label>姓名 *<input id="rs-name" class="input"></label>
        <label>应聘职位 *<input id="rs-position" class="input"></label>
        <label>电话<input id="rs-phone" class="input"></label>
        <label>邮箱<input id="rs-email" class="input"></label>
        <label>现居城市<input id="rs-city" class="input"></label>
      </div>
      ${TEMPLATE_FIELDS.map(([id, label, tip]) => `
        <label class="rs-ta">${label}
          <textarea id="rs-${id}" class="input" rows="${id === 'summary' ? 3 : 4}" placeholder="${tip}"></textarea>
        </label>`).join('')}
      <div class="ops">
        <button class="btn primary" id="rs-gen">生成 PDF（姓名_职位_日期.pdf）</button>
        <button class="btn" id="rs-print">打印 / 另存为 PDF（矢量）</button>
      </div>`;
    box.dataset.ready = '1';
    box.addEventListener('input', renderPreview);
    document.getElementById('rs-gen').addEventListener('click', genPDF);
    document.getElementById('rs-print').addEventListener('click', printResume);
    renderPreview();
  }

  function bind() {
    document.getElementById('rf-upload').addEventListener('click', uploadFiles);
    document.getElementById('rf-list').addEventListener('click', async e => {
      const btn = e.target.closest('[data-op]');
      if (!btn) return;
      const fid = btn.closest('[data-fid]').dataset.fid;
      const op = btn.dataset.op;
      if (op === 'download') opDownload(fid);
      else if (op === 'edit') { editingFileId = fid; renderFiles(); }
      else if (op === 'cancel-edit') { editingFileId = null; renderFiles(); }
      else if (op === 'save-edit') {
        const f = await DB.get('files', fid);
        if (f) {
          f.candidateName = document.getElementById('rf-e-name').value.trim();
          f.position = document.getElementById('rf-e-pos').value.trim();
          f.uploadDate = document.getElementById('rf-e-date').value || f.uploadDate;
          await DB.put('files', f);
        }
        editingFileId = null;
        toast('已保存');
        renderFiles();
      }
      else if (op === 'del') {
        if (!confirm('确认删除这份归档简历？')) return;
        await DB.del('files', fid);
        toast('已删除');
        renderFiles();
      }
    });
    document.getElementById('rf-date').value = todayStr();
    renderFiles();
  }

  window.Resume = { bind, renderTemplateForm, refresh: renderFiles };
})();
