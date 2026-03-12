// app.js (module) — versão completa com:
// ✅ Navegação por hash + :target
// ✅ Firestore realtime (onSnapshot) com status "Online/Erro/Offline"
// ✅ Toast com erro real
// ✅ CRUD em todas as abas
// ✅ Após salvar: limpa formulário e foca no próximo campo
// ✅ Comentários/Respostas: salva e libera preencher de novo
// ✅ Exportar PDF
// ✅ Registros com accordion premium (preview + ler mais + animação)

import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ========= Debug ========= */
console.log("[Catequese] app.js carregou ✅");
window.addEventListener("error", (e) => console.error("[JS ERROR]", e.message, e.error));

/* ========= Helpers ========= */
const $ = (id) => document.getElementById(id);

function toast(msg){
  const el = $("toast");
  if(!el){ alert(msg); return; }
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> el.style.display="none", 2600);
}

function esc(str){
  return String(str ?? "").replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}

function isoToday(){
  const d = new Date();
  const pad = (n)=> String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function includesText(obj, q){
  return JSON.stringify(obj).toLowerCase().includes(q.toLowerCase());
}

function setSync(text){
  const pill = $("syncPill");
  if(pill) pill.textContent = text;
}

/* ========= Collections ========= */
const COL = {
  inicio: "inicio",
  evangelho: "evangelho",
  oracao: "oracao",
  sacramentos: "sacramentos",
  vida: "vida",
  missao: "missao",
  turma: "turma"
};

/* ========= Cache ========= */
const cache = {
  inicio: [],
  evangelho: [],
  oracao: [],
  sacramentos: [],
  vida: [],
  missao: [],
  turma: []
};

const selected = { inicio:null, evangelho:null, vida:null, missao:null };

/* ========= Navegação ========= */
const navItems = Array.from(document.querySelectorAll("#nav .navItem"));
const pageTitle = $("pageTitle");
const pageSubtitle = $("pageSubtitle");

const subtitles = {
  inicio: "Registre a aula e comentários dos alunos.",
  evangelho: "Registre o evangelho/reflexão e comentários dos alunos.",
  oracao: "Registre pedidos e agradecimentos (com causa/intenção).",
  sacramentos: "Registre reflexões e compromissos sobre os sacramentos.",
  vida: "Registre desafios e comentários dos alunos.",
  missao: "Crie perguntas e registre respostas dos alunos.",
  turma: "Cadastre alunos: nome, idade e sacramento."
};

function currentPageKey(){
  const k = (location.hash || "#inicio").replace("#","");
  return k || "inicio";
}

function applyNavState(){
  const key = currentPageKey();

  navItems.forEach(a => a.classList.toggle("active", a.dataset.page === key));

  const active = navItems.find(a => a.dataset.page === key);
  const title = active?.querySelector(".navTitle")?.textContent?.trim() || "Catequese";
  if(pageTitle) pageTitle.textContent = title;
  if(pageSubtitle) pageSubtitle.textContent = subtitles[key] || "";

  document.querySelectorAll(".page").forEach(p => p.classList.remove("isDefault"));

  const hasHash = !!location.hash && location.hash.length > 1;
  const targetId = hasHash ? location.hash.replace("#","") : "";
  const targetExists = targetId ? document.getElementById(targetId) : null;

  if(!hasHash || !targetExists){
    const inicio = document.getElementById("inicio");
    if(inicio) inicio.classList.add("isDefault");
  }

  renderPage(key);
}
window.addEventListener("hashchange", applyNavState);

/* ========= Firestore CRUD ========= */
async function createDoc(col, data){
  const ref = await addDoc(collection(db, col), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

async function updateDocById(col, id, data){
  await updateDoc(doc(db, col, id), {
    ...data,
    updatedAt: serverTimestamp()
  });
  return true;
}

async function deleteDocById(col, id){
  await deleteDoc(doc(db, col, id));
}

async function patchArrayField(col, id, fieldName, nextArray){
  await updateDocById(col, id, { [fieldName]: nextArray });
}

/* ========= Realtime sync ========= */
let firstSync = true;

function subscribeAll(){
  setSync("Sincronizando…");

  const keys = Object.keys(COL);
  let okCount = 0;

  keys.forEach((key)=>{
    const qy = query(collection(db, COL[key]), orderBy("createdAt","desc"));

    onSnapshot(
      qy,
      (snap)=>{
        cache[key] = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        updateProgressUI();

        okCount++;
        if(okCount >= 1){
          setSync("Online ✅");
          firstSync = false;
        }

        const current = currentPageKey();
        if(current === key) renderPage(key);
      },
      (err)=>{
        console.error("[Firestore snapshot error]", key, err);
        const msg = err?.code ? `${err.code}` : "erro";
        setSync(`Erro 🔴 (${msg})`);
        toast(`Falha no Firestore: ${msg}`);
        firstSync = false;
      }
    );
  });

  setTimeout(()=>{
    const pill = $("syncPill")?.textContent || "";
    if(pill.includes("Sincronizando")){
      setSync("Offline/sem acesso 🔴");
      toast("Sem acesso ao Firestore. Verifique regras e se o Firestore foi criado.");
    }
  }, 4000);
}

/* ========= Progresso ========= */
function updateProgressUI(){
  const done = [
    cache.inicio.length,
    cache.evangelho.length,
    cache.oracao.length,
    cache.sacramentos.length,
    cache.vida.length,
    cache.missao.length
  ].filter(n => n > 0).length;

  const t = $("progressText");
  const bar = $("miniBarFill");
  if(t) t.textContent = String(done);
  if(bar) bar.style.width = `${Math.round((done/6)*100)}%`;
}

/* ========= Accordion premium ========= */
function bindRegistroAccordion(container){
  if(!container) return;

  const registros = container.querySelectorAll(".registro");

  registros.forEach((registro) => {
    const header = registro.querySelector(".registroHeader");
    const lerMaisBtn = registro.querySelector(".registroLerMais");

    const toggleRegistro = () => {
      const isOpen = registro.classList.contains("open");

      registros.forEach(r => r.classList.remove("open"));

      if(!isOpen){
        registro.classList.add("open");
      }
    };

    if(header){
      header.onclick = toggleRegistro;
    }

    if(lerMaisBtn){
      lerMaisBtn.onclick = (e) => {
        e.stopPropagation();
        toggleRegistro();
      };
    }
  });
}

/* ========= Router ========= */
function renderPage(page){
  if(page === "inicio") renderInicio();
  if(page === "evangelho") renderEvangelho();
  if(page === "oracao") renderOracao();
  if(page === "sacramentos") renderSacramentos();
  if(page === "vida") renderVida();
  if(page === "missao") renderMissao();
  if(page === "turma") renderTurma();
}

/* ========= Select helper ========= */
function fillSelect(selectEl, items, labelFn, selectedId){
  if(!selectEl) return null;

  selectEl.innerHTML = "";
  if(items.length === 0){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sem registros ainda";
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return null;
  }

  selectEl.disabled = false;

  items.forEach(it=>{
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = labelFn(it);
    selectEl.appendChild(opt);
  });

  const exists = selectedId && items.some(i => i.id === selectedId);
  selectEl.value = exists ? selectedId : items[0].id;
  return selectEl.value;
}

/* ========= Comment panel ========= */
function renderCommentPanel({ type, colName, arrayField, targetSelect, hintEl, formEl, nameEl, textEl, listEl, labelFn }){
  const items = cache[type];

  const chosen = fillSelect(targetSelect, items, labelFn, selected[type]);
  selected[type] = chosen;

  const hasItems = items.length > 0;
  if(hintEl){
    hintEl.textContent = hasItems
      ? "Escolha o registro e adicione comentários."
      : "Crie um registro acima para liberar comentários.";
  }

  if(formEl) [...formEl.elements].forEach(el => el.disabled = !hasItems);

  if(!listEl) return;

  listEl.innerHTML = "";
  if(!hasItems){
    listEl.innerHTML = `<div class="item"><div class="itemBody">Sem registros para comentar ainda.</div></div>`;
    return;
  }

  const parent = items.find(x => x.id === chosen);
  if(!parent) return;

  const comments = parent[arrayField] || [];

  if(comments.length === 0){
    listEl.innerHTML = `<div class="item"><div class="itemBody">Nenhum comentário ainda.</div></div>`;
  }else{
    listEl.innerHTML = comments.map((c, idx)=> `
      <div class="comment">
        <div>
          <strong>${esc(c.nome)}</strong>
          <div class="commentText">${esc(c.comentario)}</div>
        </div>
        <div class="commentRight">
          <button class="actionLink" type="button" data-action="edit" data-idx="${idx}">editar</button>
          <button class="actionLink danger" type="button" data-action="del" data-idx="${idx}">excluir</button>
        </div>
      </div>
    `).join("");
  }

  if(targetSelect){
    targetSelect.onchange = () => {
      selected[type] = targetSelect.value || null;
      renderCommentPanel({ type, colName, arrayField, targetSelect, hintEl, formEl, nameEl, textEl, listEl, labelFn });
    };
  }

  if(formEl){
    formEl.onsubmit = async (e)=>{
      e.preventDefault();
      if(!hasItems) return;

      const nome = (nameEl?.value || "").trim();
      const comentario = (textEl?.value || "").trim();

      if(!nome || !comentario){
        toast("Preencha nome e comentário.");
        return;
      }

      const next = [...comments, { nome, comentario, createdAt: Date.now() }];

      try{
        await patchArrayField(colName, parent.id, arrayField, next);
        if(nameEl) nameEl.value = "";
        if(textEl) textEl.value = "";
        if(nameEl) nameEl.focus();
        toast("Salvo ✅");
      }catch(err){
        console.error(err);
        toast("Erro ao salvar.");
      }
    };
  }

  listEl.querySelectorAll('[data-action="del"]').forEach(btn=>{
    btn.onclick = async ()=>{
      const idx = Number(btn.getAttribute("data-idx"));
      if(!confirm("Excluir comentário?")) return;

      const next = comments.filter((_, i)=> i !== idx);
      try{
        await patchArrayField(colName, parent.id, arrayField, next);
        toast("Excluído.");
      }catch(err){
        console.error(err);
        toast("Erro ao excluir.");
      }
    };
  });

  listEl.querySelectorAll('[data-action="edit"]').forEach(btn=>{
    btn.onclick = async ()=>{
      const idx = Number(btn.getAttribute("data-idx"));
      const c = comments[idx];
      const novo = prompt("Editar comentário:", c?.comentario ?? "");
      if(novo === null) return;

      const txt = novo.trim();
      if(!txt){
        toast("Comentário vazio.");
        return;
      }

      const next = comments.map((x,i)=> i===idx ? { ...x, comentario: txt, editedAt: Date.now() } : x);
      try{
        await patchArrayField(colName, parent.id, arrayField, next);
        toast("Atualizado.");
      }catch(err){
        console.error(err);
        toast("Erro ao atualizar.");
      }
    };
  });
}

/* ========= INÍCIO ========= */
if($("inicioData")) $("inicioData").value = isoToday();

if($("inicioCancelar")){
  $("inicioCancelar").onclick = ()=>{
    $("inicioEditId").value = "";
    $("formInicio").reset();
    $("inicioData").value = isoToday();
  };
}

if($("inicioBusca")) $("inicioBusca").addEventListener("input", renderInicio);

if($("formInicio")){
  $("formInicio").addEventListener("submit", async (e)=>{
    e.preventDefault();

    const date = $("inicioData").value;
    const tema = $("inicioTema").value.trim();
    const texto = $("inicioTexto").value.trim();

    if(!date || !tema || !texto){
      toast("Preencha data, tema e texto.");
      return;
    }

    const id = $("inicioEditId").value;

    try{
      if(id){
        await updateDocById(COL.inicio, id, { date, tema, texto });
        toast("Aula atualizada ✅");
      }else{
        const newId = await createDoc(COL.inicio, { date, tema, texto, comments: [] });
        console.log("Criado no Firestore:", newId);
        toast("Aula salva ✅ (Firestore)");
      }

      $("inicioEditId").value = "";
      $("formInicio").reset();
      $("inicioData").value = isoToday();
      $("inicioTema").focus();

    }catch(err){
      console.error(err);
      toast(`Erro ao salvar aula: ${err?.code || "erro"}`);
      setSync(`Erro 🔴 (${err?.code || "erro"})`);
    }
  });
}

function renderInicio(){
  const q = ($("inicioBusca")?.value || "").trim().toLowerCase();
  const items = cache.inicio.filter(it => !q || includesText(it, q));
  const box = $("inicioLista");
  if(!box) return;

  box.innerHTML = items.length ? items.map(it=> `
    <div class="registro">
      <div class="registroHeader">
        <div class="registroInfo">
          <div class="registroTitulo">${esc(it.tema)}</div>
          <div class="registroMeta">${esc(it.date)} • ${(it.comments||[]).length} comentário(s)</div>
        </div>
        <div class="registroArrow">⌄</div>
      </div>

      <div class="registroPreview">${esc(it.texto)}</div>

      <div class="registroConteudoWrap">
        <div class="registroConteudoInner">
          <div class="registroConteudo">${esc(it.texto)}</div>
        </div>
      </div>

      <div class="registroFooter">
        <button class="registroLerMais" type="button"></button>

        <div class="itemActions">
          <button class="actionLink" type="button" data-edit="${esc(it.id)}">editar</button>
          <button class="actionLink danger" type="button" data-del="${esc(it.id)}">excluir</button>
        </div>
      </div>
    </div>
  `).join("") : `<div class="item"><div class="itemBody">Nenhuma aula ainda.</div></div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-edit");
      const it = cache.inicio.find(x=> x.id === id);
      if(!it) return;
      $("inicioData").value = it.date || isoToday();
      $("inicioTema").value = it.tema || "";
      $("inicioTexto").value = it.texto || "";
      $("inicioEditId").value = it.id;
      selected.inicio = it.id;
      toast("Editando…");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.getAttribute("data-del");
      if(!confirm("Excluir esta aula e seus comentários?")) return;
      try{
        await deleteDocById(COL.inicio, id);
        toast("Aula excluída.");
      }catch(err){
        console.error(err);
        toast(`Erro ao excluir: ${err?.code || "erro"}`);
      }
    };
  });

  renderCommentPanel({
    type: "inicio",
    colName: COL.inicio,
    arrayField: "comments",
    targetSelect: $("inicioCommentTarget"),
    hintEl: $("inicioCommentHint"),
    formEl: $("inicioCommentForm"),
    nameEl: $("inicioAlunoNome"),
    textEl: $("inicioAlunoComentario"),
    listEl: $("inicioCommentList"),
    labelFn: (it)=> `${it.date} — ${it.tema}`
  });
}

/* ========= EVANGELHO ========= */
if($("evData")) $("evData").value = isoToday();

if($("evCancelar")){
  $("evCancelar").onclick = ()=>{
    $("evEditId").value = "";
    $("formEvangelho").reset();
    $("evData").value = isoToday();
  };
}

if($("evBusca")) $("evBusca").addEventListener("input", renderEvangelho);

if($("formEvangelho")){
  $("formEvangelho").addEventListener("submit", async (e)=>{
    e.preventDefault();

    const date = $("evData").value;
    const ref = $("evRef").value.trim();
    const texto = $("evTexto").value.trim();

    if(!date || !texto){
      toast("Preencha data e texto.");
      return;
    }

    const id = $("evEditId").value;

    try{
      if(id){
        await updateDocById(COL.evangelho, id, { date, ref, texto });
        toast("Evangelho atualizado ✅");
      }else{
        const newId = await createDoc(COL.evangelho, { date, ref, texto, comments: [] });
        console.log("Criado no Firestore:", newId);
        toast("Evangelho salvo ✅ (Firestore)");
      }

      $("evEditId").value = "";
      $("formEvangelho").reset();
      $("evData").value = isoToday();
      $("evRef").focus();

    }catch(err){
      console.error(err);
      toast(`Erro ao salvar evangelho: ${err?.code || "erro"}`);
      setSync(`Erro 🔴 (${err?.code || "erro"})`);
    }
  });
}

function renderEvangelho(){
  const q = ($("evBusca")?.value || "").trim().toLowerCase();
  const items = cache.evangelho.filter(it => !q || includesText(it, q));
  const box = $("evLista");
  if(!box) return;

  box.innerHTML = items.length ? items.map(it=> `
    <div class="registro">
      <div class="registroHeader">
        <div class="registroInfo">
          <div class="registroTitulo">${esc(it.ref ? `Evangelho — ${it.ref}` : "Evangelho")}</div>
          <div class="registroMeta">${esc(it.date)} • ${(it.comments||[]).length} comentário(s)</div>
        </div>
        <div class="registroArrow">⌄</div>
      </div>

      <div class="registroPreview">${esc(it.texto)}</div>

      <div class="registroConteudoWrap">
        <div class="registroConteudoInner">
          <div class="registroConteudo">${esc(it.texto)}</div>
        </div>
      </div>

      <div class="registroFooter">
        <button class="registroLerMais" type="button"></button>

        <div class="itemActions">
          <button class="actionLink" type="button" data-edit="${esc(it.id)}">editar</button>
          <button class="actionLink danger" type="button" data-del="${esc(it.id)}">excluir</button>
        </div>
      </div>
    </div>
  `).join("") : `<div class="item"><div class="itemBody">Nenhum evangelho ainda.</div></div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-edit");
      const it = cache.evangelho.find(x=> x.id === id);
      if(!it) return;
      $("evData").value = it.date || isoToday();
      $("evRef").value = it.ref || "";
      $("evTexto").value = it.texto || "";
      $("evEditId").value = it.id;
      selected.evangelho = it.id;
      toast("Editando…");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.getAttribute("data-del");
      if(!confirm("Excluir este registro e seus comentários?")) return;
      try{
        await deleteDocById(COL.evangelho, id);
        toast("Excluído.");
      }catch(err){
        console.error(err);
        toast(`Erro ao excluir: ${err?.code || "erro"}`);
      }
    };
  });

  renderCommentPanel({
    type: "evangelho",
    colName: COL.evangelho,
    arrayField: "comments",
    targetSelect: $("evCommentTarget"),
    hintEl: $("evCommentHint"),
    formEl: $("evCommentForm"),
    nameEl: $("evAlunoNome"),
    textEl: $("evAlunoComentario"),
    listEl: $("evCommentList"),
    labelFn: (it)=> `${it.date}${it.ref ? ` — ${it.ref}` : ""}`
  });
}

