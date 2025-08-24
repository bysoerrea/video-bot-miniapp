// ====== State global (revisi) ======
let currentPage = 1;
// khusus Latest
let currentHashtag = "";
// input pencarian, hanya mempengaruhi Latest
let isLoading = false;

const currentPageByTab = {
    latest: 1,
    best: 1,
    movies: 1
};
const totalPagesByTab = {
    latest: 1,
    best: 1,
    movies: 1
};
const hashtagByTab = {
    latest: "",
    best: "best",
    movies: "full"
};
const seenIdsByTab = {
    latest: new Set(),
    best: new Set(),
    movies: new Set()
};

let currentPlayingItem = null;

// Parent untuk delegasi event
const videoSection = document.querySelector(".video-section");
const topError = document.getElementById("topError");

// Optional (loader boleh null di layout sekarang)
const loader = document.getElementById("loader");

// === Lazy Loading Thumbnail Observer ===
const thumbObserver = new IntersectionObserver( (entries, obs) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const imgEl = entry.target;
            const fid = imgEl.closest('.item')?.dataset.thumb;
            if (fid) {
                loadThumbToImage(fid, imgEl);
            }
            obs.unobserve(imgEl);
            // stop observe setelah load
        }
    }
    );
}
,{
    rootMargin: "200px 0px",
    // load lebih awal ~200px sebelum terlihat
    threshold: 0.1
});

function renderError(msg) {
    if (!topError)
        return;
    topError.textContent = msg;
    topError.style.display = "block";
    setTimeout( () => {
        topError.style.display = "none";
    }
    , 4000);
}

function renderToTab(tabName, items, append=false) {
    const container = document.querySelector(`.tab-content[data-tab="${tabName}"]`);
    if (!container)
        return;

    if (!append)
        container.innerHTML = "";

    const seen = seenIdsByTab[tabName] || (seenIdsByTab[tabName] = new Set());
    const html = [];

    for (const v of (items || [])) {
        const uid = v.uniqueId || v.file_unique_id || "";
        // Hanya anti-duplikasi DI DALAM tab yang sama
        if (uid && seen.has(uid))
            continue;
        if (uid)
            seen.add(uid);
        html.push(itemHTML(v));
    }

    if (html.length === 0 && !append && container.children.length === 0) {
        container.innerHTML = (tabName === "latest") ? "😔 Tidak ada video." : "😔 Tidak ada video untuk kategori ini.";
        return;
    }

    if (html.length > 0) {
        container.insertAdjacentHTML("beforeend", html.join(""));
    }

    // Pasang AR & thumbnail untuk item baru
    const newItems = container.querySelectorAll('.item:not([data-ar])');
    newItems.forEach(item => {
        // Tetap set AR awal
        applyInitialAspectRatio(item);

        const imgEl = item.querySelector('.thumb');
        if (imgEl) {
            thumbObserver.observe(imgEl);
            // <-- DAFTARKAN untuk lazy load
        }

        // Fallback AR jika data-w/h tak ada
        initAspectFromThumb(item);
        item.dataset.ar = '1';
    }
    );

    patchClickableHashtags(container);
}

function buildUrl(page, hashtag) {
    const initData = tg.initData || "";
    const hs = hashtag || "";
    const limit = 10;
    // tetap 10
    return `${BASE_URL}?action=getvideos&page=${page}&limit=${limit}&hashtag=${encodeURIComponent(hs)}&initData=${encodeURIComponent(initData)}`;
}

