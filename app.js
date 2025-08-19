// 🔒 Blokir klik kanan di seluruh halaman
  //document.addEventListener('contextmenu', e => e.preventDefault());

  // (Opsional) Blokir shortcut save/inspect umum di desktop
  //document.addEventListener('keydown', e => {
    // Ctrl+S, Ctrl+U, Ctrl+Shift+I, F12
    //if ((e.ctrlKey && ['s', 'u'].includes(e.key.toLowerCase())) ||
      //  (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') ||
        //e.key === 'F12') {
      //e.preventDefault();
    //}
  //});

// ====== Telegram context guard ======
const tg = window.Telegram?.WebApp;
if (!tg) {
  document.body.innerHTML = "<h2 style='padding:16px;'>🚫 Halaman ini harus dibuka dari Telegram Mini App.</h2>";
  throw new Error("Telegram WebApp not found");
}
tg.ready();

// ====== State ======
let currentPage = 1;
let totalPages = 1;
let currentHashtag = "";
let isLoading = false;
const seenIds = new Set();
let currentPlayingItem = null;

// ====== Elements ======
const videoList = document.getElementById("videoList");
const loader = document.getElementById("loader");
const btnSearch = document.getElementById("btnSearch");
const inputHashtag = document.getElementById("hashtagInput");
const topError = document.getElementById("topError");

btnSearch.addEventListener("click", applyFilter);
inputHashtag.addEventListener("keydown", (e) => {
  if (e.key === "Enter") applyFilter();
});

// ====== Utils ======
function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function fmtCaption(s) {
  const cap = s || "(tanpa caption)";
  return escapeHtml(cap);
}
function previewHTML(thumb) {
  if (thumb) {
    return `<img class="thumb" src="${escapeHtml(thumb)}" alt="thumbnail" loading="lazy">`;
  }
  return `<div class="placeholder">🎬</div>`;
}
function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '';
  const KB = 1024, MB = KB * 1024, GB = MB * 1024;
  if (bytes >= GB) return (bytes / GB).toFixed(2) + ' GB';
  if (bytes >= MB) return (bytes / MB).toFixed(2) + ' MB';
  return Math.round(bytes / KB) + ' KB';
}
function itemHTML(v) {
  const cap = fmtCaption(v.caption);
  const uid = escapeHtml(v.uniqueId || v.file_unique_id || "");
  const fid = escapeHtml(v.file_id || "");
  const thumb = escapeHtml(v.thumbnail || "");

  const MAX_BYTES = 19 * 1024 * 1024; // 50 MB limit
  let sizeChip = '';
  let statusChip = '';
  let playBtn = '';

  if (v.file_size) {
    sizeChip = `<span class="chip-size">📦 ${formatFileSize(v.file_size)}</span>`;
    if (v.file_size > MAX_BYTES) {
      statusChip = `<span class="chip error">File Besar, request di BOT</span>`;
    } else {
      statusChip = `<span class="chip">Ready</span>`;
      playBtn = `<button class="btn-play">▶️ Play</button>`;
    }
  } else {
    // fallback kalau size tidak ada
    statusChip = `<span class="chip">Ready</span>`;
    playBtn = `<button class="btn-play">▶️ Play</button>`;
  }

  return `
    <div class="item" data-fid="${fid}" data-uid="${uid}" data-cap="${cap}" data-thumb="${thumb}">
      <div class="media">
        ${previewHTML(thumb)}
        <span class="badge">UID</span>
      </div>
      <div class="meta">
        <div class="cap">🎬 ${cap}</div>
        <div class="uid">🔔 ${uid}</div>
        <div class="row">
          ${sizeChip}
          ${statusChip}
          ${playBtn}
        </div>
      </div>
    </div>
  `;
}

function setLoading(append) {
  if (!append) {
    videoList.innerHTML = "⏳ Memuat...";
  } else {
    loader.style.display = "block";
  }
}
function clearLoading() {
  isLoading = false;
  loader.style.display = "none";
}
function renderError(msg) {
  topError.textContent = msg;
  topError.style.display = "block";
  setTimeout(() => { topError.style.display = "none"; }, 4000);
}