/* ========= ORAÇÃO ========= */
if($("orData")) $("orData").value = isoToday();

if($("orCancelar")){
  $("orCancelar").onclick = ()=>{
    $("orEditId").value = "";
    $("formOracao").reset();
    $("orData").value = isoToday();
    $("orTipo").value = "Pedido";
  };
}

if($("orBusca")) $("orBusca").addEventListener("input", renderOracao);

if($("formOracao")){
  $("formOracao").addEventListener("submit", async (e)=>{
    e.preventDefault();

    const date = $("orData").value;
    const tipo = $("orTipo").value;
    const causa = $("orCausa").value.trim();
    const texto = $("orTexto").value.trim();

    if(!date || !tipo || !causa){
      toast("Preencha data, tipo e causa.");
      return;
    }

    const id = $("orEditId").value;

    try{
      if(id){
        await updateDocById(COL.oracao, id, { date, tipo, causa, texto });
        toast("Oração atualizada ✅");
      }else{
        const newId = await createDoc(COL.oracao, { date, tipo, causa, texto });
        console.log("Criado no Firestore:", newId);
        toast("Oração salva ✅ (Firestore)");
      }

      $("orEditId").value = "";
      $("formOracao").reset();
      $("orData").value = isoToday();
      $("orTipo").value = "Pedido";
      $("orCausa").focus();

    }catch(err){
      console.error(err);
      toast(`Erro ao salvar oração: ${err?.code || "erro"}`);
      setSync(`Erro 🔴 (${err?.code || "erro"})`);
    }
  });
}

