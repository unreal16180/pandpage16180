// ===============
// Configuración
// ===============
const MD_PATH = "./content.md";

// Estado
let currentMatches = [];
let currentMatchIndex = -1;

// Elementos
const elContent = document.getElementById("content");
const elLoading = document.getElementById("loading");

const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const btnTools = document.getElementById("btnTools");

const panel = document.getElementById("toolsPanel");
const btnClosePanel = document.getElementById("btnClosePanel");

const searchInput = document.getElementById("searchInput");
const btnFindPrev = document.getElementById("btnFindPrev");
const btnFindNext = document.getElementById("btnFindNext");
const btnClearSearch = document.getElementById("btnClearSearch");

const pageInput = document.getElementById("pageInput");
const btnGoPage = document.getElementById("btnGoPage");

const fontSize = document.getElementById("fontSize");
const fontSizeVal = document.getElementById("fontSizeVal");
const fontWeight = document.getElementById("fontWeight");
const btnReset = document.getElementById("btnReset");

// ===============
// Utilidades
// ===============
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function getLinePx(){
  // aproximación robusta: line-height * font-size
  const fs = parseFloat(getComputedStyle(document.body).fontSize) || 18;
  const lh = parseFloat(getComputedStyle(document.body).lineHeight) || (fs * 1.65);
  // Si lineHeight viene como "normal", parseFloat da NaN:
  const linePx = Number.isFinite(lh) ? lh : fs * 1.65;
  return linePx;
}

function pageStepPx(){
  // Scroll “casi una pantalla”: viewportHeight - 2 líneas
  const vh = window.innerHeight;
  const step = vh - (2 * getLinePx());
  return Math.max(120, step); // mínimo para evitar pasos ridículos
}

function smoothScrollBy(delta){
  window.scrollBy({ top: delta, left: 0, behavior: "smooth" });
}

function scrollToY(y){
  window.scrollTo({ top: y, left: 0, behavior: "smooth" });
}

function escapeHtml(s){
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Markdown simple (sin librerías) -> HTML básico
// Soporta: # ## ###, párrafos, listas -, **negrita**, `code`, bloques ```
// (Es intencionalmente simple para que funcione en GitHub Pages sin dependencias)
function mdToHtml(md){
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let inList = false;
  let inCode = false;
  let codeBuf = [];

  const flushList = () => { if(inList){ html += "</ul>"; inList = false; } };
  const flushCode = () => {
    if(inCode){
      const code = escapeHtml(codeBuf.join("\n"));
      html += `<pre><code>${code}</code></pre>`;
      inCode = false;
      codeBuf = [];
    }
  };

  for (let raw of lines){
    const line = raw.trimEnd();

    // code fences
    if(line.startsWith("```")){
      if(!inCode){
        flushList();
        inCode = true;
        continue;
      }else{
        flushCode();
        continue;
      }
    }
    if(inCode){
      codeBuf.push(raw);
      continue;
    }

    // headings
    if(/^###\s+/.test(line)){
      flushList();
      html += `<h3>${inlineMd(line.replace(/^###\s+/, ""))}</h3>`;
      continue;
    }
    if(/^##\s+/.test(line)){
      flushList();
      html += `<h2>${inlineMd(line.replace(/^##\s+/, ""))}</h2>`;
      continue;
    }
    if(/^#\s+/.test(line)){
      flushList();
      html += `<h1>${inlineMd(line.replace(/^#\s+/, ""))}</h1>`;
      continue;
    }

    // list
    if(/^\-\s+/.test(line)){
      if(!inList){ html += "<ul>"; inList = true; }
      html += `<li>${inlineMd(line.replace(/^\-\s+/, ""))}</li>`;
      continue;
    } else {
      flushList();
    }

    // blank
    if(line.trim() === ""){
      // separa párrafos
      continue;
    }

    // paragraph
    html += `<p>${inlineMd(line)}</p>`;
  }

  flushList();
  flushCode();
  return html;
}

function inlineMd(text){
  // escapa HTML primero
  let s = escapeHtml(text);

  // inline code
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);

  // bold **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, (_, b) => `<strong>${b}</strong>`);

  return s;
}