// ====== Data fetch & render ======
function loadVideos(append = false) {
  if (isLoading) return;
  isLoading = true;
  setLoading(append);

  const initData = tg.initData || "";
  if (!initData) {
    videoList.innerHTML = `<div class="error">❌ Init data Telegram tidak ditemukan. Buka lewat Mini App.</div>`;
    clearLoading();
    return;
  }

  const url = `${BASE_URL}?action=getvideos&page=${currentPage}&limit=10&hashtag=${encodeURIComponent(currentHashtag)}&initData=${encodeURIComponent(initData)}`;
  fetch(url)
    .then(res => res.text())
    .then(txt => {
      let data;
      try { data = JSON.parse(txt); }
      catch (e) {
        videoList.innerHTML = `<div class="error">❌ Respon server bukan JSON valid.</div>`;
        return;
      }
      if (!data.success) {
        videoList.innerHTML = `<div class="error">❌ ${escapeHtml(data.error || "Error server")}</div>`;
        return;
      }
      totalPages = data.totalPages || 1;

      if (!append) videoList.innerHTML = "";

      const items = Array.isArray(data.data) ? data.data : [];
      const html = [];
      for (const v of items) {
        const uid = v.uniqueId || v.file_unique_id || "";
        if (uid && seenIds.has(uid)) continue;
        if (uid) seenIds.add(uid);
        html.push(itemHTML(v));
      }

      if (html.length === 0 && currentPage === 1 && seenIds.size === 0) {
        videoList.innerHTML = "😔 Tidak ada video.";
        return;
      }
      if (html.length > 0) {
        videoList.insertAdjacentHTML("beforeend", html.join(""));
      }
      // Inisialisasi aspect ratio dari thumbnail
const newItems = videoList.querySelectorAll('.item:not([data-ar])');
newItems.forEach(item => {
  initAspectFromThumb(item);
  item.dataset.ar = '1';
});

    })
    .catch(err => {
      videoList.innerHTML = `<div class="error">❌ ${escapeHtml(err.message || "Gagal memuat")}</div>`;
    })
    .finally(clearLoading);
}

function applyFilter() {
  currentHashtag = inputHashtag.value.trim();
  currentPage = 1;
  totalPages = 1;
  seenIds.clear();
  stopCurrentPlaying();
  loadVideos(false);
}

// Infinite scroll
window.addEventListener("scroll", () => {
  if (isLoading) return;
  const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 120);
  if (nearBottom && currentPage < totalPages) {
    currentPage++;
    loadVideos(true);
  }
});

// ====== Inline player ======
videoList.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-play");
  if (!btn) return;
  const item = btn.closest(".item");
  const fid = item?.dataset?.fid;
  if (!fid) {
    renderError("file_id tidak tersedia.");
    return;
  }
  if (item.classList.contains("is-playing")) {
    stopItem(item);
    return;
  }
  playInline(item, fid);
});

function stopCurrentPlaying() {
  if (!currentPlayingItem) return;
  stopItem(currentPlayingItem);
  currentPlayingItem = null;
}

function stopItem(item) {
  item.classList.remove("is-playing");
  const media = item.querySelector(".media");
  media.innerHTML = `${previewHTML(item.dataset.thumb)}<span class="badge">UID</span>`;
  const chip = item.querySelector(".chip");
  if (chip) chip.textContent = "Ready";
  const btn = item.querySelector(".btn-play");
  if (btn) btn.textContent = "▶️ Play";
}
function stripBomAndTrim(s) {
  if (!s) return "";
  return s.replace(/^\uFEFF/, "").trim();
}
function tolerantJsonUrlParse(text) {
  const cleaned = stripBomAndTrim(text);
  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj.url === "string" && /^https?:\/\//i.test(obj.url)) return obj.url;
  } catch (_) {}
  const match = cleaned.match(/{[\\s\\S]*}/);
  if (match) {
    try {
      const obj2 = JSON.parse(match[0]);
      if (obj2 && typeof obj2.url === "string" && /^https?:\/\//i.test(obj2.url)) return obj2.url;
    } catch (_) {}
    }
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return null;
}
// fungsi debug sementara
// TEMP PANEL DEBUG
function appendDebug(msg) {
  const el = document.getElementById("debugPanel");
  if (el) el.textContent += `[${new Date().toISOString()}] ${msg}\n`;
}