function renderOracao(){
  const q = ($("orBusca")?.value || "").trim().toLowerCase();
  const items = cache.oracao.filter(it => !q || includesText(it, q));
  const box = $("orLista");
  if(!box) return;

  box.innerHTML = items.length ? items.map(it=> `
    <div class="registro">
      <div class="registroHeader">
        <div class="registroInfo">
          <div class="registroTitulo">${esc(`${it.tipo} — ${it.causa}`)}</div>
          <div class="registroMeta">${esc(it.date)}</div>
        </div>
        <div class="registroArrow">⌄</div>
      </div>

      <div class="registroPreview">${esc(it.texto || "(sem detalhes)")}</div>

      <div class="registroConteudoWrap">
        <div class="registroConteudoInner">
          <div class="registroConteudo">${esc(it.texto || "(sem detalhes)")}</div>
        </div>
      </div>

      <div class="registroFooter">
        <button class="registroLerMais" type="button"></button>

        <div class="itemActions">
          <button class="actionLink" type="button" data-edit="${esc(it.id)}">editar</button>
          <button class="actionLink danger" type="button" data-del="${esc(it.id)}">excluir</button>
        </div>
      </div>
    </div>
  `).join("") : `<div class="item"><div class="itemBody">Nenhuma oração ainda.</div></div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-edit");
      const it = cache.oracao.find(x=> x.id === id);
      if(!it) return;
      $("orData").value = it.date || isoToday();
      $("orTipo").value = it.tipo || "Pedido";
      $("orCausa").value = it.causa || "";
      $("orTexto").value = it.texto || "";
      $("orEditId").value = it.id;
      toast("Editando…");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.getAttribute("data-del");
      if(!confirm("Excluir este registro?")) return;
      try{
        await deleteDocById(COL.oracao, id);
        toast("Excluído.");
      }catch(err){
        console.error(err);
        toast(`Erro ao excluir: ${err?.code || "erro"}`);
      }
    };
  });
}

/* ========= SACRAMENTOS ========= */
if($("saData")) $("saData").value = isoToday();

if($("saCancelar")){
  $("saCancelar").onclick = ()=>{
    $("saEditId").value = "";
    $("formSac").reset();
    $("saData").value = isoToday();
  };
}

if($("saBusca")) $("saBusca").addEventListener("input", renderSacramentos);

if($("formSac")){
  $("formSac").addEventListener("submit", async (e)=>{
    e.preventDefault();

    const date = $("saData").value;
    const nome = $("saNome").value.trim();
    const texto = $("saTexto").value.trim();

    if(!date || !texto){
      toast("Preencha data e reflexão.");
      return;
    }

    const id = $("saEditId").value;

    try{
      if(id){
        await updateDocById(COL.sacramentos, id, { date, nome, texto });
        toast("Atualizado ✅");
      }else{
        const newId = await createDoc(COL.sacramentos, { date, nome, texto });
        console.log("Criado no Firestore:", newId);
        toast("Salvo ✅ (Firestore)");
      }

      $("saEditId").value = "";
      $("formSac").reset();
      $("saData").value = isoToday();
      $("saNome").focus();

    }catch(err){
      console.error(err);
      toast(`Erro ao salvar: ${err?.code || "erro"}`);
      setSync(`Erro 🔴 (${err?.code || "erro"})`);
    }
  });
}

function renderSacramentos(){
  const q = ($("saBusca")?.value || "").trim().toLowerCase();
  const items = cache.sacramentos.filter(it => !q || includesText(it, q));
  const box = $("saLista");
  if(!box) return;

  box.innerHTML = items.length ? items.map(it=> `
    <div class="registro">
      <div class="registroHeader">
        <div class="registroInfo">
          <div class="registroTitulo">${esc(it.nome ? `Sacramento — ${it.nome}` : "Sacramentos")}</div>
          <div class="registroMeta">${esc(it.date)}</div>
        </div>
        <div class="registroArrow">⌄</div>
      </div>

      <div class="registroPreview">${esc(it.texto)}</div>

      <div class="registroConteudoWrap">
        <div class="registroConteudoInner">
          <div class="registroConteudo">${esc(it.texto)}</div>
        </div>
      </div>

      <div class="registroFooter">
        <button class="registroLerMais" type="button"></button>

        <div class="itemActions">
          <button class="actionLink" type="button" data-edit="${esc(it.id)}">editar</button>
          <button class="actionLink danger" type="button" data-del="${esc(it.id)}">excluir</button>
        </div>
      </div>
    </div>
  `).join("") : `<div class="item"><div class="itemBody">Nenhum registro ainda.</div></div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-edit");
      const it = cache.sacramentos.find(x=> x.id === id);
      if(!it) return;
      $("saData").value = it.date || isoToday();
      $("saNome").value = it.nome || "";
      $("saTexto").value = it.texto || "";
      $("saEditId").value = it.id;
      toast("Editando…");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.getAttribute("data-del");
      if(!confirm("Excluir este registro?")) return;
      try{
        await deleteDocById(COL.sacramentos, id);
        toast("Excluído.");
      }catch(err){
        console.error(err);
        toast(`Erro ao excluir: ${err?.code || "erro"}`);
      }
    };
  });
}

