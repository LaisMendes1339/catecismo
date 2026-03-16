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

/* =========================================================
   CONFIG
========================================================= */

const DELETE_PASSWORD = "061098";
const $ = (id) => document.getElementById(id);

/* =========================================================
   UI HELPERS
========================================================= */

function toast(msg) {
  const el = $("toast");
  if (!el) {
    alert(msg);
    return;
  }

  el.textContent = msg;
  el.style.display = "block";
  el.classList.add("show");

  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.classList.remove("show");
    el.style.display = "none";
  }, 2600);
}

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (s) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[s]));
}

function isoToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateBr(value) {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

function calculateAge(dateString) {
  if (!dateString) return "-";

  const birth = new Date(dateString + "T00:00:00");
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;

  return age;
}

function includesText(obj, q) {
  return JSON.stringify(obj).toLowerCase().includes(q.toLowerCase());
}

function setSync(text) {
  const pill = $("syncPill");
  if (pill) pill.textContent = text;

  const pillMobile = $("syncPillMobile");
  if (pillMobile) pillMobile.textContent = text;
}

/* =========================================================
   MODAIS
========================================================= */

const editModalOverlay = $("editModalOverlay");
const editModalTitle = $("editModalTitle");
const editModalBody = $("editModalBody");
const editModalClose = $("editModalClose");
const editModalCancel = $("editModalCancel");
const editModalSave = $("editModalSave");

const confirmModalOverlay = $("confirmModalOverlay");
const confirmModalText = $("confirmModalText");
const confirmModalClose = $("confirmModalClose");
const confirmModalCancel = $("confirmModalCancel");
const confirmModalConfirm = $("confirmModalConfirm");

let currentEditSaveHandler = null;
let currentDeleteConfirmHandler = null;

function lockScroll() {
  document.body.style.overflow = "hidden";
}

function unlockScroll() {
  document.body.style.overflow = "";
}

function closeEditModal() {
  if (!editModalOverlay) return;
  editModalOverlay.hidden = true;
  editModalOverlay.onkeydown = null;
  if (editModalBody) editModalBody.innerHTML = "";
  currentEditSaveHandler = null;
  unlockScroll();
}

function closeConfirmModal() {
  if (!confirmModalOverlay) return;
  confirmModalOverlay.hidden = true;
  confirmModalOverlay.onkeydown = null;
  currentDeleteConfirmHandler = null;
  unlockScroll();
}

function wireModalEvents() {
  editModalClose?.addEventListener("click", closeEditModal);
  editModalCancel?.addEventListener("click", closeEditModal);
  editModalOverlay?.addEventListener("click", (e) => {
    if (e.target === editModalOverlay) closeEditModal();
  });

  editModalSave?.addEventListener("click", async () => {
    if (typeof currentEditSaveHandler === "function") {
      await currentEditSaveHandler();
    }
  });

  confirmModalOverlay?.addEventListener("click", (e) => {
    if (e.target === confirmModalOverlay) closeConfirmModal();
  });
}

function buildFieldHTML(field) {
  const {
    id,
    label,
    type = "text",
    value = "",
    placeholder = "",
    required = false,
    options = []
  } = field;

  if (type === "textarea") {
    return `
      <div class="field full">
        <label for="${esc(id)}">${esc(label)}</label>
        <textarea id="${esc(id)}" placeholder="${esc(placeholder)}" ${required ? "required" : ""}>${esc(value)}</textarea>
      </div>
    `;
  }

  if (type === "select") {
    return `
      <div class="field">
        <label for="${esc(id)}">${esc(label)}</label>
        <select id="${esc(id)}" ${required ? "required" : ""}>
          ${options.map(opt => `
            <option value="${esc(opt.value)}" ${String(opt.value) === String(value) ? "selected" : ""}>
              ${esc(opt.label)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  return `
    <div class="field ${field.full ? "full" : ""}">
      <label for="${esc(id)}">${esc(label)}</label>
      <input
        id="${esc(id)}"
        type="${esc(type)}"
        value="${esc(value)}"
        placeholder="${esc(placeholder)}"
        ${required ? "required" : ""}
      />
    </div>
  `;
}

function openEditFormModal({ title, fields, onSave }) {
  if (!editModalOverlay || !editModalBody || !editModalTitle) {
    toast("Modal de edição não encontrado no HTML.");
    return;
  }

  editModalTitle.textContent = title || "Editar registro";
  editModalBody.innerHTML = `<div class="formGrid">${fields.map(buildFieldHTML).join("")}</div>`;

  currentEditSaveHandler = async () => {
    const values = {};

    for (const field of fields) {
      const el = $(field.id);
      if (!el) continue;

      const value = (el.value || "").trim();

      if (field.required && !value) {
        toast(`Preencha: ${field.label}`);
        el.focus();
        return;
      }

      values[field.id] = value;
    }

    await onSave(values);
    closeEditModal();
  };

  editModalOverlay.hidden = false;
  lockScroll();

  const first = fields[0] && $(fields[0].id);
  if (first) setTimeout(() => first.focus(), 40);

  editModalOverlay.onkeydown = async (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeEditModal();
      return;
    }

    if (e.key === "Enter") {
      const target = e.target;
      const isTextarea = target && target.tagName === "TEXTAREA";
      if (isTextarea) return;

      e.preventDefault();
      if (typeof currentEditSaveHandler === "function") {
        await currentEditSaveHandler();
      }
    }
  };
}

function openTextEditModal({ title, label, value, onSave, placeholder = "" }) {
  openEditFormModal({
    title,
    fields: [
      {
        id: "modalSingleText",
        label,
        type: "textarea",
        value,
        placeholder,
        required: true,
        full: true
      }
    ],
    onSave: async (values) => {
      await onSave(values.modalSingleText);
    }
  });
}

function askDeletePasswordModal(message = "Tem certeza que deseja excluir este registro?") {
  return new Promise((resolve) => {
    if (!confirmModalOverlay || !confirmModalText) {
      const confirmMsg = confirm(`${message}\n\nClique em OK para continuar.`);
      if (!confirmMsg) return resolve(false);

      const pass = prompt("Digite a senha para excluir:");
      if (pass === null) return resolve(false);

      if (pass !== DELETE_PASSWORD) {
        toast("Senha incorreta.");
        return resolve(false);
      }

      return resolve(true);
    }

    confirmModalText.innerHTML = `
      <div>${esc(message)}</div>
      <div style="margin-top:12px">
        <label for="confirmDeletePassword" style="display:block;margin-bottom:6px;">Senha de exclusão</label>
        <input id="confirmDeletePassword" type="password" placeholder="Digite a senha" />
      </div>
    `;

    const finishFalse = () => {
      closeConfirmModal();
      resolve(false);
    };

    currentDeleteConfirmHandler = async () => {
      const passEl = $("confirmDeletePassword");
      const pass = passEl?.value || "";

      if (pass !== DELETE_PASSWORD) {
        toast("Senha incorreta.");
        passEl?.focus();
        return;
      }

      closeConfirmModal();
      resolve(true);
    };

    confirmModalOverlay.hidden = false;
    lockScroll();

    setTimeout(() => $("confirmDeletePassword")?.focus(), 40);

    confirmModalClose.onclick = finishFalse;
    confirmModalCancel.onclick = finishFalse;
    confirmModalConfirm.onclick = async () => {
      if (typeof currentDeleteConfirmHandler === "function") {
        await currentDeleteConfirmHandler();
      }
    };

    confirmModalOverlay.onkeydown = async (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finishFalse();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (typeof currentDeleteConfirmHandler === "function") {
          await currentDeleteConfirmHandler();
        }
      }
    };
  });
}

/* =========================================================
   FIRESTORE HELPERS
========================================================= */

async function createDoc(col, data) {
  const ref = await addDoc(collection(db, col), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

async function updateDocById(col, id, data) {
  await updateDoc(doc(db, col, id), {
    ...data,
    updatedAt: serverTimestamp()
  });
  return true;
}

async function deleteDocById(col, id) {
  await deleteDoc(doc(db, col, id));
}

async function patchArrayField(col, id, fieldName, nextArray) {
  await updateDocById(col, id, { [fieldName]: nextArray });
}

/* =========================================================
   DADOS / CACHE
========================================================= */

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

const selected = {
  inicio: null,
  evangelho: null,
  vida: null,
  missao: null
};

/* =========================================================
   NAV / TÍTULOS
========================================================= */

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

function currentPageKey() {
  const hash = window.location.hash?.replace("#", "").trim();
  if (!hash) return "painel";
  return hash;
}

function applyNavState() {
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

  if (pageTitle) pageTitle.textContent = pageNames[key] || "Catequese";
  if (pageSubtitle) pageSubtitle.textContent = subtitles[key] || "";

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("isDefault");
  });

  const target = document.getElementById(key);

  if (!target) {
    const painel = document.getElementById("painel");
    if (painel) painel.classList.add("isDefault");
    if (pageTitle) pageTitle.textContent = "Painel do Encontro";
    if (pageSubtitle) pageSubtitle.textContent = subtitles.painel || "";
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
      const navToggle = $("navToggle");
      if (navToggle) navToggle.checked = false;
    }, 0);
  });
});

