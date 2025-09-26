console.log("✅ script.js loaded");

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbytSSz4s0Uej3cwSiVVBxoSGxZiMqK37r1vYSYnhnJhlu-CwY0uyBSdnLroA90TrAFnXQ/exec";
const ADMIN_UNLOCK_KEY = "diaadmin";

let ADMIN = false;
let PUBLISHING_ID = null;
let lastRenderRequest = 0; // track render calls

/***** NAV *****/
function show(id) {
  document.querySelectorAll("section").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
  if (id === "published") renderPublished();
  if (id === "admin") renderAdmin();
}
window.show = show;

/***** COUNTS *****/
async function updateCounts() {
  try {
    const pubRes = await fetch(`${WEB_APP_URL}?type=listPublished`);
    const pubData = await pubRes.json();
    document.getElementById("count-published").textContent = pubData.length;

    let underCount = 0;
    try {
      const urRes = await fetch(`${WEB_APP_URL}?type=listUnder&adminKey=${encodeURIComponent(ADMIN_UNLOCK_KEY)}`);
      if (urRes.ok) {
        const urData = await urRes.json();
        underCount = urData.length;
      }
    } catch {}
    document.getElementById("count-under").textContent = underCount;
  } catch (e) {
    console.error("Counts error:", e);
  }
}

/***** SUBMIT *****/
const submitForm = document.getElementById("submitForm");
if (submitForm) {
  submitForm.onsubmit = async (e) => {
    e.preventDefault();
    document.getElementById("submitStatus").textContent = "⏳ Uploading...";
    const fd = new FormData(submitForm);
    const file = fd.get("pdfFile");
    if (!file) return;

    const pdfDataUrl = await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = ev => resolve(ev.target.result);
      fr.readAsDataURL(file);
    });

    const payload = {
      action: "submit",
      title: fd.get("title"),
      authors: fd.get("authors"),
      abstract: fd.get("abstract"),
      pdfDataUrl,
      pdfFileName: file.name
    };

    try {
      const res = await fetch(WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        document.getElementById("submitStatus").textContent = "✅ Submitted!";
        submitForm.reset();
        updateCounts();
      } else {
        document.getElementById("submitStatus").textContent = "❌ Error: " + (data.error || "Unknown");
      }
    } catch {
      document.getElementById("submitStatus").textContent = "❌ Network error";
    }
  };
}

/***** PUBLISHED (public) *****/
async function renderPublished() {
  const box = document.getElementById("pubList");
  const loading = document.getElementById("loadingPub");

  box.innerHTML = "";
  loading.style.display = "block";

  const requestId = ++lastRenderRequest;

  try {
    const res = await fetch(`${WEB_APP_URL}?type=listPublished`);
    const items = await res.json();

    if (requestId !== lastRenderRequest) return; // cancel if newer call started

    loading.style.display = "none";
    box.innerHTML = "";

    if (!items.length) {
      box.innerHTML = "<p>No articles published yet.</p>";
      return;
    }

    const seen = new Set();
    items.forEach(a => {
      if (!a.id || seen.has(a.id)) return;
      seen.add(a.id);

      const div = document.createElement("div");
      div.className = "card";
      const link = a.finalPdfUrl || a.originalPdfUrl || "#";
      const name = a.finalPdfName || a.originalPdfName || "paper.pdf";

      div.innerHTML = `
        <h4>${a.title}</h4>
        <p>${a.authors}</p>
        <a href="${link}" target="_blank" download="${name}">Download ${name}</a>
      `;
      box.appendChild(div);
    });
  } catch (e) {
    if (requestId !== lastRenderRequest) return;
    loading.style.display = "none";
    box.innerHTML = "<p>Failed to load published articles.</p>";
  }
}

/***** ADMIN *****/
function unlock() {
  const val = document.getElementById("adminkey").value;
  ADMIN = (val === ADMIN_UNLOCK_KEY);
  document.getElementById("adminStatus").textContent = ADMIN ? "🔓 Unlocked" : "❌ Wrong key";
  renderAdmin();
}
window.unlock = unlock;

async function renderAdmin() {
  const ur = document.getElementById("underList");
  const pb = document.getElementById("pubListAdmin");
  const loading = document.getElementById("loadingUnder");
  ur.innerHTML = pb.innerHTML = "";
  loading.style.display = "block";

  if (!ADMIN) {
    ur.innerHTML = "<p>Unlock with admin key to view submissions.</p>";
    loading.style.display = "none";
    return;
  }

  try {
    const urRes = await fetch(`${WEB_APP_URL}?type=listUnder&adminKey=${encodeURIComponent(ADMIN_UNLOCK_KEY)}`);
    const under = await urRes.json();
    loading.style.display = "none";
    ur.innerHTML = "";

    under.forEach(a => {
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `
        <h4>${a.title}</h4>
        <p>${a.authors}</p>
        <a href="${a.originalPdfUrl}" target="_blank">Download</a>
        <button onclick="startPublish('${a.id}')">Publish</button>
        <button onclick="rejectItem('${a.id}')">Reject</button>
      `;
      ur.appendChild(div);
    });

    const pbRes = await fetch(`${WEB_APP_URL}?type=listPublished`);
    const pubs = await pbRes.json();
    pb.innerHTML = "";
    const seen = new Set();
    pubs.forEach(a => {
      if (!a.id || seen.has(a.id)) return;
      seen.add(a.id);

      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `
        <h4>${a.title}</h4>
        <p>${a.authors}</p>
        <button onclick="deletePublished('${a.id}')">Delete</button>
      `;
      pb.appendChild(div);
    });
  } catch {
    ur.innerHTML = "<p>Failed to load admin lists.</p>";
    loading.style.display = "none";
  }
}
window.startPublish = function startPublish(id) {
  PUBLISHING_ID = id;
  show("publishPage");
};

/***** FINAL PUBLISH *****/
const publishForm = document.getElementById("publishForm");
if (publishForm) {
  publishForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!PUBLISHING_ID) return;
    document.getElementById("publishStatus").textContent = "⏳ Publishing...";

    const fd = new FormData(publishForm);
    const finalFile = fd.get("finalPdf");
    const finalAuthors = fd.get("finalAuthors");

    const finalPdfDataUrl = await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = ev => resolve(ev.target.result);
      fr.readAsDataURL(finalFile);
    });

    const payload = {
      action: "publish",
      id: PUBLISHING_ID,
      finalAuthors,
      finalPdfDataUrl,
      finalFileName: finalFile.name,
      adminKey: ADMIN_UNLOCK_KEY
    };

    try {
      const res = await fetch(WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        document.getElementById("publishStatus").textContent = "✅ Final Published!";
        publishForm.reset();
        show("published");
        renderPublished();
        renderAdmin();
        updateCounts();
      } else {
        document.getElementById("publishStatus").textContent = "❌ Error: " + (data.error || "Unknown");
      }
    } catch {
      document.getElementById("publishStatus").textContent = "❌ Network error";
    }
  };
}

/***** REJECT + DELETE *****/
window.rejectItem = async function rejectItem(id) {
  await fetch(WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "reject", id, adminKey: ADMIN_UNLOCK_KEY })
  });
  renderAdmin();
  updateCounts();
};
window.deletePublished = async function deletePublished(id) {
  await fetch(WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "delete", id, adminKey: ADMIN_UNLOCK_KEY })
  });
  renderAdmin();
  renderPublished();
  updateCounts();
};

/***** INIT *****/
updateCounts();
renderPublished();