/* ========= VIDA ========= */
if($("viData")) $("viData").value = isoToday();

if($("viCancelar")){
  $("viCancelar").onclick = ()=>{
    $("viEditId").value = "";
    $("formVida").reset();
    $("viData").value = isoToday();
  };
}

if($("viBusca")) $("viBusca").addEventListener("input", renderVida);

if($("formVida")){
  $("formVida").addEventListener("submit", async (e)=>{
    e.preventDefault();

    const date = $("viData").value;
    const desafio = $("viDesafio").value.trim();
    const afasta = $("viAfasta").value.trim();
    const plano = $("viPlano").value.trim();

    if(!date || !desafio || !afasta){
      toast("Preencha data, desafio e o que afasta.");
      return;
    }

    const id = $("viEditId").value;

    try{
      if(id){
        await updateDocById(COL.vida, id, { date, desafio, afasta, plano });
        toast("Atualizado ✅");
      }else{
        const newId = await createDoc(COL.vida, { date, desafio, afasta, plano, comments: [] });
        console.log("Criado no Firestore:", newId);
        toast("Salvo ✅ (Firestore)");
      }

      $("viEditId").value = "";
      $("formVida").reset();
      $("viData").value = isoToday();
      $("viDesafio").focus();

    }catch(err){
      console.error(err);
      toast(`Erro ao salvar: ${err?.code || "erro"}`);
      setSync(`Erro 🔴 (${err?.code || "erro"})`);
    }
  });
}