/* =========================================================
   FIRESTORE REALTIME
========================================================= */

function subscribeAll() {
  setSync("Sincronizando…");

  const keys = Object.keys(COL);
  let firstSuccess = false;

  keys.forEach((key) => {
    const qy = query(collection(db, COL[key]), orderBy("createdAt", "desc"));

    onSnapshot(
      qy,
      (snap) => {
        cache[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        updateProgressUI();
        renderPainel();

        if (!firstSuccess) {
          firstSuccess = true;
          setSync("Online ✅");
        }

        const current = currentPageKey();
        if (current === key || current === "painel") renderPage(current);
      },
      (err) => {
        console.error("[Firestore snapshot error]", key, err);
        const msg = err?.code ? `${err.code}` : "erro";
        setSync(`Erro 🔴 (${msg})`);
        toast(`Falha no Firestore: ${msg}`);
      }
    );
  });

  setTimeout(() => {
    const pill = $("syncPill")?.textContent || "";
    if (pill.includes("Sincronizando")) {
      setSync("Offline/sem acesso 🔴");
      toast("Sem acesso ao Firestore. Verifique regras, criação do banco e console.");
    }
  }, 5000);
}

/* =========================================================
   PROGRESSO / STATS
========================================================= */

function updateProgressUI() {
  const done = [
    cache.inicio.length,
    cache.evangelho.length,
    cache.oracao.length,
    cache.sacramentos.length,
    cache.vida.length,
    cache.missao.length
  ].filter((n) => n > 0).length;

  const t = $("progressText");
  const bar = $("miniBarFill");

  if (t) t.textContent = String(done);
  if (bar) bar.style.width = `${Math.round((done / 6) * 100)}%`;

  if ($("statInicio")) $("statInicio").textContent = cache.inicio.length;
  if ($("statEvangelho")) $("statEvangelho").textContent = cache.evangelho.length;
  if ($("statMissao")) $("statMissao").textContent = cache.missao.length;
  if ($("statTurma")) $("statTurma").textContent = cache.turma.length;
}

/* =========================================================
   ACCORDION
========================================================= */

function bindRegistroAccordion(container) {
  if (!container) return;

  const registros = container.querySelectorAll(".registro");

  registros.forEach((registro) => {
    const header = registro.querySelector(".registroHeader");
    const lerMaisBtn = registro.querySelector(".registroLerMais");

    const setExpanded = (isOpen) => {
      registro.classList.toggle("open", isOpen);
      if (header) header.setAttribute("aria-expanded", String(isOpen));
    };

    const toggleRegistro = () => {
      const isOpen = registro.classList.contains("open");

      registros.forEach((r) => {
        r.classList.remove("open");
        const h = r.querySelector(".registroHeader");
        if (h) h.setAttribute("aria-expanded", "false");
      });

      if (!isOpen) {
        setExpanded(true);
      }
    };

    if (header) {
      header.onclick = toggleRegistro;
      header.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleRegistro();
        }
      };
    }

    if (lerMaisBtn) {
      lerMaisBtn.onclick = (e) => {
        e.stopPropagation();
        toggleRegistro();
      };
    }
  });
}