async function resolveFileUrl(fid) {
  appendDebug(`START fid=${fid}`);
  const initData = tg.initData || "";
  const url = `${BASE_URL}?action=getfileurl&file_id=${encodeURIComponent(fid)}&initData=${encodeURIComponent(initData)}`;
  appendDebug(`REQ ${url.slice(0,80)}...`);

  const text = await (await fetch(url)).text();
  appendDebug(`RAW[0..200]=${stripBomAndTrim(text).slice(0,200)}`);

  const parsed = tolerantJsonUrlParse(text);
  if (parsed) {
    appendDebug(`OK parsed=${parsed}`);
    return parsed;
  }

  appendDebug(`FAIL parse file url`);
  throw new Error("Respon getfileurl tidak valid");
}
//end debug sementara


async function playInline(item, fid) {
  try {
    btnSearch.disabled = true;
    // Stop player lain
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

    // Dapatkan direct file URL (signed)
    const fileUrl = await resolveFileUrl(fid);

    // Build <video>
    const poster = item.dataset.thumb || "";
    const videoEl = document.createElement("video");
    videoEl.setAttribute("playsinline", "");
    videoEl.setAttribute("preload", "metadata");
    videoEl.controls = true;
    videoEl.src = fileUrl;
    videoEl.controlsList = 'nodownload'; // ⛔ sembunyikan tombol download
    videoEl.addEventListener('contextmenu', e => e.preventDefault()); // ⛔ disable klik kanan

    if (poster) videoEl.poster = poster;

    // Swap UI
    item.classList.add("is-playing");
    media.innerHTML = "";
    media.appendChild(videoEl);
    bindAspectFromVideo(videoEl, media);

    if (chip) chip.textContent = "Playing";
    if (btn) btn.textContent = "⏹ Stop";

    // Auto play (best effort)
    const playPromise = videoEl.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise.catch(() => {/* ignore autoplay block */});
    }

    // Events
    videoEl.addEventListener("ended", () => stopItem(item));
    videoEl.addEventListener("error", () => {
      renderError("Gagal memutar video.");
      stopItem(item);
    });

    // Mark current
    currentPlayingItem = item;
  } catch (err) {
  const msg = (err?.message || "").toLowerCase();

  // 🔹 Deteksi pesan "file is too big" dari backend
  const debugEl = document.getElementById("debugPanel");
  const debugText = debugEl ? debugEl.textContent.toLowerCase() : "";

  if (msg.includes("file is too big") || debugText.includes("file is too big")) {
    // Ganti tombol Play dengan teks
    const btn = item.querySelector(".btn-play");
    if (btn) {
      btn.replaceWith(Object.assign(document.createElement("span"), {
        className: "file-big",
        textContent: ">20MB!!, cari dengan multi Hashtag di bot"
      }));
    }

    // Ubah chip status
    const chip = item.querySelector(".chip");
    if (chip) chip.textContent = "❌ Too large";

    // Stop player / reset media
    stopItem(item);

    // Lewati popup error untuk case ini
    return;
  }

  // Default: error lain tetap lewat jalur lama
  renderError(err.message || "Tidak bisa memuat video.");
  stopItem(item);
} finally {
    btnSearch.disabled = false;
  }
}
// ==== Aspect Ratio Helpers ====
function setAspectFromMedia(el, w, h) {
  if (w && h) el.style.setProperty('--ar', `${w} / ${h}`);
}

function initAspectFromThumb(item) {
  const media = item.querySelector('.media');
  const img = item.querySelector('.thumb');
  if (!media || !img) return;
  if (img.complete) {
    setAspectFromMedia(media, img.naturalWidth, img.naturalHeight);
  } else {
    img.addEventListener('load', () =>
      setAspectFromMedia(media, img.naturalWidth, img.naturalHeight),
      { once: true }
    );
  }
  // ⛔ Disable klik kanan pada thumbnail
  img.addEventListener('contextmenu', e => e.preventDefault());

  // ✅ Pastikan object-fit terjaga (drop-in style)
  img.style.objectFit = 'contain';
}

function bindAspectFromVideo(videoEl, media) {
  videoEl.addEventListener('loadedmetadata', () =>
    setAspectFromMedia(media, videoEl.videoWidth, videoEl.videoHeight)
  );
  // 🔒 Proteksi tambahan:
  videoEl.controlsList = 'nodownload';
  videoEl.addEventListener('contextmenu', e => e.preventDefault());
}


// ====== Boot ======
loadVideos(false);
