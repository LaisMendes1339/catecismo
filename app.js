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

const DELETE_PASSWORD = "442571";

const $ = (id) => document.getElementById(id);

function toast(msg){
  const el = $("toast");
  if(!el){ alert(msg); return; }
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> el.style.display = "none", 2600);
}

function esc(str){
  return String(str ?? "").replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}

function isoToday(){
  const d = new Date();
  const pad = (n)=> String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function formatDateBr(value){
  if(!value) return "-";
  const [y,m,d] = value.split("-");
  return `${d}/${m}/${y}`;
}

function calculateAge(dateString){
  if(!dateString) return "-";
  const birth = new Date(dateString + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function includesText(obj, q){
  return JSON.stringify(obj).toLowerCase().includes(q.toLowerCase());
}

function setSync(text){
  const pill = $("syncPill");
  if(pill) pill.textContent = text;
}

function askDeletePassword(){
  const value = prompt("Digite a senha para excluir este conteúdo:");
  if(value === null) return false;
  if(value !== DELETE_PASSWORD){
    toast("Senha incorreta.");
    return false;
  }
  return true;
}

const COL = {
  inicio: "inicio",
  evangelho: "evangelho",
  oracao: "oracao",
  sacramentos: "sacramentos",
  vida: "vida",
  missao: "missao",
  turma: "turma"
};

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

const navItems = Array.from(document.querySelectorAll("#nav .navItem"));
const pageTitle = $("pageTitle");
const pageSubtitle = $("pageSubtitle");

const subtitles = {
  painel: "Resumo rápido da caminhada catequética.",
  inicio: "Registre a aula e comentários dos alunos.",
  evangelho: "Registre o evangelho/reflexão e comentários dos alunos.",
  oracao: "Registre pedidos e agradecimentos (com causa/intenção).",
  sacramentos: "Registre reflexões e compromissos sobre os sacramentos.",
  vida: "Registre desafios e comentários dos alunos.",
  missao: "Crie perguntas e registre respostas dos alunos.",
  turma: "Cadastre nome, nascimento, sacramento e município."
};

function currentPageKey(){
  const hash = window.location.hash?.replace("#", "").trim();
  if(!hash) return "painel";
  return hash;
}

function applyNavState(){
  const key = currentPageKey();

  navItems.forEach((a) => {
    const isActive = a.dataset.page === key;
    a.classList.toggle("active", isActive);
  });

  const pageNames = {
    painel: "Painel do Encontro",
    inicio: "Início da Fé",
    evangelho: "Evangelho",
    oracao: "Oração",
    sacramentos: "Sacramentos",
    vida: "Vida Cristã",
    missao: "Missão",
    turma: "Catequizandos"
  };

  if(pageTitle) pageTitle.textContent = pageNames[key] || "Catequese";
  if(pageSubtitle) pageSubtitle.textContent = subtitles[key] || "";

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("isDefault");
  });

  const target = document.getElementById(key);

  if(!target){
    const painel = document.getElementById("painel");
    if(painel) painel.classList.add("isDefault");
    if(pageTitle) pageTitle.textContent = "Painel do Encontro";
    if(pageSubtitle) pageSubtitle.textContent = subtitles.painel || "";
    renderPage("painel");
    return;
  }

  renderPage(key);
}
window.addEventListener("hashchange", applyNavState);
navItems.forEach((item) => {
  item.addEventListener("click", () => {
    setTimeout(() => {
      applyNavState();
    }, 0);
  });
});

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
        renderPainel();

        okCount++;
        if(okCount >= 1) setSync("Online ✅");

        const current = currentPageKey();
        if(current === key || current === "painel") renderPage(current);
      },
      (err)=>{
        console.error("[Firestore snapshot error]", key, err);
        const msg = err?.code ? `${err.code}` : "erro";
        setSync(`Erro 🔴 (${msg})`);
        toast(`Falha no Firestore: ${msg}`);
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
  if(bar) bar.style.width = `${Math.round((done / 6) * 100)}%`;

  $("statInicio") && ($("statInicio").textContent = cache.inicio.length);
  $("statEvangelho") && ($("statEvangelho").textContent = cache.evangelho.length);
  $("statMissao") && ($("statMissao").textContent = cache.missao.length);
  $("statTurma") && ($("statTurma").textContent = cache.turma.length);
}

