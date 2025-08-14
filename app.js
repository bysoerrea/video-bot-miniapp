const tg = window.Telegram?.WebApp;
if (!tg) {
  document.body.innerHTML = "<h2 style='padding:16px;'>🚫 Harus dibuka dari Telegram Mini App.</h2>";
  throw new Error("Telegram WebApp not found");
}
tg.ready();

let currentPage=1,totalPages=1,currentHashtag="",isLoading=false;
const seenIds=new Set();
let currentPlayingItem=null;

const videoList=document.getElementById("videoList");
const loader=document.getElementById("loader");
const btnSearch=document.getElementById("btnSearch");
const inputHashtag=document.getElementById("hashtagInput");
const topError=document.getElementById("topError");

btnSearch.addEventListener("click", applyFilter);
inputHashtag.addEventListener("keydown", e=>{if(e.key==="Enter") applyFilter();});

function escapeHtml(s){return s?s.replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])):"";}
function fmtCaption(s){return escapeHtml(s||"(tanpa caption)");}
function previewHTML(thumb){return thumb?`<img class="thumb" src="${escapeHtml(thumb)}" loading="lazy">`:`<div class="placeholder">🎬</div>`;}

function itemHTML(v){
  const cap=fmtCaption(v.caption);
  const uid=escapeHtml(v.uniqueId||v.file_unique_id||"");
  const fid=escapeHtml(v.file_id||v.fileId||"");
  let thumbUrl=v.thumbnail||"";
  if(!thumbUrl && v.ThumbFileId){
    const initData=tg.initData||"";
    thumbUrl=`${BASE_URL}?action=getfileurl&file_id=${encodeURIComponent(v.ThumbFileId)}&initData=${encodeURIComponent(initData)}`;
  }
  const thumb=escapeHtml(thumbUrl);
  return `<div class="item" data-fid="${fid}" data-uid="${uid}" data-thumb="${thumb}">
    <div class="media">${previewHTML(thumb)}<span class="badge">UID</span></div>
    <div class="meta">
      <div class="cap">🎬 ${cap}</div>
      <div class="uid">🔔 ${uid}</div>
      <div class="row">
        <span class="chip">Ready</span>
        <button class="btn-play">▶️ Play</button>
      </div>
    </div>
  </div>`;
}

function setLoading(append){if(!append) videoList.innerHTML="⏳ Memuat..."; else loader.style.display="block";}
function clearLoading(){isLoading=false; loader.style.display="none";}
function renderError(msg){topError.textContent=msg; topError.style.display="block"; setTimeout(()=>topError.style.display="none",4000);}

function loadVideos(append=false){
  if(isLoading) return; isLoading=true; setLoading(append);
  const initData=tg.initData||"";
  if(!initData){videoList.innerHTML=`<div class="error">❌ Init data tidak ditemukan</div>`; clearLoading(); return;}
  fetch(`${BASE_URL}?action=getvideos&page=${currentPage}&limit=10&hashtag=${encodeURIComponent(currentHashtag)}&initData=${encodeURIComponent(initData)}`)
    .then(r=>r.text())
    .then(txt=>{
      let data; try{data=JSON.parse(txt);}catch(e){videoList.innerHTML=`<div class="error">JSON Error</div>`;return;}
      if(!data.success){videoList.innerHTML=`<div class="error">${escapeHtml(data.error||"Error server")}</div>`;return;}
      totalPages=data.totalPages||1;
      if(!append) videoList.innerHTML="";
      const html=[];
      for(const v of data.data||[]){
        const uid=v.uniqueId||v.file_unique_id||"";
        if(uid && seenIds.has(uid)) continue;
        if(uid) seenIds.add(uid);
        html.push(itemHTML(v));
      }
      if(html.length===0 && currentPage===1 && seenIds.size===0){videoList.innerHTML="😔 Tidak ada video."; return;}
      if(html.length>0) videoList.insertAdjacentHTML("beforeend", html.join(""));
    })
    .catch(err=>{videoList.innerHTML=`<div class="error">${escapeHtml(err.message)}</div>`;})
    .finally(clearLoading);
}

function applyFilter(){currentHashtag=inputHashtag.value.trim
