/* HR工具箱 - 公共工具：本地存储 / IndexedDB / 日期 / toast / 文件下载 / JSON 导入导出 / CDN 兜底 */
(function () {
  'use strict';

  /* ---------- localStorage 封装 ---------- */
  const LS = {
    get(key, def) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
    remove(key) { localStorage.removeItem(key); }
  };

  /* ---------- 通用工具 ---------- */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  const todayStr = () => fmtDate(new Date());

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg, type) {
    let el = document.getElementById('hr-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hr-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'show ' + (type === 'err' ? 'err' : type === 'warn' ? 'warn' : 'ok');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 2600);
  }

  /* ---------- 文件下载 ---------- */
  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- IndexedDB（简历文件存 Blob）---------- */
  const DB = {
    _db: null,
    open() {
      if (this._db) return Promise.resolve(this._db);
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('hrtoolbox', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        };
        req.onsuccess = () => { this._db = req.result; resolve(this._db); };
        req.onerror = () => reject(req.error);
      });
    },
    async put(store, obj) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(obj);
        tx.oncomplete = () => res(obj);
        tx.onerror = () => rej(tx.error);
      });
    },
    async get(store, id) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const rq = db.transaction(store, 'readonly').objectStore(store).get(id);
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
    },
    async all(store) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const rq = db.transaction(store, 'readonly').objectStore(store).getAll();
        rq.onsuccess = () => res(rq.result || []);
        rq.onerror = () => rej(rq.error);
      });
    },
    async del(store, id) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(id);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    }
  };

  /* ---------- 第三方库 CDN 兜底（本地 vendor 缺失时在线加载）---------- */
  const CDN = {
    xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
    jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
    html2canvas: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
  };
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res();
      s.onerror = () => rej(new Error('加载失败: ' + src));
      document.head.appendChild(s);
    });
  }
  async function ensureLib(name) {
    if (name === 'xlsx' && typeof XLSX !== 'undefined') return;
    if (name === 'jspdf' && window.jspdf && window.jspdf.jsPDF) return;
    if (name === 'html2canvas' && window.html2canvas) return;
    await loadScript(CDN[name]);
  }

  /* ---------- 全量 JSON 导入 / 导出 ---------- */
  function exportJSON() {
    const payload = {
      app: 'hr-toolbox',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        candidates: LS.get('hr_candidates', []),
        todos: LS.get('hr_todos', []),
        links: LS.get('hr_links', [])
      }
    };
    download(`HR工具箱备份_${todayStr()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast('已导出 JSON 备份');
  }

  function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const payload = JSON.parse(reader.result);
          if (!payload || payload.app !== 'hr-toolbox' || !payload.data) {
            throw new Error('文件格式不正确（不是 HR工具箱 的备份文件）');
          }
          if (payload.version !== 1) throw new Error('备份版本不支持：v' + payload.version);
          resolve(payload.data);
        } catch (e) { reject(e); }
      };
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file, 'utf-8');
    });
  }

  /* 暴露全局命名空间 */
  window.HR = {
    LS, DB, uid, fmtDate, todayStr, escapeHtml, fmtSize, toast,
    download, ensureLib, exportJSON, importJSON
  };
})();