/* =========================================================
   RENDER GERAL
========================================================= */

function renderPage(page) {
  if (page === "painel") renderPainel();
  if (page === "inicio") renderInicio();
  if (page === "evangelho") renderEvangelho();
  if (page === "oracao") renderOracao();
  if (page === "sacramentos") renderSacramentos();
  if (page === "vida") renderVida();
  if (page === "missao") renderMissao();
  if (page === "turma") renderTurma();
}

/* =========================================================
   SELECT HELPERS
========================================================= */

function fillSelect(selectEl, items, labelFn, selectedId) {
  if (!selectEl) return null;

  selectEl.innerHTML = "";

  if (items.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sem registros ainda";
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return null;
  }

  selectEl.disabled = false;

  items.forEach((it) => {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = labelFn(it);
    selectEl.appendChild(opt);
  });

  const exists = selectedId && items.some((i) => i.id === selectedId);
  selectEl.value = exists ? selectedId : items[0].id;
  return selectEl.value;
}

/* =========================================================
   COMMENTS / RESPOSTAS
========================================================= */

function renderCommentPanel({
  type,
  colName,
  arrayField,
  targetSelect,
  hintEl,
  formEl,
  nameEl,
  textEl,
  listEl,
  labelFn
}) {
  const items = cache[type];
  const chosen = fillSelect(targetSelect, items, labelFn, selected[type]);
  selected[type] = chosen;

  const hasItems = items.length > 0;

  if (hintEl) {
    hintEl.textContent = hasItems
      ? "Escolha o registro e adicione comentários."
      : "Crie um registro acima para liberar comentários.";
  }

  if (formEl) [...formEl.elements].forEach((el) => (el.disabled = !hasItems));
  if (!listEl) return;

  listEl.innerHTML = "";

  if (!hasItems) {
    listEl.innerHTML = `<div class="emptyState">Sem registros para comentar ainda.</div>`;
    return;
  }

  const parent = items.find((x) => x.id === chosen);
  if (!parent) return;

  const comments = parent[arrayField] || [];

  if (comments.length === 0) {
    listEl.innerHTML = `<div class="emptyState">Nenhum comentário ainda.</div>`;
  } else {
    listEl.innerHTML = comments
      .map(
        (c, idx) => `
      <div class="comment">
        <div>
          <strong>${esc(c.nome)}</strong>
          <div class="commentText">${esc(c.comentario)}</div>
        </div>
        <div class="commentRight">
          <button class="actionBtn edit" type="button" data-action="edit" data-idx="${idx}">Editar</button>
          <button class="actionBtn delete" type="button" data-action="del" data-idx="${idx}">Excluir</button>
        </div>
      </div>
    `
      )
      .join("");
  }

  if (targetSelect) {
    targetSelect.onchange = () => {
      selected[type] = targetSelect.value || null;
      renderCommentPanel({
        type,
        colName,
        arrayField,
        targetSelect,
        hintEl,
        formEl,
        nameEl,
        textEl,
        listEl,
        labelFn
      });
    };
  }

  if (formEl) {
    formEl.onsubmit = async (e) => {
      e.preventDefault();
      if (!hasItems) return;

      const nome = (nameEl?.value || "").trim();
      const comentario = (textEl?.value || "").trim();

      if (!nome || !comentario) {
        toast("Preencha nome e comentário.");
        return;
      }

      const next = [...comments, { nome, comentario, createdAt: Date.now() }];

      try {
        await patchArrayField(colName, parent.id, arrayField, next);
        if (nameEl) nameEl.value = "";
        if (textEl) textEl.value = "";
        if (nameEl) nameEl.focus();
        toast("Salvo ✅");
      } catch (err) {
        console.error(err);
        toast("Erro ao salvar.");
      }
    };
  }

  listEl.querySelectorAll('[data-action="del"]').forEach((btn) => {
    btn.onclick = async () => {
      const idx = Number(btn.getAttribute("data-idx"));
      const ok = await askDeletePasswordModal("Tem certeza que deseja excluir este comentário?");
      if (!ok) return;

      const next = comments.filter((_, i) => i !== idx);

      try {
        await patchArrayField(colName, parent.id, arrayField, next);
        toast("Excluído.");
      } catch (err) {
        console.error(err);
        toast("Erro ao excluir.");
      }
    };
  });

  listEl.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.onclick = async () => {
      const idx = Number(btn.getAttribute("data-idx"));
      const c = comments[idx];

      openTextEditModal({
        title: "Editar comentário",
        label: "Comentário",
        value: c?.comentario ?? "",
        placeholder: "Escreva o comentário...",
        onSave: async (novoTexto) => {
          const txt = novoTexto.trim();
          if (!txt) {
            toast("Comentário vazio.");
            return;
          }

          const next = comments.map((x, i) =>
            i === idx ? { ...x, comentario: txt, editedAt: Date.now() } : x
          );

          try {
            await patchArrayField(colName, parent.id, arrayField, next);
            toast("Atualizado.");
          } catch (err) {
            console.error(err);
            toast("Erro ao atualizar.");
          }
        }
      });
    };
  });
}

/* =========================================================
   CARD BASE
========================================================= */