function bindRegistroAccordion(container){
  if(!container) return;

  const registros = container.querySelectorAll(".registro");

  registros.forEach((registro) => {
    const header = registro.querySelector(".registroHeader");
    const lerMaisBtn = registro.querySelector(".registroLerMais");

    const toggleRegistro = () => {
      const isOpen = registro.classList.contains("open");
      registros.forEach(r => r.classList.remove("open"));
      if(!isOpen) registro.classList.add("open");
    };

    if(header) header.onclick = toggleRegistro;
    if(lerMaisBtn){
      lerMaisBtn.onclick = (e) => {
        e.stopPropagation();
        toggleRegistro();
      };
    }
  });
}

function renderPage(page){
  if(page === "painel") renderPainel();
  if(page === "inicio") renderInicio();
  if(page === "evangelho") renderEvangelho();
  if(page === "oracao") renderOracao();
  if(page === "sacramentos") renderSacramentos();
  if(page === "vida") renderVida();
  if(page === "missao") renderMissao();
  if(page === "turma") renderTurma();
}

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

      const next = comments.map((x, i)=> i === idx ? { ...x, comentario: txt, editedAt: Date.now() } : x);

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

function buildRegistroCard({ title, meta, content, editId, deleteId }){
  return `
    <div class="registro">
      <div class="registroHeader">
        <div class="registroInfo">
          <div class="registroTitulo">${esc(title)}</div>
          <div class="registroMeta">${esc(meta)}</div>
        </div>
        <div class="registroArrow">⌄</div>
      </div>

      <div class="registroConteudoWrap">
        <div class="registroConteudoInner">
          <div class="registroConteudo">${esc(content)}</div>
        </div>
      </div>

      <div class="registroFooter">
        <button class="registroLerMais" type="button"></button>
        <div class="itemActions">
          <button class="actionLink" type="button" data-edit="${esc(editId)}">editar</button>
          <button class="actionLink danger" type="button" data-del="${esc(deleteId)}">excluir</button>
        </div>
      </div>
    </div>
  `;
}

/* ========= Painel ========= */
function renderPainel(){
  const resumo = $("painelResumo");
  const ultimos = $("painelUltimos");
  if(!resumo || !ultimos) return;

  const lastInicio = cache.inicio[0];
  const lastEv = cache.evangelho[0];
  const lastMissao = cache.missao[0];
  const totalComentarios =
    cache.inicio.reduce((a,b)=> a + (b.comments?.length || 0), 0) +
    cache.evangelho.reduce((a,b)=> a + (b.comments?.length || 0), 0) +
    cache.vida.reduce((a,b)=> a + (b.comments?.length || 0), 0);

  const totalRespostas =
    cache.missao.reduce((a,b)=> a + (b.respostas?.length || 0), 0);

  resumo.innerHTML = `
    <div class="resumoLinha"><strong>Última aula:</strong> ${lastInicio ? `${esc(lastInicio.tema)} (${formatDateBr(lastInicio.date)})` : "Nenhuma aula registrada."}</div>
    <div class="resumoLinha"><strong>Último evangelho:</strong> ${lastEv ? `${esc(lastEv.ref || "Sem referência")} (${formatDateBr(lastEv.date)})` : "Nenhum evangelho registrado."}</div>
    <div class="resumoLinha"><strong>Última missão:</strong> ${lastMissao ? `${esc(lastMissao.pergunta)} (${formatDateBr(lastMissao.date)})` : "Nenhuma missão registrada."}</div>
    <div class="resumoLinha"><strong>Total de comentários:</strong> ${totalComentarios} | <strong>Total de respostas:</strong> ${totalRespostas}</div>
  `;

  const latest = [
    ...cache.inicio.slice(0,1).map(x => ({
      title: `Aula — ${x.tema}`,
      meta: formatDateBr(x.date),
      text: `${x.objetivo ? `Objetivo: ${x.objetivo}\n\n` : ""}${x.texto}`
    })),
    ...cache.evangelho.slice(0,1).map(x => ({
      title: `Evangelho — ${x.ref || "Sem referência"}`,
      meta: formatDateBr(x.date),
      text: `${x.frase ? `Frase-chave: ${x.frase}\n\n` : ""}${x.texto}`
    })),
    ...cache.missao.slice(0,1).map(x => ({
      title: "Missão da semana",
      meta: formatDateBr(x.date),
      text: `${x.objetivo ? `Objetivo: ${x.objetivo}\n\n` : ""}${x.pergunta}`
    }))
  ];

  ultimos.innerHTML = latest.length
    ? latest.map(item => `
      <div class="registro">
        <div class="registroHeader">
          <div class="registroInfo">
            <div class="registroTitulo">${esc(item.title)}</div>
            <div class="registroMeta">${esc(item.meta)}</div>
          </div>
          <div class="registroArrow">⌄</div>
        </div>

        <div class="registroConteudoWrap">
          <div class="registroConteudoInner">
            <div class="registroConteudo">${esc(item.text)}</div>
          </div>
        </div>

        <div class="registroFooter">
          <button class="registroLerMais" type="button"></button>
        </div>
      </div>
    `).join("")
    : `<div class="item"><div class="itemBody">Ainda não há registros para mostrar.</div></div>`;

  bindRegistroAccordion(ultimos);
}