async function fetchVideosForTab({tabName, page=1, hashtag="", append=false}) {
    const container = document.querySelector(`.tab-content[data-tab="${tabName}"]`);
    if (!container)
        return;
    console.log(`[fetchVideosForTab] tabName=${tabName} page=${page} hashtag="${hashtag}" append=${append}`);

    if (!append) {
        // reset seen set untuk tab ini saat refresh penuh
        seenIdsByTab[tabName] = new Set();
    }

    const url = buildUrl(page, hashtag);
 console.log("[fetchVideosForTab] URL backend:", url);
    try {
        const res = await fetch(url);
        const txt = await res.text();
        let data;
        try {
            data = JSON.parse(txt);
        } catch {
            if (!append)
                container.innerHTML = `<div class="error">❌ Respon server bukan JSON valid.</div>`;
            return;
        }

        if (!data.success) {
            if (!append)
                container.innerHTML = `<div class="error">❌ ${escapeHtml(data.error || "Error server")}</div>`;
            return;
        }

        totalPagesByTab[tabName] = data.totalPages || 1;
        const items = Array.isArray(data.data) ? data.data : [];

        renderToTab(tabName, items, append);
    } catch (err) {
        if (!append)
            container.innerHTML = `<div class="error">❌ ${escapeHtml(err.message || "Gagal memuat")}</div>`;
    }
}

async function initialLoad() {
    Object.keys(currentPageByTab).forEach(tab => {
        currentPageByTab[tab] = 1;
        totalPagesByTab[tab] = 1;
        seenIdsByTab[tab].clear();
    }
    );

    setLoading(false);

    await Promise.all([fetchVideosForTab({
        tabName: "latest",
        page: 1,
        hashtag: hashtagByTab.latest
    }), fetchVideosForTab({
        tabName: "best",
        page: 1,
        hashtag: hashtagByTab.best
    }), fetchVideosForTab({
        tabName: "movies",
        page: 1,
        hashtag: hashtagByTab.movies
    }), ]);

    clearLoading();
}

//====
function showTabLoader(tabName) {
    const loaderEl = document.querySelector(`.tab-content[data-tab="${tabName}"] .tab-loader`);
    if (loaderEl)
        loaderEl.style.display = "block";
}

function hideTabLoader(tabName) {
    const loaderEl = document.querySelector(`.tab-content[data-tab="${tabName}"] .tab-loader`);
    if (loaderEl)
        loaderEl.style.display = "none";
}

//=====

document.querySelectorAll('.tab-nav button').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.tab;

        document.querySelectorAll('.tab-nav button').forEach(b => b.classList.toggle('active', b === btn));

        document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.dataset.tab === target));
    }
    );
}
);

const THUMB_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyXwDQzx31tpoE6gw55aNoAw57o6j9H6RYEY8EaA2HCY34cq74uI_8KrFv36W9wpHo/exec?action=thumb';
async function loadThumbToImage(idOrUrl, imgEl, placeholderUrl) {
    try {
        const initData = tg?.initData || "";
        console.log(`[ThumbLoader] Start. raw=`, idOrUrl);

        // 1) Tentukan URL endpoint yang benar
        let urlObj;
        if (/^https?:\/\//i.test(idOrUrl)) {
            // idOrUrl sudah berupa URL dari backend (v.thumbnail)
            urlObj = new URL(idOrUrl);
            console.log(`[ThumbLoader] Dapat URL dari backend.`, urlObj.href);
        } else {
            // idOrUrl adalah file_id → validasi ringan lalu bangun URL ke GAS
            const safeIdPattern = /^[a-zA-Z0-9_-]{10,100}$/;
            if (!safeIdPattern.test(idOrUrl)) {
                console.warn(`[ThumbLoader] file_id tidak valid. Fallback placeholder.`);
                imgEl.src = placeholderUrl;
                return;
            }
            urlObj = new URL(`${BASE_URL}?action=thumb&file_id=${encodeURIComponent(idOrUrl)}`);
            console.log(`[ThumbLoader] Bangun URL dari file_id.`, urlObj.href);
        }

        // 2) Tambahkan initData selalu (wajib untuk backend yang aman)
        if (initData) {
            urlObj.searchParams.set('initData', initData);
        }

        // 3) Cek cache
        const cacheKey = ( () => {
            const fid = urlObj.searchParams.get('file_id');
            return fid ? `thumb:${fid}` : `thumb:url:${urlObj.href}`;
        }
        )();
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            console.log(`[ThumbLoader] Cache hit. render dari sessionStorage.`);
            imgEl.src = `data:image/jpeg;base64,${cached}`;

            // 🌟 PATCH → update dataset agar stopItem pakai base64
            const itemEl = imgEl.closest('.item');
            if (itemEl) {
                itemEl.dataset.thumb = imgEl.src;
            }
            return;
        }

        // 4) Fetch JSON ke backend GAS
        console.log(`[ThumbLoader] Fetch → ${urlObj.href}`);
        const res = await fetch(urlObj.href, {
            method: 'GET'
        });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);

        // 5) Parse & validasi
        const {ok, mime, base64} = await res.json();
        const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!ok || !allowedMimes.includes(mime) || !base64 || base64.length > 300_000) {
            throw new Error('Validasi thumbnail gagal');
        }

        // 6) Render, cache, dan update dataset
        imgEl.src = `data:${mime};base64,${base64}`;
        sessionStorage.setItem(cacheKey, base64);

        // 🌟 PATCH → update dataset agar restore selalu base64
        const itemEl = imgEl.closest('.item');
        if (itemEl) {
            itemEl.dataset.thumb = imgEl.src;
        }

        console.log(`[ThumbLoader] Thumbnail OK, cached & dataset updated.`);
    } catch (err) {
        console.error(`[ThumbLoader] ERROR: ${err.message}`);
        if (placeholderUrl)
            imgEl.src = placeholderUrl;
    }
}