function buildRegistroCard({ title, meta, content, editId, deleteId }) {
  return `
    <div class="registro">
      <div class="registroHeader" tabindex="0" role="button" aria-expanded="false">
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
          <button class="actionBtn edit" type="button" data-edit="${esc(editId)}">Editar</button>
          <button class="actionBtn delete" type="button" data-del="${esc(deleteId)}">Excluir</button>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   PAINEL
========================================================= */

function renderPainel() {
  const resumo = $("painelResumo");
  const ultimos = $("painelUltimos");
  if (!resumo || !ultimos) return;

  const lastInicio = cache.inicio[0];
  const lastEv = cache.evangelho[0];
  const lastMissao = cache.missao[0];

  const totalComentarios =
    cache.inicio.reduce((a, b) => a + (b.comments?.length || 0), 0) +
    cache.evangelho.reduce((a, b) => a + (b.comments?.length || 0), 0) +
    cache.vida.reduce((a, b) => a + (b.comments?.length || 0), 0);

  const totalRespostas =
    cache.missao.reduce((a, b) => a + (b.respostas?.length || 0), 0);

  resumo.innerHTML = `
    <div class="resumoLinha"><strong>Última aula:</strong> ${lastInicio ? `${esc(lastInicio.tema)} (${formatDateBr(lastInicio.date)})` : "Nenhuma aula registrada."}</div>
    <div class="resumoLinha"><strong>Último evangelho:</strong> ${lastEv ? `${esc(lastEv.ref || "Sem referência")} (${formatDateBr(lastEv.date)})` : "Nenhum evangelho registrado."}</div>
    <div class="resumoLinha"><strong>Última missão:</strong> ${lastMissao ? `${esc(lastMissao.pergunta)} (${formatDateBr(lastMissao.date)})` : "Nenhuma missão registrada."}</div>
    <div class="resumoLinha"><strong>Total de comentários:</strong> ${totalComentarios} | <strong>Total de respostas:</strong> ${totalRespostas}</div>
  `;

  const latest = [
    ...cache.inicio.slice(0, 1).map((x) => ({
      title: `Aula — ${x.tema}`,
      meta: formatDateBr(x.date),
      text: `${x.objetivo ? `Objetivo: ${x.objetivo}\n\n` : ""}${x.texto}`
    })),
    ...cache.evangelho.slice(0, 1).map((x) => ({
      title: `Evangelho — ${x.ref || "Sem referência"}`,
      meta: formatDateBr(x.date),
      text: `${x.frase ? `Frase-chave: ${x.frase}\n\n` : ""}${x.texto}`
    })),
    ...cache.missao.slice(0, 1).map((x) => ({
      title: "Missão da semana",
      meta: formatDateBr(x.date),
      text: `${x.objetivo ? `Objetivo: ${x.objetivo}\n\n` : ""}${x.pergunta}`
    }))
  ];

  ultimos.innerHTML = latest.length
    ? latest.map((item) => `
      <div class="registro">
        <div class="registroHeader" tabindex="0" role="button" aria-expanded="false">
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
    : `<div class="emptyState">Ainda não há registros para mostrar.</div>`;

  bindRegistroAccordion(ultimos);
}

/* =========================================================
   INÍCIO
========================================================= */

if ($("inicioData")) $("inicioData").value = isoToday();

$("inicioCancelar")?.addEventListener("click", () => {
  $("inicioEditId").value = "";
  $("formInicio").reset();
  $("inicioData").value = isoToday();
});

$("inicioBusca")?.addEventListener("input", renderInicio);

$("formInicio")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const date = $("inicioData").value;
  const tema = $("inicioTema").value.trim();
  const objetivo = $("inicioObjetivo").value.trim();
  const texto = $("inicioTexto").value.trim();

  if (!date || !tema || !texto) {
    toast("Preencha data, tema e texto.");
    return;
  }

  const id = $("inicioEditId").value;

  try {
    if (id) {
      await updateDocById(COL.inicio, id, { date, tema, objetivo, texto });
      toast("Aula atualizada ✅");
    } else {
      await createDoc(COL.inicio, { date, tema, objetivo, texto, comments: [] });
      toast("Aula salva ✅");
    }

    $("inicioEditId").value = "";
    $("formInicio").reset();
    $("inicioData").value = isoToday();
    $("inicioTema").focus();
  } catch (err) {
    console.error(err);
    toast(`Erro ao salvar aula: ${err?.code || "erro"}`);
  }
});