// Quita resaltados previos
function clearMarks(){
  // Reemplaza <mark class="find">...</mark> por su texto
  const marks = elContent.querySelectorAll("mark.find");
  marks.forEach(m => {
    const text = document.createTextNode(m.textContent || "");
    m.replaceWith(text);
  });
}

// Resalta coincidencias (en nodos de texto) sin romper el HTML
function highlightAll(term){
  clearMarks();
  currentMatches = [];
  currentMatchIndex = -1;

  if(!term) return;

  const needle = term.toLowerCase();
  const walker = document.createTreeWalker(elContent, NodeFilter.SHOW_TEXT, {
    acceptNode(node){
      // ignora inputs/panel (panel no está dentro content) y nodos vacíos
      if(!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      // ignora dentro de <code> y <pre> para no destruir formato
      const p = node.parentElement;
      if(p && (p.closest("code") || p.closest("pre"))) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  while(walker.nextNode()) nodes.push(walker.currentNode);

  for(const node of nodes){
    const text = node.nodeValue;
    const low = text.toLowerCase();
    let idx = 0;

    // si no aparece, sigue
    if(!low.includes(needle)) continue;

    const frag = document.createDocumentFragment();
    while(true){
      const found = low.indexOf(needle, idx);
      if(found === -1){
        frag.appendChild(document.createTextNode(text.slice(idx)));
        break;
      }
      // texto antes
      if(found > idx){
        frag.appendChild(document.createTextNode(text.slice(idx, found)));
      }
      // mark
      const m = document.createElement("mark");
      m.className = "find";
      m.textContent = text.slice(found, found + needle.length);
      frag.appendChild(m);

      currentMatches.push(m);
      idx = found + needle.length;
    }
    node.replaceWith(frag);
  }
}

// Navega coincidencias
function gotoMatch(i){
  if(currentMatches.length === 0) return;

  currentMatchIndex = (i % currentMatches.length + currentMatches.length) % currentMatches.length;
  const el = currentMatches[currentMatchIndex];
  if(!el) return;

  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
}

// “Página” = número de pantallas completas desde el inicio del documento.
// 1 = inicio (scrollTop 0). 2 = +1 viewport, etc.
// Usamos el viewportHeight - 2 líneas para que coincida con los botones prev/next.
function goToPage(n){
  const page = Math.max(1, Math.floor(n));
  const step = pageStepPx();
  const y = (page - 1) * step;
  scrollToY(y);
}

// Persistencia simple en localStorage
function savePrefs(){
  const prefs = {
    fontSize: Number(fontSize.value),
    fontWeight: String(fontWeight.value)
  };
  localStorage.setItem("readerPrefs", JSON.stringify(prefs));
}
function loadPrefs(){
  try{
    const raw = localStorage.getItem("readerPrefs");
    if(!raw) return;
    const prefs = JSON.parse(raw);
    if(prefs.fontSize) fontSize.value = clamp(prefs.fontSize, 14, 26);
    if(prefs.fontWeight) fontWeight.value = String(prefs.fontWeight);
  }catch{}
}
function applyPrefs(){
  document.documentElement.style.setProperty("--font-size", `${fontSize.value}px`);
  document.documentElement.style.setProperty("--font-weight", fontWeight.value);
  fontSizeVal.textContent = String(fontSize.value);
}
function normalizeMdForReading(md) {
  md = md.replace(/\r\n/g, "\n");

  const lines = md.split("\n");
  const out = [];

  let inCode = false;
  let para = "";

  const flushPara = () => {
    const t = para.trim();
    if (t) out.push(t);
    para = "";
  };

  const isHeading = (l) => /^#{1,6}\s+/.test(l);
  const isListItem = (l) => /^\s*[-*+]\s+/.test(l);
  const isFence = (l) => l.trim().startsWith("```");

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (isFence(line)) {
      flushPara();
      out.push(line);
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      out.push(raw);
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      out.push("");
      continue;
    }

    if (isHeading(line) || isListItem(line)) {
      flushPara();
      out.push(line);
      continue;
    }

    if (!para) {
      para = line.trim();
    } else {
      const prev = para;
      const curr = line.trim();

      if (/-$/.test(prev) && /^[a-zA-Z]/.test(curr)) {
        para = prev.replace(/-$/, "") + curr;
      } else {
        para = prev + " " + curr;
      }
    }
  }

  flushPara();
  return out.join("\n").replace(/[ \t]{2,}/g, " ");
}
// ===============
// Cargar Markdown
// ===============
async function loadMarkdown(){
  try{
    const res = await fetch(MD_PATH, { cache: "no-store" });
    if(!res.ok) throw new Error(`No se pudo cargar ${MD_PATH}: ${res.status}`);
    const md = await res.text();
    const cleaned = normalizeMdForReading(md);
    const html = mdToHtml(cleaned);

    elContent.innerHTML = html;
  }catch(err){
    elContent.innerHTML = `
      <p><strong>Error:</strong> ${escapeHtml(String(err.message || err))}</p>
      <p style="color:rgba(233,238,246,.72)">
        Asegúrate de que <code>content.md</code> esté en la misma carpeta que <code>index.html</code>.
        Si estás usando GitHub Pages, espera a que publique y revisa que la ruta sea correcta.
      </p>
    `;
  }
}

// ===============
// Panel UI
// ===============
function openPanel(){
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  // foco al buscador
  setTimeout(() => searchInput.focus(), 0);
}
function closePanel(){
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
}

// cerrar panel tocando fuera (opcional)
document.addEventListener("pointerdown", (e) => {
  if(!panel.classList.contains("open")) return;
  const clickedInside = panel.contains(e.target) || btnTools.contains(e.target);
  if(!clickedInside) closePanel();
});

// ===============
// Eventos
// ===============
btnTools.addEventListener("click", () => {
  if(panel.classList.contains("open")) closePanel();
  else openPanel();
});
btnClosePanel.addEventListener("click", closePanel);

btnPrev.addEventListener("click", () => smoothScrollBy(-pageStepPx()));
btnNext.addEventListener("click", () => smoothScrollBy(pageStepPx()));

// teclado (opcional útil)
document.addEventListener("keydown", (e) => {
  if(e.key === "Escape" && panel.classList.contains("open")) closePanel();

  // Evita secuestrar teclas cuando estás escribiendo
  const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : "";
  const typing = tag === "input" || tag === "textarea" || tag === "select";
  if(typing) return;

  if(e.key === "ArrowRight" || e.key === "PageDown") smoothScrollBy(pageStepPx());
  if(e.key === "ArrowLeft"  || e.key === "PageUp")   smoothScrollBy(-pageStepPx());
});

// Buscar
function doSearch(){
  const term = searchInput.value.trim();
  highlightAll(term);
  gotoMatch(0);
}
searchInput.addEventListener("input", () => {
  // búsqueda “suave” al teclear, sin spamear: pequeño debounce
  window.clearTimeout(searchInput._t);
  searchInput._t = window.setTimeout(doSearch, 180);
});

btnFindNext.addEventListener("click", () => gotoMatch(currentMatchIndex + 1));
btnFindPrev.addEventListener("click", () => gotoMatch(currentMatchIndex - 1));
btnClearSearch.addEventListener("click", () => {
  searchInput.value = "";
  clearMarks();
  currentMatches = [];
  currentMatchIndex = -1;
  searchInput.focus();
});

// Ir a página
btnGoPage.addEventListener("click", () => {
  const n = Number(pageInput.value);
  if(!Number.isFinite(n) || n < 1) return;
  goToPage(n);
});
pageInput.addEventListener("keydown", (e) => {
  if(e.key === "Enter"){
    btnGoPage.click();
  }
});

// Tamaño / Grosor
fontSize.addEventListener("input", () => {
  applyPrefs();
  savePrefs();
});
fontWeight.addEventListener("change", () => {
  applyPrefs();
  savePrefs();
});

btnReset.addEventListener("click", () => {
  fontSize.value = 18;
  fontWeight.value = "400";
  applyPrefs();
  savePrefs();
});

// ===============
// Inicio
// ===============
(async function init(){
  loadPrefs();
  applyPrefs();
  await loadMarkdown();
})();