/* ========= Início ========= */
$("inicioData") && ($("inicioData").value = isoToday());

$("inicioCancelar") && ($("inicioCancelar").onclick = ()=>{
  $("inicioEditId").value = "";
  $("formInicio").reset();
  $("inicioData").value = isoToday();
});

$("inicioBusca") && $("inicioBusca").addEventListener("input", renderInicio);

$("formInicio") && $("formInicio").addEventListener("submit", async (e)=>{
  e.preventDefault();

  const date = $("inicioData").value;
  const tema = $("inicioTema").value.trim();
  const objetivo = $("inicioObjetivo").value.trim();
  const texto = $("inicioTexto").value.trim();

  if(!date || !tema || !texto){
    toast("Preencha data, tema e texto.");
    return;
  }

  const id = $("inicioEditId").value;

  try{
    if(id){
      await updateDocById(COL.inicio, id, { date, tema, objetivo, texto });
      toast("Aula atualizada ✅");
    }else{
      await createDoc(COL.inicio, { date, tema, objetivo, texto, comments: [] });
      toast("Aula salva ✅");
    }

    $("inicioEditId").value = "";
    $("formInicio").reset();
    $("inicioData").value = isoToday();
    $("inicioTema").focus();
  }catch(err){
    console.error(err);
    toast(`Erro ao salvar aula: ${err?.code || "erro"}`);
  }
});