function renderVida(){
  const q = ($("viBusca")?.value || "").trim().toLowerCase();
  const items = cache.vida.filter(it => !q || includesText(it, q));
  const box = $("viLista");
  if(!box) return;

  box.innerHTML = items.length ? items.map(it=> `
    <div class="registro">
      <div class="registroHeader">
        <div class="registroInfo">
          <div class="registroTitulo">${esc(`Desafio — ${it.desafio}`)}</div>
          <div class="registroMeta">${esc(it.date)} • ${(it.comments||[]).length} comentário(s)</div>
        </div>
        <div class="registroArrow">⌄</div>
      </div>

      <div class="registroPreview">${esc(`O que afasta: ${it.afasta}\n\nPlano: ${it.plano || "(não definido)"}`)}</div>

      <div class="registroConteudoWrap">
        <div class="registroConteudoInner">
          <div class="registroConteudo">${esc(`O que afasta: ${it.afasta}\n\nPlano: ${it.plano || "(não definido)"}`)}</div>
        </div>
      </div>

      <div class="registroFooter">
        <button class="registroLerMais" type="button"></button>

        <div class="itemActions">
          <button class="actionLink" type="button" data-edit="${esc(it.id)}">editar</button>
          <button class="actionLink danger" type="button" data-del="${esc(it.id)}">excluir</button>
        </div>
      </div>
    </div>
  `).join("") : `<div class="item"><div class="itemBody">Nenhum registro ainda.</div></div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-edit");
      const it = cache.vida.find(x=> x.id === id);
      if(!it) return;
      $("viData").value = it.date || isoToday();
      $("viDesafio").value = it.desafio || "";
      $("viAfasta").value = it.afasta || "";
      $("viPlano").value = it.plano || "";
      $("viEditId").value = it.id;
      selected.vida = it.id;
      toast("Editando…");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.getAttribute("data-del");
      if(!confirm("Excluir este registro e seus comentários?")) return;
      try{
        await deleteDocById(COL.vida, id);
        toast("Excluído.");
      }catch(err){
        console.error(err);
        toast(`Erro ao excluir: ${err?.code || "erro"}`);
      }
    };
  });

  renderCommentPanel({
    type: "vida",
    colName: COL.vida,
    arrayField: "comments",
    targetSelect: $("viCommentTarget"),
    hintEl: $("viCommentHint"),
    formEl: $("viCommentForm"),
    nameEl: $("viAlunoNome"),
    textEl: $("viAlunoComentario"),
    listEl: $("viCommentList"),
    labelFn: (it)=> `${it.date} — ${it.desafio}`
  });
}

/* ========= MISSÃO ========= */
if($("miData")) $("miData").value = isoToday();

if($("miCancelar")){
  $("miCancelar").onclick = ()=>{
    $("miEditId").value = "";
    $("formMissao").reset();
    $("miData").value = isoToday();
  };
}

if($("miBusca")) $("miBusca").addEventListener("input", renderMissao);

if($("formMissao")){
  $("formMissao").addEventListener("submit", async (e)=>{
    e.preventDefault();

    const date = $("miData").value;
    const pergunta = $("miPergunta").value.trim();

    if(!date || !pergunta){
      toast("Preencha data e pergunta.");
      return;
    }

    const id = $("miEditId").value;

    try{
      if(id){
        await updateDocById(COL.missao, id, { date, pergunta });
        toast("Pergunta atualizada ✅");
      }else{
        const newId = await createDoc(COL.missao, { date, pergunta, respostas: [] });
        console.log("Criado no Firestore:", newId);
        toast("Pergunta salva ✅ (Firestore)");
      }

      $("miEditId").value = "";
      $("formMissao").reset();
      $("miData").value = isoToday();
      $("miPergunta").focus();

    }catch(err){
      console.error(err);
      toast(`Erro ao salvar pergunta: ${err?.code || "erro"}`);
      setSync(`Erro 🔴 (${err?.code || "erro"})`);
    }
  });
}

function renderMissao(){
  const q = ($("miBusca")?.value || "").trim().toLowerCase();
  const items = cache.missao.filter(it => !q || includesText(it, q));
  const box = $("miLista");
  if(!box) return;

  box.innerHTML = items.length ? items.map(it=> `
    <div class="registro">
      <div class="registroHeader">
        <div class="registroInfo">
          <div class="registroTitulo">${esc(it.pergunta)}</div>
          <div class="registroMeta">${esc(it.date)} • ${(it.respostas||[]).length} resposta(s)</div>
        </div>
        <div class="registroArrow">⌄</div>
      </div>

      <div class="registroPreview">${esc(`Pergunta da missão: ${it.pergunta}`)}</div>

      <div class="registroConteudoWrap">
        <div class="registroConteudoInner">
          <div class="registroConteudo">${esc(`Pergunta da missão: ${it.pergunta}`)}</div>
        </div>
      </div>

      <div class="registroFooter">
        <button class="registroLerMais" type="button"></button>

        <div class="itemActions">
          <button class="actionLink" type="button" data-edit="${esc(it.id)}">editar</button>
          <button class="actionLink danger" type="button" data-del="${esc(it.id)}">excluir</button>
        </div>
      </div>
    </div>
  `).join("") : `<div class="item"><div class="itemBody">Nenhuma missão ainda.</div></div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-edit");
      const it = cache.missao.find(x=> x.id === id);
      if(!it) return;
      $("miData").value = it.date || isoToday();
      $("miPergunta").value = it.pergunta || "";
      $("miEditId").value = it.id;
      selected.missao = it.id;
      toast("Editando…");
      window.scrollTo({ top: 0, behavior: "smooth" });
      renderMissaoReplies();
    };
  });

  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.getAttribute("data-del");
      if(!confirm("Excluir essa pergunta e todas as respostas?")) return;
      try{
        await deleteDocById(COL.missao, id);
        toast("Pergunta excluída.");
      }catch(err){
        console.error(err);
        toast(`Erro ao excluir: ${err?.code || "erro"}`);
      }
    };
  });

  renderMissaoReplies();
}