function renderInicio() {
  const q = ($("inicioBusca")?.value || "").trim().toLowerCase();
  const items = cache.inicio.filter((it) => !q || includesText(it, q));
  const box = $("inicioLista");
  if (!box) return;

  box.innerHTML = items.length
    ? items.map((it) =>
        buildRegistroCard({
          title: it.tema,
          meta: `${formatDateBr(it.date)} • ${(it.comments || []).length} comentário(s)`,
          content: `${it.objetivo ? `Objetivo: ${it.objetivo}\n\n` : ""}${it.texto}`,
          editId: it.id,
          deleteId: it.id
        })
      ).join("")
    : `<div class="emptyState">Nenhuma aula ainda.</div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => {
      const it = cache.inicio.find((x) => x.id === btn.dataset.edit);
      if (!it) return;

      openEditFormModal({
        title: "Editar aula",
        fields: [
          { id: "modal_inicio_date", label: "Data da aula", type: "date", value: it.date || isoToday(), required: true },
          { id: "modal_inicio_tema", label: "Tema", value: it.tema || "", required: true },
          { id: "modal_inicio_objetivo", label: "Objetivo da aula", value: it.objetivo || "", full: true },
          { id: "modal_inicio_texto", label: "Texto da aula", type: "textarea", value: it.texto || "", required: true, full: true }
        ],
        onSave: async (values) => {
          await updateDocById(COL.inicio, it.id, {
            date: values.modal_inicio_date,
            tema: values.modal_inicio_tema,
            objetivo: values.modal_inicio_objetivo,
            texto: values.modal_inicio_texto
          });
          toast("Aula atualizada ✅");
        }
      });
    };
  });

  box.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      const ok = await askDeletePasswordModal("Tem certeza que deseja excluir esta aula?");
      if (!ok) return;

      try {
        await deleteDocById(COL.inicio, btn.dataset.del);
        toast("Aula excluída.");
      } catch (err) {
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
    labelFn: (it) => `${formatDateBr(it.date)} — ${it.tema}`
  });
}

/* =========================================================
   EVANGELHO
========================================================= */

if ($("evData")) $("evData").value = isoToday();

$("evCancelar")?.addEventListener("click", () => {
  $("evEditId").value = "";
  $("formEvangelho").reset();
  $("evData").value = isoToday();
});

$("evBusca")?.addEventListener("input", renderEvangelho);

$("formEvangelho")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const date = $("evData").value;
  const ref = $("evRef").value.trim();
  const frase = $("evFrase").value.trim();
  const texto = $("evTexto").value.trim();

  if (!date || !texto) {
    toast("Preencha data e texto.");
    return;
  }

  const id = $("evEditId").value;

  try {
    if (id) {
      await updateDocById(COL.evangelho, id, { date, ref, frase, texto });
      toast("Evangelho atualizado ✅");
    } else {
      await createDoc(COL.evangelho, { date, ref, frase, texto, comments: [] });
      toast("Evangelho salvo ✅");
    }

    $("evEditId").value = "";
    $("formEvangelho").reset();
    $("evData").value = isoToday();
    $("evRef").focus();
  } catch (err) {
    console.error(err);
    toast(`Erro ao salvar evangelho: ${err?.code || "erro"}`);
  }
});

function renderEvangelho() {
  const q = ($("evBusca")?.value || "").trim().toLowerCase();
  const items = cache.evangelho.filter((it) => !q || includesText(it, q));
  const box = $("evLista");
  if (!box) return;

  box.innerHTML = items.length
    ? items.map((it) =>
        buildRegistroCard({
          title: it.ref ? `Evangelho — ${it.ref}` : "Evangelho",
          meta: `${formatDateBr(it.date)} • ${(it.comments || []).length} comentário(s)`,
          content: `${it.frase ? `Frase-chave: ${it.frase}\n\n` : ""}${it.texto}`,
          editId: it.id,
          deleteId: it.id
        })
      ).join("")
    : `<div class="emptyState">Nenhum evangelho ainda.</div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => {
      const it = cache.evangelho.find((x) => x.id === btn.dataset.edit);
      if (!it) return;

      openEditFormModal({
        title: "Editar evangelho / reflexão",
        fields: [
          { id: "modal_ev_date", label: "Data", type: "date", value: it.date || isoToday(), required: true },
          { id: "modal_ev_ref", label: "Referência", value: it.ref || "" },
          { id: "modal_ev_frase", label: "Frase-chave", value: it.frase || "", full: true },
          { id: "modal_ev_texto", label: "Texto", type: "textarea", value: it.texto || "", required: true, full: true }
        ],
        onSave: async (values) => {
          await updateDocById(COL.evangelho, it.id, {
            date: values.modal_ev_date,
            ref: values.modal_ev_ref,
            frase: values.modal_ev_frase,
            texto: values.modal_ev_texto
          });
          toast("Evangelho atualizado ✅");
        }
      });
    };
  });

  box.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      const ok = await askDeletePasswordModal("Tem certeza que deseja excluir este evangelho?");
      if (!ok) return;

      try {
        await deleteDocById(COL.evangelho, btn.dataset.del);
        toast("Registro excluído.");
      } catch (err) {
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
    labelFn: (it) => `${formatDateBr(it.date)}${it.ref ? ` — ${it.ref}` : ""}`
  });
}

/* =========================================================
   ORAÇÃO
========================================================= */

if ($("orData")) $("orData").value = isoToday();

$("orCancelar")?.addEventListener("click", () => {
  $("orEditId").value = "";
  $("formOracao").reset();
  $("orData").value = isoToday();
  $("orTipo").value = "Pedido";
});

$("orBusca")?.addEventListener("input", renderOracao);

$("formOracao")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const date = $("orData").value;
  const tipo = $("orTipo").value;
  const causa = $("orCausa").value.trim();
  const texto = $("orTexto").value.trim();

  if (!date || !tipo || !causa) {
    toast("Preencha data, tipo e causa.");
    return;
  }

  const id = $("orEditId").value;

  try {
    if (id) {
      await updateDocById(COL.oracao, id, { date, tipo, causa, texto });
      toast("Oração atualizada ✅");
    } else {
      await createDoc(COL.oracao, { date, tipo, causa, texto });
      toast("Oração salva ✅");
    }

    $("orEditId").value = "";
    $("formOracao").reset();
    $("orData").value = isoToday();
    $("orTipo").value = "Pedido";
    $("orCausa").focus();
  } catch (err) {
    console.error(err);
    toast(`Erro ao salvar oração: ${err?.code || "erro"}`);
  }
});