// ====== Telegram context guard ======
const tg = window.Telegram?.WebApp;
if (!tg) {
    document.body.innerHTML = "<h2 style='padding:16px;'>🚫 Halaman ini harus dibuka dari Telegram Mini App.</h2>";
    throw new Error("Telegram WebApp not found");
}
tg.ready();
// ====== State ======

let totalPages = 1;
const seenIds = new Set();
// ====== Elements ======
const videoList = document.getElementById("videoList");
const btnSearch = document.getElementById("btnSearch");
const inputHashtag = document.getElementById("hashtagInput");

// ====== Utils ======
function escapeHtml(s) {
    if (!s)
        return "";
    return s.replace(/[&<>\"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[m]));
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
    if (!bytes || bytes <= 0)
        return '';
    const KB = 1024
      , MB = KB * 1024
      , GB = MB * 1024;
    if (bytes >= GB)
        return (bytes / GB).toFixed(2) + ' GB';
    if (bytes >= MB)
        return (bytes / MB).toFixed(2) + ' MB';
    return Math.round(bytes / KB) + ' KB';
}
function itemHTML(v) {
    const MAX_BYTES = 2 * 1024 * 1024;
    // 2 MB
    const cap = fmtCaption(v.caption);
    const fid = escapeHtml(v.file_id || "");
    const thumbUrl = escapeHtml(v.thumbnail || "");
    const uniqId = escapeHtml(v.file_Unique_Id || "");
    const sizeStr = formatFileSize(v.file_size);

    let chipHtml, playBtnHtml;
    if (v.file_size > MAX_BYTES) {
        // File besar → tampilkan pesan peringatan & tanpa tombol Play
        chipHtml = `<span class="chip error">>2MB!!, cari dengan id di BOT</span>`;
        playBtnHtml = "";
    } else {
        // File aman → chip Ready + tombol Play
        chipHtml = `<span class="chip">Ready</span>`;
        playBtnHtml = `<button class="btn-play">▶️ Play</button>`;
    }

    // ✅ Tambahkan data-w dan data-h untuk simpan dimensi asli video
    return `
    <div class="item" 
         data-fid="${fid}" 
         data-thumb="${thumbUrl}" 
         data-w="${v.width || ''}" 
         data-h="${v.height || ''}">
      <div class="media">
        <img class="thumb" alt="thumbnail" loading="lazy">
      </div>
      <div class="meta">
        <div class="caption">${cap}</div>
        <span class="chip-size">📦 ${sizeStr}</span>
        ${chipHtml}
        ${playBtnHtml}
      </div>
      <button class="unique-id-btn" data-uid="${uniqId}" title="Klik untuk copy id Video">
          🆔 ${uniqId}
      </button>
    </div>
    `;
}

function applyInitialAspectRatio(itemEl) {
    const w = parseInt(itemEl.dataset.w, 10);
    const h = parseInt(itemEl.dataset.h, 10);
    if (w > 0 && h > 0) {
        const mediaEl = itemEl.querySelector('.media');
        if (mediaEl) {
            mediaEl.style.setProperty('--ar', `${w} / ${h}`);
            console.log(`[AR-Init] ${w}x${h} => ${(w / h).toFixed(3)}`);
        }
    }
}

document.addEventListener("click", (e) => {
    if (e.target.classList.contains("hashtag")) {
        e.preventDefault();
        const tag = e.target.dataset.tag || "";

        console.log("[HashtagClick] tag dari caption:", tag);

        const inputEl = document.getElementById("inputHashtag");
        if (inputEl) {
            inputEl.value = tag;
            console.log("[HashtagClick] input field terisi:", inputEl.value);
        }

        applyFilter(tag);
    }
});


function setLoading(append) {
    if (!append) {
        document.querySelectorAll('.tab-content').forEach(c => {
            c.innerHTML = "⏳ Memuat...";
        }
        );
    } else {
        if (loader)
            loader.style.display = "block";
    }
}
function clearLoading() {
    isLoading = false;
    if (loader)
        loader.style.display = "none";
}

// ====== Data fetch & render ======


function applyFilter(tagFromClick = "") {
    const inputEl = document.getElementById("inputHashtag");

    // Ambil keyword dari klik hashtag atau dari input
    let keyword = tagFromClick || (inputEl?.value || "");
    keyword = keyword.toString().trim();

    // Simpan state
    currentHashtag = keyword;
    // Format sesuai backend (tanpa #)
    hashtagByTab.latest = keyword ? `${keyword.replace(/^#/, "")}` : "";

    console.log("[applyFilter] keyword:", keyword);
    console.log("[applyFilter] hashtagByTab.latest:", hashtagByTab.latest);

    // Reset state paging untuk Latest
    currentPageByTab.latest = 1;
    totalPagesByTab.latest = 1;
    seenIdsByTab.latest.clear();

    // Jalankan fetch ke backend untuk tab Latest
    fetchVideosForTab({
        tabName: "latest",
        page: 1,
        hashtag: hashtagByTab.latest,
        append: false
    });

    // 🌟 Update label tab Latest sesuai pencarian
const latestBtn = document.querySelector('.tab-nav button[data-tab="latest"]');
if (latestBtn) {
    if (keyword) {
        // tampilkan hashtag asli dengan # di label, tapi keyword ke backend tetap tanpa #
        latestBtn.textContent = `${keyword.replace(/^#/, "")}`;
    } else {
        // jika kosong, kembalikan ke label default
        latestBtn.textContent = "Latest";
    }
}

    // 🌟 AUTO SWITCH TAB KE LATEST UNTUK MOBILE 🌟
    if (window.innerWidth < 900) {
        // Nonaktifkan semua tombol tab
        document.querySelectorAll('.tab-nav button').forEach(b => b.classList.remove('active'));
        // Aktifkan tombol Latest
        const latestBtn = document.querySelector('.tab-nav button[data-tab="latest"]');
        if (latestBtn) latestBtn.classList.add('active');

        // Sembunyikan semua tab-content
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        // Tampilkan tab-content Latest
        const latestTab = document.querySelector('.tab-content[data-tab="latest"]');
        if (latestTab) latestTab.classList.add('active');
    }
}
function resetLatest() {
    // Kosongkan input
    const inputEl = document.getElementById("inputHashtag");
    if (inputEl) inputEl.value = "";

    currentHashtag = "";
    hashtagByTab.latest = "";

    // Reset state tab Latest
    currentPageByTab.latest = 1;
    totalPagesByTab.latest = 1;
    seenIdsByTab.latest.clear();

    // Fetch ulang data awal Latest (tanpa filter)
    fetchVideosForTab({
        tabName: "latest",
        page: 1,
        hashtag: "",
        append: false
    });

    // Jika di mobile, pastikan user pindah ke tab Latest
    if (window.innerWidth < 900) {
        document.querySelectorAll('.tab-nav button').forEach(b => b.classList.remove('active'));
        const latestBtn = document.querySelector('.tab-nav button[data-tab="latest"]');
        if (latestBtn) latestBtn.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const latestTab = document.querySelector('.tab-content[data-tab="latest"]');
        if (latestTab) latestTab.classList.add('active');
    }
    // Kembalikan nama tab Latest ke default
const latestBtn = document.querySelector('.tab-nav button[data-tab="latest"]');
if (latestBtn) {
    latestBtn.textContent = "Latest";
}

}




// ====== Infinite Scroll dengan loader mini per tab ======
window.addEventListener("scroll", () => {
    if (isLoading)
        return;

    // ==== Mode Mobile (< 900px) ====
    if (window.innerWidth < 900) {
        const activeBtn = document.querySelector('.tab-nav button.active');
        if (!activeBtn)
            return;
        const tabName = activeBtn.dataset.tab;

        const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 120);
        if (!nearBottom)
            return;

        if (currentPageByTab[tabName] >= totalPagesByTab[tabName])
            return;

        isLoading = true;
        currentPageByTab[tabName]++;

        // ⬇ Munculkan loader mini di tab aktif
        showTabLoader(tabName);

        fetchVideosForTab({
            tabName,
            page: currentPageByTab[tabName],
            hashtag: hashtagByTab[tabName],
            append: true
        }).finally( () => {
            hideTabLoader(tabName);
            // ⬅ Sembunyikan loader mini
            clearLoading();
        }
        );

        return;
        // stop di sini untuk mobile
    }

    // ==== Mode Desktop (>= 900px) ====
    document.querySelectorAll('.tab-content').forEach(container => {
        const tabName = container.dataset.tab;
        if (currentPageByTab[tabName] >= totalPagesByTab[tabName])
            return;

        const rect = container.getBoundingClientRect();
        // Cek kalau bawah panel hampir masuk viewport
        if (rect.bottom - window.innerHeight < 120) {
            isLoading = true;
            currentPageByTab[tabName]++;

            // ⬇ Munculkan loader mini di panel ini
            showTabLoader(tabName);

            fetchVideosForTab({
                tabName,
                page: currentPageByTab[tabName],
                hashtag: hashtagByTab[tabName],
                append: true
            }).finally( () => {
                hideTabLoader(tabName);
                // ⬅ Sembunyikan loader mini
                clearLoading();
            }
            );
        }
    }
    );
}
);

function stopCurrentPlaying() {
    if (!currentPlayingItem)
        return;
    stopItem(currentPlayingItem);
    currentPlayingItem = null;
}
function stopItem(item) {
    item.classList.remove("is-playing");
    const media = item.querySelector(".media");
    media.innerHTML = `${previewHTML(item.dataset.thumb)}<span class="badge">UID</span>`;
    const chip = item.querySelector(".chip");
    if (chip)
        chip.textContent = "Ready";
    const btn = item.querySelector(".btn-play");
    if (btn)
        btn.textContent = "▶️ Play";
}
function stripBomAndTrim(s) {
    if (!s)
        return "";
    return s.replace(/^\uFEFF/, "").trim();
}
function tolerantJsonUrlParse(text) {
    const cleaned = stripBomAndTrim(text);
    try {
        const obj = JSON.parse(cleaned);
        if (obj && typeof obj.url === "string" && /^https?:\/\//i.test(obj.url))
            return obj.url;
    } catch (_) {}
    const match = cleaned.match(/{[\\s\\S]*}/);
    if (match) {
        try {
            const obj2 = JSON.parse(match[0]);
            if (obj2 && typeof obj2.url === "string" && /^https?:\/\//i.test(obj2.url))
                return obj2.url;
        } catch (_) {}
    }
    if (/^https?:\/\//i.test(cleaned))
        return cleaned;
    return null;
}
// fungsi debug sementara
// TEMP PANEL DEBUG
function appendDebug(msg) {
    const el = document.getElementById("debugPanel");
    if (el)
        el.textContent += `[${new Date().toISOString()}] ${msg}\n`;
}
async function resolveFileUrl(fid) {
    const cacheKey = `video:${fid}`;
    // 1) Cek cache dulu
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        console.log("[Cache] Video hit:", fid);
        return cached;
        // langsung return data URL base64
    }
    console.log("[Cache] Video MISS, fetch dari backend:", fid);
    // 2) Kalau belum ada di cache, fetch dari backend
    const initData = tg.initData || "";
    const url = `${BASE_URL}?action=playvideo&file_id=${encodeURIComponent(fid)}&initData=${encodeURIComponent(initData)}`;
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok || !data.base64)
        throw new Error(data.error || "fail");
    const dataUrl = `data:${data.mime};base64,${data.base64}`;
    // 3) Simpan ke sessionStorage
    try {
        sessionStorage.setItem(cacheKey, dataUrl);
    } catch (err) {
        console.warn("[Cache] Gagal simpan ke sessionStorage:", err);
    }
    return dataUrl;
}
//end debug sementara
async function playInline(item, fid) {
    try {
        // ✅ Cek tombol Search sebelum disable
        if (typeof btnSearch !== "undefined" && btnSearch) {
            btnSearch.disabled = true;
        }

        stopCurrentPlaying();

        if (!fid || fid.length < 10) {
            renderError("file_id tidak valid dari backend.");
            return;
        }

        const media = item.querySelector(".media");
        const chip = item.querySelector(".chip");
        const btn = item.querySelector(".btn-play");

        if (chip)
            chip.textContent = "Loading...";
        if (btn)
            btn.textContent = "⏳";

        const fileUrl = await resolveFileUrl(fid);
        const poster = item.dataset.thumb || "";
        const thumbFid = item.dataset.thumb || "";

        const videoEl = document.createElement("video");
        videoEl.setAttribute("playsinline", "");
        videoEl.setAttribute("preload", "metadata");
        videoEl.controls = true;
        videoEl.src = fileUrl;
        videoEl.controlsList = "nodownload";
        videoEl.addEventListener("contextmenu", e => e.preventDefault());

        if (poster)
            videoEl.poster = poster;

        item.classList.add("is-playing");

        media.innerHTML = "";
        media.appendChild(videoEl);

        bindAspectFromVideo(videoEl, media);

        if (chip)
            chip.textContent = "Playing";
        if (btn) {
            btn.textContent = "⏹ Stop";
            btn.onclick = () => {
                stopItem(item);
                restoreThumb(null, btn, fid);
            }
            ;
        }

        const playPromise = videoEl.play();
        if (playPromise && typeof playPromise.then === "function") {
            playPromise.catch( () => {}
            );
        }

        videoEl.addEventListener("ended", () => {
            stopItem(item);
            restoreThumb(null, btn, fid);
        }
        );

        videoEl.addEventListener("error", () => {
            renderError("Gagal memutar video.");
            stopItem(item);
            restoreThumb(null, btn, fid);
        }
        );

        currentPlayingItem = item;
    } catch (err) {
        const msg = (err?.message || "").toLowerCase();
        const debugEl = document.getElementById("debugPanel");
        const debugText = debugEl ? debugEl.textContent.toLowerCase() : "";

        if (msg.includes("file is too big") || debugText.includes("file is too big")) {
            const btn = item.querySelector(".btn-play");
            if (btn) {
                btn.replaceWith(Object.assign(document.createElement("span"), {
                    className: "file-big",
                    textContent: "filenya besar, cari dengan ID di BOT"
                }));
            }
            stopItem(item);
            return;
        }

        renderError(err.message || "Tidak bisa memuat video.");
        stopItem(item);
    } finally {
        // ✅ Aktifkan lagi tombol Search bila ada
        if (typeof btnSearch !== "undefined" && btnSearch) {
            btnSearch.disabled = false;
        }
    }
}

// Helper untuk mengembalikan thumbnail + tombol Play
function setDynamicAspectRatio(mediaContainer, w, h, label='') {
    if (w && h) {
        const ar = (w / h).toFixed(6);
        mediaContainer.style.setProperty('--ar', ar);
        console.log(`[AR${label}] ${w}x${h} -> ${ar}`);
    } else {
        console.warn(`[AR${label}] ukuran belum siap`);
        mediaContainer.style.removeProperty('--ar');
    }
}

function playVideo(thumbEl, fileId, mimeType) {
    const itemEl = thumbEl.closest('.item');
    const mediaEl = itemEl.querySelector('.media');

    const videoEl = document.createElement('video');
    videoEl.controls = true;
    videoEl.playsInline = true;
    videoEl.preload = 'metadata';
    videoEl.controlsList = 'nodownload';
    videoEl.src = `/video/${fileId}?initData=${initData}`;

    videoEl.addEventListener('loadedmetadata', () => {
        setDynamicAspectRatio(mediaEl, videoEl.videoWidth, videoEl.videoHeight, '-Video');
    }
    );

    videoEl.addEventListener('ended', () => {
        restoreThumb(itemEl, thumbEl, mediaEl);
    }
    );

    thumbEl.classList.add('fade-out');
    setTimeout( () => {
        mediaEl.innerHTML = '';
        mediaEl.appendChild(videoEl);
        videoEl.play().catch(err => console.error('[Play Error]', err));
    }
    , 400);
}

function restoreThumb(itemEl, thumbEl, mediaEl) {
    mediaEl.innerHTML = '';
    //mediaEl.appendChild(thumbEl);

    if (thumbEl.naturalWidth && thumbEl.naturalHeight) {
        setDynamicAspectRatio(mediaEl, thumbEl.naturalWidth, thumbEl.naturalHeight, '-Thumb');
    } else {//mediaEl.style.removeProperty('--ar');
    }

    thumbEl.classList.remove('fade-out');
    thumbEl.classList.add('fade-in');
    setTimeout( () => thumbEl.classList.remove('fade-in'), 400);
}

/* 🔄 Smart Resize Observer */
let resizeTimeout;
const visibleItems = new Set();

function recalcARForItem(itemEl, labelSuffix) {
    const mediaEl = itemEl.querySelector('.media');
    const videoEl = mediaEl.querySelector('video');
    const thumbEl = mediaEl.querySelector('.thumb');

    if (videoEl && videoEl.videoWidth) {
        setDynamicAspectRatio(mediaEl, videoEl.videoWidth, videoEl.videoHeight, labelSuffix + '-Video');
    } else if (thumbEl && thumbEl.naturalWidth) {
        setDynamicAspectRatio(mediaEl, thumbEl.naturalWidth, thumbEl.naturalHeight, labelSuffix + '-Thumb');
    }
}

function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout( () => {
        visibleItems.forEach(itemEl => recalcARForItem(itemEl, '-Resize'));
    }
    , 150);
}

window.addEventListener('resize', handleResize);

/* 🔍 Observer hanya aktifkan item yang kelihatan */
const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            visibleItems.add(entry.target);
            recalcARForItem(entry.target, '-EnterView');
        } else {
            visibleItems.delete(entry.target);
        }
    }
    );
}
,{
    threshold: 0.1
});