function renderInicio(){
  const q = ($("inicioBusca")?.value || "").trim().toLowerCase();
  const items = cache.inicio.filter(it => !q || includesText(it, q));
  const box = $("inicioLista");
  if(!box) return;

  box.innerHTML = items.length
    ? items.map(it => buildRegistroCard({
        title: it.tema,
        meta: `${formatDateBr(it.date)} • ${(it.comments || []).length} comentário(s)`,
        content: `${it.objetivo ? `Objetivo: ${it.objetivo}\n\n` : ""}${it.texto}`,
        editId: it.id,
        deleteId: it.id
      })).join("")
    : `<div class="item"><div class="itemBody">Nenhuma aula ainda.</div></div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const it = cache.inicio.find(x => x.id === btn.dataset.edit);
      if(!it) return;
      $("inicioData").value = it.date || isoToday();
      $("inicioTema").value = it.tema || "";
      $("inicioObjetivo").value = it.objetivo || "";
      $("inicioTexto").value = it.texto || "";
      $("inicioEditId").value = it.id;
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      if(!askDeletePassword()) return;
      const id = btn.dataset.del;
      try{
        await deleteDocById(COL.inicio, id);
        toast("Aula excluída.");
      }catch(err){
        console.error(err);
        toast("Erro ao excluir.");
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
    labelFn: (it)=> `${formatDateBr(it.date)} — ${it.tema}`
  });
}

/* ========= Evangelho ========= */
$("evData") && ($("evData").value = isoToday());

$("evCancelar") && ($("evCancelar").onclick = ()=>{
  $("evEditId").value = "";
  $("formEvangelho").reset();
  $("evData").value = isoToday();
});

$("evBusca") && $("evBusca").addEventListener("input", renderEvangelho);

$("formEvangelho") && $("formEvangelho").addEventListener("submit", async (e)=>{
  e.preventDefault();

  const date = $("evData").value;
  const ref = $("evRef").value.trim();
  const frase = $("evFrase").value.trim();
  const texto = $("evTexto").value.trim();

  if(!date || !texto){
    toast("Preencha data e texto.");
    return;
  }

  const id = $("evEditId").value;

  try{
    if(id){
      await updateDocById(COL.evangelho, id, { date, ref, frase, texto });
      toast("Evangelho atualizado ✅");
    }else{
      await createDoc(COL.evangelho, { date, ref, frase, texto, comments: [] });
      toast("Evangelho salvo ✅");
    }

    $("evEditId").value = "";
    $("formEvangelho").reset();
    $("evData").value = isoToday();
    $("evRef").focus();
  }catch(err){
    console.error(err);
    toast(`Erro ao salvar evangelho: ${err?.code || "erro"}`);
  }
});

function renderEvangelho(){
  const q = ($("evBusca")?.value || "").trim().toLowerCase();
  const items = cache.evangelho.filter(it => !q || includesText(it, q));
  const box = $("evLista");
  if(!box) return;

  box.innerHTML = items.length
    ? items.map(it => buildRegistroCard({
        title: it.ref ? `Evangelho — ${it.ref}` : "Evangelho",
        meta: `${formatDateBr(it.date)} • ${(it.comments || []).length} comentário(s)`,
        content: `${it.frase ? `Frase-chave: ${it.frase}\n\n` : ""}${it.texto}`,
        editId: it.id,
        deleteId: it.id
      })).join("")
    : `<div class="item"><div class="itemBody">Nenhum evangelho ainda.</div></div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const it = cache.evangelho.find(x => x.id === btn.dataset.edit);
      if(!it) return;
      $("evData").value = it.date || isoToday();
      $("evRef").value = it.ref || "";
      $("evFrase").value = it.frase || "";
      $("evTexto").value = it.texto || "";
      $("evEditId").value = it.id;
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      if(!askDeletePassword()) return;
      try{
        await deleteDocById(COL.evangelho, btn.dataset.del);
        toast("Registro excluído.");
      }catch(err){
        console.error(err);
        toast("Erro ao excluir.");
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
    labelFn: (it)=> `${formatDateBr(it.date)}${it.ref ? ` — ${it.ref}` : ""}`
  });
}

/* ========= Oração ========= */
$("orData") && ($("orData").value = isoToday());

$("orCancelar") && ($("orCancelar").onclick = ()=>{
  $("orEditId").value = "";
  $("formOracao").reset();
  $("orData").value = isoToday();
  $("orTipo").value = "Pedido";
});

$("orBusca") && $("orBusca").addEventListener("input", renderOracao);

$("formOracao") && $("formOracao").addEventListener("submit", async (e)=>{
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
      await createDoc(COL.oracao, { date, tipo, causa, texto });
      toast("Oração salva ✅");
    }

    $("orEditId").value = "";
    $("formOracao").reset();
    $("orData").value = isoToday();
    $("orTipo").value = "Pedido";
    $("orCausa").focus();
  }catch(err){
    console.error(err);
    toast(`Erro ao salvar oração: ${err?.code || "erro"}`);
  }
});