function renderMissaoReplies(){
  const hintEl = $("miReplyHint");
  const targetSelect = $("miReplyTarget");
  const formEl = $("miReplyForm");
  const nameEl = $("miAlunoNome");
  const textEl = $("miAlunoComentario");
  const listEl = $("miReplyList");

  const items = cache.missao;
  const chosen = fillSelect(targetSelect, items, (it)=> `${it.date} — ${it.pergunta}`, selected.missao);
  selected.missao = chosen;

  const hasItems = items.length > 0;
  if(hintEl){
    hintEl.textContent = hasItems
      ? "Escolha a pergunta e registre as respostas."
      : "Crie uma pergunta acima para liberar respostas.";
  }

  if(formEl) [...formEl.elements].forEach(el => el.disabled = !hasItems);

  if(!listEl) return;

  listEl.innerHTML = "";
  if(!hasItems){
    listEl.innerHTML = `<div class="item"><div class="itemBody">Sem perguntas ainda.</div></div>`;
    return;
  }

  const parent = items.find(x => x.id === chosen);
  if(!parent) return;

  const replies = parent.respostas || [];

  if(replies.length === 0){
    listEl.innerHTML = `<div class="item"><div class="itemBody">Nenhuma resposta ainda.</div></div>`;
  }else{
    listEl.innerHTML = replies.map((r, idx)=> `
      <div class="comment">
        <div>
          <strong>${esc(r.nome)}</strong>
          <div class="commentText">${esc(r.comentario)}</div>
        </div>
        <div class="commentRight">
          <button class="actionLink" type="button" data-action="edit" data-idx="${idx}">editar</button>
          <button class="actionLink danger" type="button" data-action="del" data-idx="${idx}">excluir</button>
        </div>
      </div>
    `).join("");
  }

  if(targetSelect){
    targetSelect.onchange = () => {
      selected.missao = targetSelect.value || null;
      renderMissaoReplies();
    };
  }

  if(formEl){
    formEl.onsubmit = async (e)=>{
      e.preventDefault();
      if(!hasItems) return;

      const nome = (nameEl?.value || "").trim();
      const comentario = (textEl?.value || "").trim();

      if(!nome || !comentario){
        toast("Preencha nome e comentário.");
        return;
      }

      const next = [...replies, { nome, comentario, createdAt: Date.now() }];

      try{
        await patchArrayField(COL.missao, parent.id, "respostas", next);
        if(nameEl) nameEl.value = "";
        if(textEl) textEl.value = "";
        if(nameEl) nameEl.focus();
        toast("Resposta salva ✅");
      }catch(err){
        console.error(err);
        toast(`Erro ao salvar resposta: ${err?.code || "erro"}`);
      }
    };
  }

  listEl.querySelectorAll('[data-action="del"]').forEach(btn=>{
    btn.onclick = async ()=>{
      const idx = Number(btn.getAttribute("data-idx"));
      if(!confirm("Excluir resposta?")) return;

      const next = replies.filter((_, i)=> i !== idx);
      try{
        await patchArrayField(COL.missao, parent.id, "respostas", next);
        toast("Resposta excluída.");
      }catch(err){
        console.error(err);
        toast(`Erro ao excluir: ${err?.code || "erro"}`);
      }
    };
  });

  listEl.querySelectorAll('[data-action="edit"]').forEach(btn=>{
    btn.onclick = async ()=>{
      const idx = Number(btn.getAttribute("data-idx"));
      const r = replies[idx];
      const novo = prompt("Editar resposta:", r?.comentario ?? "");
      if(novo === null) return;

      const txt = novo.trim();
      if(!txt){
        toast("Resposta vazia.");
        return;
      }

      const next = replies.map((x,i)=> i===idx ? { ...x, comentario: txt, editedAt: Date.now() } : x);
      try{
        await patchArrayField(COL.missao, parent.id, "respostas", next);
        toast("Resposta atualizada.");
      }catch(err){
        console.error(err);
        toast(`Erro ao atualizar: ${err?.code || "erro"}`);
      }
    };
  });
}