document.querySelectorAll('.item').forEach(item => observer.observe(item));

/* 🔄 Auto adjust AR saat orientasi / resize */
window.addEventListener('resize', () => {
    document.querySelectorAll('.item').forEach(itemEl => {
        const mediaEl = itemEl.querySelector('.media');
        const videoEl = mediaEl.querySelector('video');
        const thumbEl = mediaEl.querySelector('.thumb');

        if (videoEl && videoEl.videoWidth) {
            setDynamicAspectRatio(mediaEl, videoEl.videoWidth, videoEl.videoHeight, '-ResizeVideo');
        } else if (thumbEl && thumbEl.naturalWidth) {
            setDynamicAspectRatio(mediaEl, thumbEl.naturalWidth, thumbEl.naturalHeight, '-ResizeThumb');
        }
    }
    );
}
);

// ==== Aspect Ratio Helpers ====
function setAspectFromMedia(el, w, h) {
    if (w && h)
        el.style.setProperty('--ar', `${w} / ${h}`);
}
function initAspectFromThumb(item) {
    const media = item.querySelector('.media');
    const img = item.querySelector('.thumb');
    if (!media || !img)
        return;
    if (img.complete) {
        setAspectFromMedia(media, img.naturalWidth, img.naturalHeight);
    } else {
        img.addEventListener('load', () => setAspectFromMedia(media, img.naturalWidth, img.naturalHeight), {
            once: true
        });
    }
    // ✅ Pastikan object-fit terjaga (drop-in style)
    img.style.objectFit = 'contain';
}
function bindAspectFromVideo(videoEl, media) {
    videoEl.addEventListener('loadedmetadata', () => setAspectFromMedia(media, videoEl.videoWidth, videoEl.videoHeight));
    // 🔒 Proteksi tambahan:
    videoEl.controlsList = 'nodownload';
    videoEl.addEventListener('contextmenu', e => e.preventDefault());
}