function renderOracao(){
  const q = ($("orBusca")?.value || "").trim().toLowerCase();
  const items = cache.oracao.filter(it => !q || includesText(it, q));
  const box = $("orLista");
  if(!box) return;

  box.innerHTML = items.length
    ? items.map(it => buildRegistroCard({
        title: `${it.tipo} — ${it.causa}`,
        meta: formatDateBr(it.date),
        content: it.texto || "(sem detalhes)",
        editId: it.id,
        deleteId: it.id
      })).join("")
    : `<div class="item"><div class="itemBody">Nenhuma oração ainda.</div></div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const it = cache.oracao.find(x => x.id === btn.dataset.edit);
      if(!it) return;
      $("orData").value = it.date || isoToday();
      $("orTipo").value = it.tipo || "Pedido";
      $("orCausa").value = it.causa || "";
      $("orTexto").value = it.texto || "";
      $("orEditId").value = it.id;
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      if(!askDeletePassword()) return;
      try{
        await deleteDocById(COL.oracao, btn.dataset.del);
        toast("Registro excluído.");
      }catch(err){
        console.error(err);
        toast("Erro ao excluir.");
      }
    };
  });
}

/* ========= Sacramentos ========= */
$("saData") && ($("saData").value = isoToday());

$("saCancelar") && ($("saCancelar").onclick = ()=>{
  $("saEditId").value = "";
  $("formSac").reset();
  $("saData").value = isoToday();
});

$("saBusca") && $("saBusca").addEventListener("input", renderSacramentos);

$("formSac") && $("formSac").addEventListener("submit", async (e)=>{
  e.preventDefault();

  const date = $("saData").value;
  const nome = $("saNome").value.trim();
  const compromisso = $("saCompromisso").value.trim();
  const texto = $("saTexto").value.trim();

  if(!date || !texto){
    toast("Preencha data e reflexão.");
    return;
  }

  const id = $("saEditId").value;

  try{
    if(id){
      await updateDocById(COL.sacramentos, id, { date, nome, compromisso, texto });
      toast("Registro atualizado ✅");
    }else{
      await createDoc(COL.sacramentos, { date, nome, compromisso, texto });
      toast("Registro salvo ✅");
    }

    $("saEditId").value = "";
    $("formSac").reset();
    $("saData").value = isoToday();
    $("saNome").focus();
  }catch(err){
    console.error(err);
    toast(`Erro ao salvar: ${err?.code || "erro"}`);
  }
});

function renderSacramentos(){
  const q = ($("saBusca")?.value || "").trim().toLowerCase();
  const items = cache.sacramentos.filter(it => !q || includesText(it, q));
  const box = $("saLista");
  if(!box) return;

  box.innerHTML = items.length
    ? items.map(it => buildRegistroCard({
        title: it.nome ? `Sacramento — ${it.nome}` : "Sacramentos",
        meta: formatDateBr(it.date),
        content: `${it.compromisso ? `Compromisso: ${it.compromisso}\n\n` : ""}${it.texto}`,
        editId: it.id,
        deleteId: it.id
      })).join("")
    : `<div class="item"><div class="itemBody">Nenhum registro ainda.</div></div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const it = cache.sacramentos.find(x => x.id === btn.dataset.edit);
      if(!it) return;
      $("saData").value = it.date || isoToday();
      $("saNome").value = it.nome || "";
      $("saCompromisso").value = it.compromisso || "";
      $("saTexto").value = it.texto || "";
      $("saEditId").value = it.id;
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      if(!askDeletePassword()) return;
      try{
        await deleteDocById(COL.sacramentos, btn.dataset.del);
        toast("Registro excluído.");
      }catch(err){
        console.error(err);
        toast("Erro ao excluir.");
      }
    };
  });
}

/* ========= Vida cristã ========= */
$("viData") && ($("viData").value = isoToday());

$("viCancelar") && ($("viCancelar").onclick = ()=>{
  $("viEditId").value = "";
  $("formVida").reset();
  $("viData").value = isoToday();
});

$("viBusca") && $("viBusca").addEventListener("input", renderVida);