function renderOracao() {
  const q = ($("orBusca")?.value || "").trim().toLowerCase();
  const items = cache.oracao.filter((it) => !q || includesText(it, q));
  const box = $("orLista");
  if (!box) return;

  box.innerHTML = items.length
    ? items.map((it) =>
        buildRegistroCard({
          title: `${it.tipo} — ${it.causa}`,
          meta: formatDateBr(it.date),
          content: it.texto || "(sem detalhes)",
          editId: it.id,
          deleteId: it.id
        })
      ).join("")
    : `<div class="emptyState">Nenhuma oração ainda.</div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => {
      const it = cache.oracao.find((x) => x.id === btn.dataset.edit);
      if (!it) return;

      openEditFormModal({
        title: "Editar oração",
        fields: [
          { id: "modal_or_date", label: "Data", type: "date", value: it.date || isoToday(), required: true },
          {
            id: "modal_or_tipo",
            label: "Tipo",
            type: "select",
            value: it.tipo || "Pedido",
            required: true,
            options: [
              { value: "Pedido", label: "Pedido" },
              { value: "Agradecimento", label: "Agradecimento" },
              { value: "Intercessão", label: "Intercessão" }
            ]
          },
          { id: "modal_or_causa", label: "Causa / Intenção", value: it.causa || "", required: true, full: true },
          { id: "modal_or_texto", label: "Detalhes", type: "textarea", value: it.texto || "", full: true }
        ],
        onSave: async (values) => {
          await updateDocById(COL.oracao, it.id, {
            date: values.modal_or_date,
            tipo: values.modal_or_tipo,
            causa: values.modal_or_causa,
            texto: values.modal_or_texto
          });
          toast("Oração atualizada ✅");
        }
      });
    };
  });

  box.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      const ok = await askDeletePasswordModal("Tem certeza que deseja excluir esta oração?");
      if (!ok) return;

      try {
        await deleteDocById(COL.oracao, btn.dataset.del);
        toast("Registro excluído.");
      } catch (err) {
        console.error(err);
        toast("Erro ao excluir.");
      }
    };
  });
}

/* =========================================================
   SACRAMENTOS
========================================================= */

if ($("saData")) $("saData").value = isoToday();

$("saCancelar")?.addEventListener("click", () => {
  $("saEditId").value = "";
  $("formSac").reset();
  $("saData").value = isoToday();
});

$("saBusca")?.addEventListener("input", renderSacramentos);

$("formSac")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const date = $("saData").value;
  const nome = $("saNome").value.trim();
  const compromisso = $("saCompromisso").value.trim();
  const texto = $("saTexto").value.trim();

  if (!date || !texto) {
    toast("Preencha data e reflexão.");
    return;
  }

  const id = $("saEditId").value;

  try {
    if (id) {
      await updateDocById(COL.sacramentos, id, { date, nome, compromisso, texto });
      toast("Registro atualizado ✅");
    } else {
      await createDoc(COL.sacramentos, { date, nome, compromisso, texto });
      toast("Registro salvo ✅");
    }

    $("saEditId").value = "";
    $("formSac").reset();
    $("saData").value = isoToday();
    $("saNome").focus();
  } catch (err) {
    console.error(err);
    toast(`Erro ao salvar: ${err?.code || "erro"}`);
  }
});

function renderSacramentos() {
  const q = ($("saBusca")?.value || "").trim().toLowerCase();
  const items = cache.sacramentos.filter((it) => !q || includesText(it, q));
  const box = $("saLista");
  if (!box) return;

  box.innerHTML = items.length
    ? items.map((it) =>
        buildRegistroCard({
          title: it.nome ? `Sacramento — ${it.nome}` : "Sacramentos",
          meta: formatDateBr(it.date),
          content: `${it.compromisso ? `Compromisso: ${it.compromisso}\n\n` : ""}${it.texto}`,
          editId: it.id,
          deleteId: it.id
        })
      ).join("")
    : `<div class="emptyState">Nenhum registro ainda.</div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => {
      const it = cache.sacramentos.find((x) => x.id === btn.dataset.edit);
      if (!it) return;

      openEditFormModal({
        title: "Editar sacramentos",
        fields: [
          { id: "modal_sa_date", label: "Data", type: "date", value: it.date || isoToday(), required: true },
          { id: "modal_sa_nome", label: "Sacramento", value: it.nome || "" },
          { id: "modal_sa_compromisso", label: "Compromisso da semana", value: it.compromisso || "", full: true },
          { id: "modal_sa_texto", label: "Reflexão", type: "textarea", value: it.texto || "", required: true, full: true }
        ],
        onSave: async (values) => {
          await updateDocById(COL.sacramentos, it.id, {
            date: values.modal_sa_date,
            nome: values.modal_sa_nome,
            compromisso: values.modal_sa_compromisso,
            texto: values.modal_sa_texto
          });
          toast("Registro atualizado ✅");
        }
      });
    };
  });

  box.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      const ok = await askDeletePasswordModal("Tem certeza que deseja excluir este registro sacramental?");
      if (!ok) return;

      try {
        await deleteDocById(COL.sacramentos, btn.dataset.del);
        toast("Registro excluído.");
      } catch (err) {
        console.error(err);
        toast("Erro ao excluir.");
      }
    };
  });
}

/* =========================================================
   VIDA CRISTÃ
========================================================= */

if ($("viData")) $("viData").value = isoToday();

$("viCancelar")?.addEventListener("click", () => {
  $("viEditId").value = "";
  $("formVida").reset();
  $("viData").value = isoToday();
});

$("viBusca")?.addEventListener("input", renderVida);

$("formVida")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const date = $("viData").value;
  const desafio = $("viDesafio").value.trim();
  const afasta = $("viAfasta").value.trim();
  const plano = $("viPlano").value.trim();

  if (!date || !desafio || !afasta) {
    toast("Preencha data, desafio e o que afasta.");
    return;
  }

  const id = $("viEditId").value;

  try {
    if (id) {
      await updateDocById(COL.vida, id, { date, desafio, afasta, plano });
      toast("Registro atualizado ✅");
    } else {
      await createDoc(COL.vida, { date, desafio, afasta, plano, comments: [] });
      toast("Registro salvo ✅");
    }

    $("viEditId").value = "";
    $("formVida").reset();
    $("viData").value = isoToday();
    $("viDesafio").focus();
  } catch (err) {
    console.error(err);
    toast(`Erro ao salvar: ${err?.code || "erro"}`);
  }
});