/* ========= TURMA ========= */
if($("tuCancelar")){
  $("tuCancelar").onclick = ()=>{
    $("tuEditId").value = "";
    $("formTurma").reset();
  };
}

if($("tuBusca")) $("tuBusca").addEventListener("input", renderTurma);

if($("formTurma")){
  $("formTurma").addEventListener("submit", async (e)=>{
    e.preventDefault();

    const nome = $("tuNome").value.trim();
    const idade = Number($("tuIdade").value);
    const sacramento = $("tuSacramento").value.trim();

    if(!nome || nome.length < 2){
      toast("Nome precisa ter pelo menos 2 letras.");
      return;
    }
    if(!Number.isFinite(idade) || idade <= 0){
      toast("Idade inválida.");
      return;
    }
    if(!sacramento){
      toast("Preencha o sacramento.");
      return;
    }

    const id = $("tuEditId").value;

    try{
      if(id){
        await updateDocById(COL.turma, id, { nome, idade, sacramento });
        toast("Aluno atualizado ✅");
      }else{
        const newId = await createDoc(COL.turma, { nome, idade, sacramento });
        console.log("Criado no Firestore:", newId);
        toast("Aluno salvo ✅ (Firestore)");
      }

      $("tuEditId").value = "";
      $("formTurma").reset();
      $("tuNome").focus();

    }catch(err){
      console.error(err);
      toast(`Erro ao salvar aluno: ${err?.code || "erro"}`);
      setSync(`Erro 🔴 (${err?.code || "erro"})`);
    }
  });
}