function patchClickableHashtags(scope=document) {
    const hashtagRegex = /#(\w+)/g;

    scope.querySelectorAll('.caption').forEach(captionEl => {
        // Skip kalau sudah pernah diproses
        if (captionEl.dataset.hashtagsProcessed)
            return;

        captionEl.innerHTML = captionEl.textContent.replace(hashtagRegex, (m, tag) => `<span class="hashtag" data-tag="${tag}">${m}</span>`);
        captionEl.dataset.hashtagsProcessed = "true";
    }
    );
}


document.addEventListener("click", (e) => {
    if (e.target.classList.contains("hashtag")) {
        e.preventDefault();
        const tag = e.target.dataset.tag || "";
        console.log("Hashtag diklik:", tag);

        const inputEl = document.getElementById("inputHashtag");
        if (inputEl) inputEl.value = tag;

        applyFilter(tag); // panggil dengan string
    }
});


document.addEventListener("DOMContentLoaded", () => {
    const btnReset = document.getElementById("btnReset");
if (btnReset) {
    btnReset.addEventListener("click", resetLatest);
}

    // Search
    const btnSearch = document.getElementById("btnSearch");
    const inputHashtag = document.getElementById("inputHashtag");

    if (btnSearch) {
    btnSearch.addEventListener("click", () => applyFilter());
}
if (inputHashtag) {
    inputHashtag.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            applyFilter();
        }
    });
}


    // Delegasi tombol Play untuk semua tab
    const videoSection = document.querySelector(".video-section");
    if (videoSection) {
        videoSection.addEventListener("click", (e) => {
            const btn = e.target.closest(".btn-play");
            if (!btn)
                return;

            const item = btn.closest(".item");
            const fid = item?.dataset?.fid;
            if (!fid)
                return renderError("file_id tidak tersedia.");

            if (item.classList.contains("is-playing"))
                return stopItem(item);

            playInline(item, fid);
        }
        );
    }

    // Tab switching (mobile)
    document.querySelectorAll('.tab-nav button').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            document.querySelectorAll('.tab-nav button').forEach(b => b.classList.toggle('active', b === btn));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.dataset.tab === target));
        }
        );
    }
    );

    // Boot: 3 request paralel
    initialLoad();
}
);