function renderVida() {
  const q = ($("viBusca")?.value || "").trim().toLowerCase();
  const items = cache.vida.filter((it) => !q || includesText(it, q));
  const box = $("viLista");
  if (!box) return;

  box.innerHTML = items.length
    ? items.map((it) =>
        buildRegistroCard({
          title: `Desafio — ${it.desafio}`,
          meta: `${formatDateBr(it.date)} • ${(it.comments || []).length} comentário(s)`,
          content: `O que afasta: ${it.afasta}\n\nPlano: ${it.plano || "(não definido)"}`,
          editId: it.id,
          deleteId: it.id
        })
      ).join("")
    : `<div class="emptyState">Nenhum registro ainda.</div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => {
      const it = cache.vida.find((x) => x.id === btn.dataset.edit);
      if (!it) return;

      openEditFormModal({
        title: "Editar vida cristã",
        fields: [
          { id: "modal_vi_date", label: "Data", type: "date", value: it.date || isoToday(), required: true },
          { id: "modal_vi_desafio", label: "Desafio da semana", value: it.desafio || "", required: true, full: true },
          { id: "modal_vi_afasta", label: "O que ainda me afasta de Deus?", type: "textarea", value: it.afasta || "", required: true, full: true },
          { id: "modal_vi_plano", label: "Plano prático", type: "textarea", value: it.plano || "", full: true }
        ],
        onSave: async (values) => {
          await updateDocById(COL.vida, it.id, {
            date: values.modal_vi_date,
            desafio: values.modal_vi_desafio,
            afasta: values.modal_vi_afasta,
            plano: values.modal_vi_plano
          });
          toast("Registro atualizado ✅");
        }
      });
    };
  });

  box.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      const ok = await askDeletePasswordModal("Tem certeza que deseja excluir este registro de vida cristã?");
      if (!ok) return;

      try {
        await deleteDocById(COL.vida, btn.dataset.del);
        toast("Registro excluído.");
      } catch (err) {
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
    labelFn: (it) => `${formatDateBr(it.date)} — ${it.desafio}`
  });
}

/* =========================================================
   MISSÃO
========================================================= */

if ($("miData")) $("miData").value = isoToday();

$("miCancelar")?.addEventListener("click", () => {
  $("miEditId").value = "";
  $("formMissao").reset();
  $("miData").value = isoToday();
});

$("miBusca")?.addEventListener("input", renderMissao);

$("formMissao")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const date = $("miData").value;
  const pergunta = $("miPergunta").value.trim();
  const objetivo = $("miObjetivo").value.trim();

  if (!date || !pergunta) {
    toast("Preencha data e pergunta.");
    return;
  }

  const id = $("miEditId").value;

  try {
    if (id) {
      await updateDocById(COL.missao, id, { date, pergunta, objetivo });
      toast("Pergunta atualizada ✅");
    } else {
      await createDoc(COL.missao, { date, pergunta, objetivo, respostas: [] });
      toast("Pergunta salva ✅");
    }

    $("miEditId").value = "";
    $("formMissao").reset();
    $("miData").value = isoToday();
    $("miPergunta").focus();
  } catch (err) {
    console.error(err);
    toast(`Erro ao salvar pergunta: ${err?.code || "erro"}`);
  }
});

function renderMissao() {
  const q = ($("miBusca")?.value || "").trim().toLowerCase();
  const items = cache.missao.filter((it) => !q || includesText(it, q));
  const box = $("miLista");
  if (!box) return;

  box.innerHTML = items.length
    ? items.map((it) =>
        buildRegistroCard({
          title: it.pergunta,
          meta: `${formatDateBr(it.date)} • ${(it.respostas || []).length} resposta(s)`,
          content: `${it.objetivo ? `Objetivo: ${it.objetivo}\n\n` : ""}Pergunta da missão: ${it.pergunta}`,
          editId: it.id,
          deleteId: it.id
        })
      ).join("")
    : `<div class="emptyState">Nenhuma missão ainda.</div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => {
      const it = cache.missao.find((x) => x.id === btn.dataset.edit);
      if (!it) return;

      openEditFormModal({
        title: "Editar missão",
        fields: [
          { id: "modal_mi_date", label: "Data", type: "date", value: it.date || isoToday(), required: true },
          { id: "modal_mi_pergunta", label: "Pergunta", value: it.pergunta || "", required: true, full: true },
          { id: "modal_mi_objetivo", label: "Objetivo da missão", value: it.objetivo || "", full: true }
        ],
        onSave: async (values) => {
          await updateDocById(COL.missao, it.id, {
            date: values.modal_mi_date,
            pergunta: values.modal_mi_pergunta,
            objetivo: values.modal_mi_objetivo
          });
          toast("Pergunta atualizada ✅");
        }
      });

      selected.missao = it.id;
      renderMissaoReplies();
    };
  });

  box.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      const ok = await askDeletePasswordModal("Tem certeza que deseja excluir esta missão?");
      if (!ok) return;

      try {
        await deleteDocById(COL.missao, btn.dataset.del);
        toast("Pergunta excluída.");
      } catch (err) {
        console.error(err);
        toast("Erro ao excluir.");
      }
    };
  });

  renderMissaoReplies();
}