$("formVida") && $("formVida").addEventListener("submit", async (e)=>{
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
      toast("Registro atualizado ✅");
    }else{
      await createDoc(COL.vida, { date, desafio, afasta, plano, comments: [] });
      toast("Registro salvo ✅");
    }

    $("viEditId").value = "";
    $("formVida").reset();
    $("viData").value = isoToday();
    $("viDesafio").focus();
  }catch(err){
    console.error(err);
    toast(`Erro ao salvar: ${err?.code || "erro"}`);
  }
});

function renderVida(){
  const q = ($("viBusca")?.value || "").trim().toLowerCase();
  const items = cache.vida.filter(it => !q || includesText(it, q));
  const box = $("viLista");
  if(!box) return;

  box.innerHTML = items.length
    ? items.map(it => buildRegistroCard({
        title: `Desafio — ${it.desafio}`,
        meta: `${formatDateBr(it.date)} • ${(it.comments || []).length} comentário(s)`,
        content: `O que afasta: ${it.afasta}\n\nPlano: ${it.plano || "(não definido)"}`,
        editId: it.id,
        deleteId: it.id
      })).join("")
    : `<div class="item"><div class="itemBody">Nenhum registro ainda.</div></div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const it = cache.vida.find(x => x.id === btn.dataset.edit);
      if(!it) return;
      $("viData").value = it.date || isoToday();
      $("viDesafio").value = it.desafio || "";
      $("viAfasta").value = it.afasta || "";
      $("viPlano").value = it.plano || "";
      $("viEditId").value = it.id;
      selected.vida = it.id;
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      if(!askDeletePassword()) return;
      try{
        await deleteDocById(COL.vida, btn.dataset.del);
        toast("Registro excluído.");
      }catch(err){
        console.error(err);
        toast("Erro ao excluir.");
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
    labelFn: (it)=> `${formatDateBr(it.date)} — ${it.desafio}`
  });
}

/* ========= Missão ========= */
$("miData") && ($("miData").value = isoToday());

$("miCancelar") && ($("miCancelar").onclick = ()=>{
  $("miEditId").value = "";
  $("formMissao").reset();
  $("miData").value = isoToday();
});

$("miBusca") && $("miBusca").addEventListener("input", renderMissao);

$("formMissao") && $("formMissao").addEventListener("submit", async (e)=>{
  e.preventDefault();

  const date = $("miData").value;
  const pergunta = $("miPergunta").value.trim();
  const objetivo = $("miObjetivo").value.trim();

  if(!date || !pergunta){
    toast("Preencha data e pergunta.");
    return;
  }

  const id = $("miEditId").value;

  try{
    if(id){
      await updateDocById(COL.missao, id, { date, pergunta, objetivo });
      toast("Pergunta atualizada ✅");
    }else{
      await createDoc(COL.missao, { date, pergunta, objetivo, respostas: [] });
      toast("Pergunta salva ✅");
    }

    $("miEditId").value = "";
    $("formMissao").reset();
    $("miData").value = isoToday();
    $("miPergunta").focus();
  }catch(err){
    console.error(err);
    toast(`Erro ao salvar pergunta: ${err?.code || "erro"}`);
  }
});

function renderMissao(){
  const q = ($("miBusca")?.value || "").trim().toLowerCase();
  const items = cache.missao.filter(it => !q || includesText(it, q));
  const box = $("miLista");
  if(!box) return;

  box.innerHTML = items.length
    ? items.map(it => buildRegistroCard({
        title: it.pergunta,
        meta: `${formatDateBr(it.date)} • ${(it.respostas || []).length} resposta(s)`,
        content: `${it.objetivo ? `Objetivo: ${it.objetivo}\n\n` : ""}Pergunta da missão: ${it.pergunta}`,
        editId: it.id,
        deleteId: it.id
      })).join("")
    : `<div class="item"><div class="itemBody">Nenhuma missão ainda.</div></div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const it = cache.missao.find(x => x.id === btn.dataset.edit);
      if(!it) return;
      $("miData").value = it.date || isoToday();
      $("miPergunta").value = it.pergunta || "";
      $("miObjetivo").value = it.objetivo || "";
      $("miEditId").value = it.id;
      selected.missao = it.id;
      window.scrollTo({ top: 0, behavior: "smooth" });
      renderMissaoReplies();
    };
  });

  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      if(!askDeletePassword()) return;
      try{
        await deleteDocById(COL.missao, btn.dataset.del);
        toast("Pergunta excluída.");
      }catch(err){
        console.error(err);
        toast("Erro ao excluir.");
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
  const chosen = fillSelect(targetSelect, items, (it)=> `${formatDateBr(it.date)} — ${it.pergunta}`, selected.missao);
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

      const next = replies.map((x, i)=> i === idx ? { ...x, comentario: txt, editedAt: Date.now() } : x);

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

/* ========= Turma ========= */
$("tuCancelar") && ($("tuCancelar").onclick = ()=>{
  $("tuEditId").value = "";
  $("formTurma").reset();
});

$("tuBusca") && $("tuBusca").addEventListener("input", renderTurma);

$("formTurma") && $("formTurma").addEventListener("submit", async (e)=>{
  e.preventDefault();

  const nome = $("tuNome").value.trim();
  const nascimento = $("tuNascimento").value;
  const sacramento = $("tuSacramento").value.trim();
  const municipio = $("tuMunicipio").value.trim();

  if(!nome || nome.length < 2){
    toast("Nome precisa ter pelo menos 2 letras.");
    return;
  }
  if(!nascimento){
    toast("Informe a data de nascimento.");
    return;
  }
  if(!sacramento){
    toast("Preencha o sacramento.");
    return;
  }
  if(!municipio){
    toast("Preencha o município.");
    return;
  }

  const id = $("tuEditId").value;

  try{
    if(id){
      await updateDocById(COL.turma, id, { nome, nascimento, sacramento, municipio });
      toast("Catequizando atualizado ✅");
    }else{
      await createDoc(COL.turma, { nome, nascimento, sacramento, municipio });
      toast("Catequizando salvo ✅");
    }

    $("tuEditId").value = "";
    $("formTurma").reset();
    $("tuNome").focus();
  }catch(err){
    console.error(err);
    toast(`Erro ao salvar: ${err?.code || "erro"}`);
  }
});

function renderTurma(){
  const q = ($("tuBusca")?.value || "").trim().toLowerCase();
  const items = cache.turma.filter(it => !q || includesText(it, q));
  const box = $("tuLista");
  if(!box) return;

  box.innerHTML = items.length
    ? items.map(it => buildRegistroCard({
        title: it.nome,
        meta: `Nascimento: ${formatDateBr(it.nascimento)} • Idade: ${calculateAge(it.nascimento)}`,
        content: `Sacramento: ${it.sacramento}\nMunicípio: ${it.municipio}`,
        editId: it.id,
        deleteId: it.id
      })).join("")
    : `<div class="item"><div class="itemBody">Nenhum catequizando cadastrado ainda.</div></div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const it = cache.turma.find(x => x.id === btn.dataset.edit);
      if(!it) return;
      $("tuNome").value = it.nome || "";
      $("tuNascimento").value = it.nascimento || "";
      $("tuSacramento").value = it.sacramento || "";
      $("tuMunicipio").value = it.municipio || "";
      $("tuEditId").value = it.id;
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      if(!askDeletePassword()) return;
      try{
        await deleteDocById(COL.turma, btn.dataset.del);
        toast("Catequizando excluído.");
      }catch(err){
        console.error(err);
        toast("Erro ao excluir.");
      }
    };
  });
}

/* ========= PDF ========= */
$("pdfBtn") && ($("pdfBtn").onclick = ()=>{
  if(!location.hash) location.hash = "#painel";
  applyNavState();
  toast("Gerando PDF da aba atual…");
  setTimeout(()=> window.print(), 300);
});

/* ========= Boot ========= */
if(!location.hash) location.hash = "#painel";
applyNavState();
subscribeAll();

