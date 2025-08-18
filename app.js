// ========== CONFIG ==========
const USE_PROXY = true; // bisa di-set false untuk rollback ke mode lama

// ========== UTILS ==========
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtCaption(cap) {
  return escapeHtml(cap || "").replace(/\n/g, "<br>");
}

function getSafeThumbUrl(fid) {
  const initData = tg.initData || "";
  return `${BASE_URL}?action=thumb&file_id=${encodeURIComponent(fid)}&initData=${encodeURIComponent(initData)}`;
}

function getSafeStreamUrl(fid) {
  const initData = tg.initData || "";
  return `${BASE_URL}?action=stream&file_id=${encodeURIComponent(fid)}&initData=${encodeURIComponent(initData)}`;
}

// ========== RENDERER ==========
function previewHTMLByFid(fid) {
  if (fid) {
    const url = USE_PROXY ? getSafeThumbUrl(fid) : escapeHtml(fid);
    return `<img class="thumb" src="${escapeHtml(url)}" alt="thumbnail" loading="lazy">`;
  }
  return `<div class="placeholder">🎬</div>`;
}

function itemHTML(v) {
  const cap = fmtCaption(v.caption);
  const uid = escapeHtml(v.uniqueId || v.file_unique_id || "");
  const fid = escapeHtml(v.file_id || "");
  const thumbFid = escapeHtml(v.thumb_file_id || "");
  const MAX_BYTES = 19 * 1024 * 1024; // ~19 MB limit

  let sizeChip = '';
  if (v.file_size) {
    const mb = (v.file_size / (1024 * 1024)).toFixed(1);
    sizeChip = `<span class="chip">${mb} MB</span>`;
  }

  return `
    <div class="item" data-fid="${fid}" data-uid="${uid}" data-cap="${cap}" data-thumbfid="${thumbFid}">
      <div class="media">
        ${previewHTMLByFid(thumbFid || fid)}
        <span class="badge">UID</span>
      </div>
      <div class="meta">
        <div class="cap">🎬 ${cap}</div>
        <div class="uid">🔔 ${uid}</div>
        <div class="row">
          ${sizeChip}
          <span class="chip">Ready</span>
          <button class="btn-play">▶️ Play</button>
        </div>
      </div>
    </div>
  `;
}

// ========== PLAYER CONTROL ==========
function stopItem(item) {
  item.classList.remove("is-playing");
  const media = item.querySelector(".media");
  const pfid = item.dataset.thumbfid || item.dataset.fid;
  media.innerHTML = `${previewHTMLByFid(pfid)}<span class="badge">UID</span>`;
  const chip = item.querySelector(".chip");
  if (chip) chip.textContent = "Ready";
  const btn = item.querySelector(".btn-play");
  if (btn) btn.textContent = "▶️ Play";
}

function stopCurrentPlaying() {
  document.querySelectorAll(".item.is-playing").forEach(stopItem);
}

async function playInline(item, fid) {
  try {
    btnSearch.disabled = true;
    stopCurrentPlaying();
    if (!fid || fid.length < 10) {
      renderError("file_id tidak valid dari backend.");
      return;
    }
    const media = item.querySelector(".media");
    const chip = item.querySelector(".chip");
    const btn = item.querySelector(".btn-play");
    if (chip) chip.textContent = "Loading...";
    if (btn) btn.textContent = "⏳";

    const fileUrl = USE_PROXY ? getSafeStreamUrl(fid) : await resolveFileUrl(fid);
    const poster = USE_PROXY ? getSafeThumbUrl(item.dataset.thumbfid || fid) : (item.dataset.thumb || "");

    const videoEl = document.createElement("video");
    videoEl.setAttribute("playsinline", "");
    videoEl.setAttribute("preload", "metadata");
    videoEl.controls = true;
    videoEl.src = fileUrl;
    videoEl.controlsList = 'nodownload noplaybackrate';
    videoEl.disablePictureInPicture = true;
    videoEl.addEventListener('contextmenu', e => e.preventDefault());

    if (poster) videoEl.poster = poster;

    media.innerHTML = "";
    media.appendChild(videoEl);
    videoEl.play();

    item.classList.add("is-playing");
    if (chip) chip.textContent = "Playing";
    if (btn) btn.textContent = "⏹ Stop";

    videoEl.addEventListener("ended", () => stopItem(item));
  } catch (err) {
    console.error(err);
    renderError("Gagal memutar video.");
  } finally {
    btnSearch.disabled = false;
  }
}

// ========== BACKEND CALL ==========
async function searchVideos(query) {
  try {
    btnSearch.disabled = true;
    const initData = tg.initData || "";
    const url = `${BASE_URL}?action=getvideos&query=${encodeURIComponent(query)}&initData=${encodeURIComponent(initData)}`;
    const res = await fetch(url);
    const arr = await res.json();
    if (!Array.isArray(arr)) throw new Error("Format respon tidak valid");

    list.innerHTML = arr.map(itemHTML).join("");
    attachEventListeners();
  } catch (err) {
    console.error(err);
    renderError("Gagal mengambil daftar video.");
  } finally {
    btnSearch.disabled = false;
  }
}

// legacy resolver (dipertahankan untuk rollback)
async function resolveFileUrl(fid) {
  const initData = tg.initData || "";
  const url = `${BASE_URL}?action=getfileurl&file_id=${encodeURIComponent(fid)}&initData=${encodeURIComponent(initData)}`;
  const text = await (await fetch(url)).text();
  const parsed = tolerantJsonUrlParse(text);
  if (parsed) return parsed;
  throw new Error("Respon getfileurl tidak valid");
}

// ========== UI HOOKS ==========
function attachEventListeners() {
  document.querySelectorAll(".btn-play").forEach(btn => {
    btn.onclick = e => {
      const item = e.target.closest(".item");
      if (item.classList.contains("is-playing")) {
        stopItem(item);
      } else {
        playInline(item, item.dataset.fid);
      }
    };
  });
}

function renderError(msg) {
  const el = document.getElementById("topError");
  if (el) {
    el.textContent = msg;
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 4000);
  }
}

// ========== INIT ==========
const tg = window.Telegram.WebApp;
const btnSearch = document.getElementById("btnSearch");
const inpSearch = document.getElementById("inpSearch");
const list = document.getElementById("list");

btnSearch.onclick = () => searchVideos(inpSearch.value.trim());

inpSearch.addEventListener("keydown", e => {
  if (e.key === "Enter") searchVideos(inpSearch.value.trim());
});

// opsional auditor kebocoran URL
(function auditLeaks() {
  const patterns = [/api\\.telegram\\.org/i, /t\\.me\\//i, /file\\/bot[A-Za-z0-9:_-]+/i];
  const scan = () => {
    const suspects = [];
    document.querySelectorAll('*').forEach(n => {
      ['src','href','poster','data-thumb','data-thumbfid'].forEach(attr => {
        const val = n.getAttribute && n.getAttribute(attr);
        if (val && patterns.some(p => p.test(val))) suspects.push({ node: n.tagName, attr, val });
      });
    });
    if (suspects.length) console.warn('[LEAK DETECTED]', suspects);
  };
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  scan();
})();