function renderTurma(){
  const q = ($("tuBusca")?.value || "").trim().toLowerCase();
  const items = cache.turma.filter(it => !q || includesText(it, q));
  const box = $("tuLista");
  if(!box) return;

box.innerHTML = items.length ? items.map(it=> `
  <div class="registro">
    <div class="registroHeader">
      <div class="registroInfo">
        <div class="registroTitulo">${esc(it.nome)}</div>
        <div class="registroMeta">Idade: ${esc(it.idade)} • Sacramento: ${esc(it.sacramento)}</div>
      </div>
      <div class="registroArrow">⌄</div>
    </div>

    <div class="registroConteudoWrap">
      <div class="registroConteudoInner">
        <div class="registroConteudo">
Aluno: ${esc(it.nome)}
Idade: ${esc(it.idade)}
Sacramento: ${esc(it.sacramento)}
        </div>
      </div>
    </div>

    <div class="registroFooter">
      <button class="registroLerMais" type="button"></button>

      <div class="itemActions">
        <button class="actionLink" type="button" data-edit="${esc(it.id)}">editar</button>
        <button class="actionLink danger" type="button" data-del="${esc(it.id)}">excluir</button>
      </div>
    </div>
  </div>
`).join("") : `<div class="item"><div class="itemBody">Nenhum aluno cadastrado ainda.</div></div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-edit");
      const it = cache.turma.find(x=> x.id === id);
      if(!it) return;
      $("tuNome").value = it.nome || "";
      $("tuIdade").value = it.idade ?? "";
      $("tuSacramento").value = it.sacramento || "";
      $("tuEditId").value = it.id;
      toast("Editando aluno…");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.getAttribute("data-del");
      if(!confirm("Excluir aluno?")) return;
      try{
        await deleteDocById(COL.turma, id);
        toast("Aluno excluído.");
      }catch(err){
        console.error(err);
        toast(`Erro ao excluir: ${err?.code || "erro"}`);
      }
    };
  });
}

/* ========= PDF ========= */
if($("pdfBtn")){
  $("pdfBtn").onclick = ()=>{
    if(!location.hash) location.hash = "#inicio";
    applyNavState();
    toast("Gerando PDF da aba atual…");
    setTimeout(()=> window.print(), 300);
  };
}

/* ========= Boot ========= */
if(!location.hash) location.hash = "#inicio";
applyNavState();
subscribeAll();