function renderMissaoReplies() {
  const hintEl = $("miReplyHint");
  const targetSelect = $("miReplyTarget");
  const formEl = $("miReplyForm");
  const nameEl = $("miAlunoNome");
  const textEl = $("miAlunoComentario");
  const listEl = $("miReplyList");

  const items = cache.missao;
  const chosen = fillSelect(targetSelect, items, (it) => `${formatDateBr(it.date)} — ${it.pergunta}`, selected.missao);
  selected.missao = chosen;

  const hasItems = items.length > 0;

  if (hintEl) {
    hintEl.textContent = hasItems
      ? "Escolha a pergunta e registre as respostas."
      : "Crie uma pergunta acima para liberar respostas.";
  }

  if (formEl) [...formEl.elements].forEach((el) => (el.disabled = !hasItems));
  if (!listEl) return;

  listEl.innerHTML = "";

  if (!hasItems) {
    listEl.innerHTML = `<div class="emptyState">Sem perguntas ainda.</div>`;
    return;
  }

  const parent = items.find((x) => x.id === chosen);
  if (!parent) return;

  const replies = parent.respostas || [];

  if (replies.length === 0) {
    listEl.innerHTML = `<div class="emptyState">Nenhuma resposta ainda.</div>`;
  } else {
    listEl.innerHTML = replies.map((r, idx) => `
      <div class="comment">
        <div>
          <strong>${esc(r.nome)}</strong>
          <div class="commentText">${esc(r.comentario)}</div>
        </div>
        <div class="commentRight">
          <button class="actionBtn edit" type="button" data-action="edit" data-idx="${idx}">Editar</button>
          <button class="actionBtn delete" type="button" data-action="del" data-idx="${idx}">Excluir</button>
        </div>
      </div>
    `).join("");
  }

  if (targetSelect) {
    targetSelect.onchange = () => {
      selected.missao = targetSelect.value || null;
      renderMissaoReplies();
    };
  }

  if (formEl) {
    formEl.onsubmit = async (e) => {
      e.preventDefault();
      if (!hasItems) return;

      const nome = (nameEl?.value || "").trim();
      const comentario = (textEl?.value || "").trim();

      if (!nome || !comentario) {
        toast("Preencha nome e comentário.");
        return;
      }

      const next = [...replies, { nome, comentario, createdAt: Date.now() }];

      try {
        await patchArrayField(COL.missao, parent.id, "respostas", next);
        if (nameEl) nameEl.value = "";
        if (textEl) textEl.value = "";
        if (nameEl) nameEl.focus();
        toast("Resposta salva ✅");
      } catch (err) {
        console.error(err);
        toast(`Erro ao salvar resposta: ${err?.code || "erro"}`);
      }
    };
  }

  listEl.querySelectorAll('[data-action="del"]').forEach((btn) => {
    btn.onclick = async () => {
      const idx = Number(btn.getAttribute("data-idx"));
      const ok = await askDeletePasswordModal("Tem certeza que deseja excluir esta resposta?");
      if (!ok) return;

      const next = replies.filter((_, i) => i !== idx);

      try {
        await patchArrayField(COL.missao, parent.id, "respostas", next);
        toast("Resposta excluída.");
      } catch (err) {
        console.error(err);
        toast(`Erro ao excluir: ${err?.code || "erro"}`);
      }
    };
  });

  listEl.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.onclick = async () => {
      const idx = Number(btn.getAttribute("data-idx"));
      const r = replies[idx];

      openTextEditModal({
        title: "Editar resposta",
        label: "Resposta",
        value: r?.comentario ?? "",
        placeholder: "Escreva a resposta...",
        onSave: async (novoTexto) => {
          const txt = novoTexto.trim();

          if (!txt) {
            toast("Resposta vazia.");
            return;
          }

          const next = replies.map((x, i) =>
            i === idx ? { ...x, comentario: txt, editedAt: Date.now() } : x
          );

          try {
            await patchArrayField(COL.missao, parent.id, "respostas", next);
            toast("Resposta atualizada.");
          } catch (err) {
            console.error(err);
            toast(`Erro ao atualizar: ${err?.code || "erro"}`);
          }
        }
      });
    };
  });
}

/* =========================================================
   TURMA
========================================================= */

$("tuCancelar")?.addEventListener("click", () => {
  $("tuEditId").value = "";
  $("formTurma").reset();
});

$("tuBusca")?.addEventListener("input", renderTurma);

$("formTurma")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nome = $("tuNome").value.trim();
  const nascimento = $("tuNascimento").value;
  const sacramento = $("tuSacramento").value.trim();
  const municipio = $("tuMunicipio").value.trim();

  if (!nome || nome.length < 2) {
    toast("Nome precisa ter pelo menos 2 letras.");
    return;
  }
  if (!nascimento) {
    toast("Informe a data de nascimento.");
    return;
  }
  if (!sacramento) {
    toast("Preencha o sacramento.");
    return;
  }
  if (!municipio) {
    toast("Preencha o município.");
    return;
  }

  const id = $("tuEditId").value;

  try {
    if (id) {
      await updateDocById(COL.turma, id, { nome, nascimento, sacramento, municipio });
      toast("Catequizando atualizado ✅");
    } else {
      await createDoc(COL.turma, { nome, nascimento, sacramento, municipio });
      toast("Catequizando salvo ✅");
    }

    $("tuEditId").value = "";
    $("formTurma").reset();
    $("tuNome").focus();
  } catch (err) {
    console.error(err);
    toast(`Erro ao salvar: ${err?.code || "erro"}`);
  }
});

function renderTurma() {
  const q = ($("tuBusca")?.value || "").trim().toLowerCase();
  const items = cache.turma.filter((it) => !q || includesText(it, q));
  const box = $("tuLista");
  if (!box) return;

  box.innerHTML = items.length
    ? items.map((it) =>
        buildRegistroCard({
          title: it.nome,
          meta: `Nascimento: ${formatDateBr(it.nascimento)} • Idade: ${calculateAge(it.nascimento)}`,
          content: `Sacramento: ${it.sacramento}\nMunicípio: ${it.municipio}`,
          editId: it.id,
          deleteId: it.id
        })
      ).join("")
    : `<div class="emptyState">Nenhum catequizando cadastrado ainda.</div>`;

  bindRegistroAccordion(box);

  box.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => {
      const it = cache.turma.find((x) => x.id === btn.dataset.edit);
      if (!it) return;

      openEditFormModal({
        title: "Editar catequizando",
        fields: [
          { id: "modal_tu_nome", label: "Nome", value: it.nome || "", required: true },
          { id: "modal_tu_nascimento", label: "Data de nascimento", type: "date", value: it.nascimento || "", required: true },
          { id: "modal_tu_sacramento", label: "Sacramento", value: it.sacramento || "", required: true },
          { id: "modal_tu_municipio", label: "Município", value: it.municipio || "", required: true }
        ],
        onSave: async (values) => {
          await updateDocById(COL.turma, it.id, {
            nome: values.modal_tu_nome,
            nascimento: values.modal_tu_nascimento,
            sacramento: values.modal_tu_sacramento,
            municipio: values.modal_tu_municipio
          });
          toast("Catequizando atualizado ✅");
        }
      });
    };
  });

  box.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      const ok = await askDeletePasswordModal("Tem certeza que deseja excluir este catequizando?");
      if (!ok) return;

      try {
        await deleteDocById(COL.turma, btn.dataset.del);
        toast("Catequizando excluído.");
      } catch (err) {
        console.error(err);
        toast("Erro ao excluir.");
      }
    };
  });
}

/* =========================================================
   PDF
========================================================= */

$("pdfBtn")?.addEventListener("click", () => {
  if (!location.hash) location.hash = "#painel";
  applyNavState();
  toast("Gerando PDF da aba atual…");
  setTimeout(() => window.print(), 300);
});

/* =========================================================
   BOOT
========================================================= */

wireModalEvents();

if (!location.hash) location.hash = "#painel";
applyNavState();
subscribeAll();
