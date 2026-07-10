// ---------- small helpers ----------
async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

function el(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function timeAgo(iso) {
  if (!iso) return "no data";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return seconds + "s ago";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
  if (seconds < 86400) return Math.floor(seconds / 3600) + "h ago";
  return Math.floor(seconds / 86400) + "d ago";
}

function setConn(ok) {
  const dot = el("conn-dot");
  if (!dot) return;
  dot.className = "h-2.5 w-2.5 rounded-full " + (ok ? "bg-emerald-500" : "bg-rose-500");
}

function badge(text, tone) {
  const tones = {
    ok: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    warn: "bg-amber-50 text-amber-700 ring-amber-600/20",
    danger: "bg-rose-50 text-rose-700 ring-rose-600/20",
    muted: "bg-slate-100 text-slate-600 ring-slate-500/20",
    info: "bg-brand-50 text-brand-700 ring-brand-600/20",
  };
  return `<span class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${
    tones[tone] || tones.muted
  }">${text}</span>`;
}

function motionBadge(v) {
  return v ? badge("Detected", "danger") : badge("Clear", "ok");
}
function smokeBadge(v) {
  return v ? badge("Detected", "danger") : badge("Clear", "ok");
}
function stateBadge(state) {
  if (state === "stopped") return badge("Stopped", "warn");
  if (state === "following") return badge("Following line", "info");
  return badge("Idle", "muted");
}

// ---------- shared header widgets ----------
function startClock() {
  const clock = el("clock");
  if (!clock) return;
  const tick = () => (clock.textContent = new Date().toLocaleTimeString());
  tick();
  setInterval(tick, 1000);
}

async function refreshOpenAlerts() {
  try {
    const data = await getJSON("/api/security/alerts?open=1");
    const badgeEl = el("open-alerts-badge");
    if (badgeEl) {
      if (data.open_count > 0) {
        badgeEl.textContent = data.open_count;
        badgeEl.classList.remove("hidden");
      } else {
        badgeEl.classList.add("hidden");
      }
    }
    setConn(true);
  } catch (e) {
    setConn(false);
  }
}

function registerPoll(fn, interval) {
  const run = async () => {
    try {
      await fn();
      setConn(true);
    } catch (e) {
      setConn(false);
    }
  };
  run();
  setInterval(run, interval);
}

// ---------- shared renderers ----------
function setVideo(imgId, placeholderId, url) {
  const img = el(imgId);
  const placeholder = el(placeholderId);
  if (!img || !placeholder) return;
  if (url) {
    if (img.getAttribute("src") !== url) img.src = url;
    img.classList.remove("hidden");
    placeholder.classList.add("hidden");
  } else {
    img.classList.add("hidden");
    placeholder.classList.remove("hidden");
  }
}

function renderAlerts(tbody, alerts, withResolve) {
  if (!tbody) return;
  if (!alerts.length) {
    const cols = withResolve ? 4 : 3;
    tbody.innerHTML = `<tr><td colspan="${cols}" class="px-5 py-6 text-center text-slate-400">No alerts</td></tr>`;
    return;
  }
  tbody.innerHTML = alerts
    .map((a) => {
      const tone = a.alert_type === "smoke" || a.alert_type === "motion" ? "danger" : "warn";
      const action = withResolve
        ? a.is_resolved
          ? `<td class="px-5 py-3 text-right">${badge("Resolved", "muted")}</td>`
          : `<td class="px-5 py-3 text-right"><button onclick="resolveAlert(${a.id})" class="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">Resolve</button></td>`
        : "";
      return `<tr>
        <td class="px-5 py-3">${badge(esc(a.alert_type), tone)}</td>
        <td class="px-5 py-3 text-slate-700">${esc(a.message)}</td>
        <td class="px-5 py-3 text-slate-500">${fmtDateTime(a.created_at)}</td>
        ${action}
      </tr>`;
    })
    .join("");
}

function renderReadings(tbody, readings) {
  if (!tbody) return;
  if (!readings.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-6 text-center text-slate-400">No readings</td></tr>`;
    return;
  }
  tbody.innerHTML = readings
    .map(
      (r) => `<tr>
      <td class="px-5 py-3 text-slate-500">${fmtDateTime(r.created_at)}</td>
      <td class="px-5 py-3 text-slate-700">${r.temperature ?? "—"}</td>
      <td class="px-5 py-3 text-slate-700">${r.humidity ?? "—"}</td>
      <td class="px-5 py-3">${motionBadge(r.motion)}</td>
      <td class="px-5 py-3">${smokeBadge(r.smoke)}</td>
    </tr>`
    )
    .join("");
}

function renderCheckpointsMini(container, checkpoints) {
  if (!container) return;
  container.innerHTML = checkpoints
    .map(
      (c) => `<div class="rounded-lg border border-slate-100 bg-slate-50 p-4">
      <div class="flex items-center justify-between">
        <p class="text-sm font-medium text-slate-900">${esc(c.name)}</p>
        ${c.is_stopped ? badge("Stopped", "warn") : badge("Clear", "ok")}
      </div>
      <p class="mt-2 text-xs text-slate-500">${
        c.item ? esc(c.item.title) : "No item"
      }</p>
    </div>`
    )
    .join("");
}

function renderCheckpointsGrid(container, checkpoints) {
  if (!container) return;
  container.innerHTML = checkpoints
    .map(
      (c) => `<div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-slate-900">${esc(c.name)}</h3>
        ${c.is_stopped ? badge("Car stopped", "warn") : badge("Clear", "ok")}
      </div>
      <dl class="mt-4 space-y-2 text-sm">
        <div class="flex justify-between"><dt class="text-slate-500">Item</dt><dd class="font-medium text-slate-900">${
          c.item ? esc(c.item.title) : "—"
        }</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Last stop</dt><dd class="text-slate-600">${
          c.last_stopped_at ? fmtDateTime(c.last_stopped_at) : "—"
        }</dd></div>
      </dl>
      <a href="${esc(c.qr_link || "#")}" target="_blank" rel="noopener" class="mt-4 inline-block truncate text-xs font-medium text-brand-600 hover:text-brand-800">${esc(
        c.qr_link || "no link"
      )}</a>
    </div>`
    )
    .join("");
}

function renderItemsTable(tbody, items) {
  if (!tbody) return;
  tbody.innerHTML = items
    .map(
      (i) => `<tr>
      <td class="px-5 py-3 text-slate-600">${esc(i.checkpoint_name || "—")}</td>
      <td class="px-5 py-3"><input id="item-title-${i.id}" value="${esc(i.title || "")}" class="w-40 rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-brand-400 focus:outline-none" /></td>
      <td class="px-5 py-3"><input id="item-url-${i.id}" value="${esc(i.content_url || "")}" class="w-56 rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-brand-400 focus:outline-none" /></td>
      <td class="px-5 py-3"><textarea id="item-summary-${i.id}" rows="2" class="w-72 rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-brand-400 focus:outline-none">${esc(i.summary || "")}</textarea></td>
      <td class="px-5 py-3 text-right">
        <button onclick="saveItem(${i.id})" class="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">Save</button>
        <span id="item-note-${i.id}" class="ml-2 text-xs text-emerald-600"></span>
      </td>
    </tr>`
    )
    .join("");
}

// ---------- page: dashboard ----------
function initDashboard() {
  registerPoll(async () => {
    const data = await getJSON("/api/security/latest");
    const r = data.latest;
    if (r) {
      el("stat-temp").textContent = r.temperature ?? "--";
      el("stat-humidity").textContent = r.humidity ?? "--";
      el("stat-motion").innerHTML = motionBadge(r.motion);
      el("stat-smoke").innerHTML = smokeBadge(r.smoke);
      el("stat-updated").textContent = "Updated " + timeAgo(r.created_at);
    }
  }, 4000);

  registerPoll(async () => {
    const data = await getJSON("/api/security/alerts");
    renderAlerts(el("alerts-body"), data.alerts.slice(0, 6), false);
  }, 5000);

  registerPoll(async () => {
    const cps = await getJSON("/api/checkpoints");
    renderCheckpointsMini(el("checkpoints-mini"), cps.checkpoints);
    const robot = (await getJSON("/api/robot/status")).robot;
    el("robot-state").innerHTML = stateBadge(robot.state);
    el("robot-cp").textContent = robot.current_checkpoint ? robot.current_checkpoint.name : "None";
    setVideo("video-feed", "video-placeholder", robot.video_url);
  }, 4000);
}

// ---------- page: security ----------
function initSecurity() {
  registerPoll(async () => {
    const data = await getJSON("/api/security/latest");
    if (data.latest) {
      el("sec-temp").textContent = data.latest.temperature ?? "--";
      el("sec-humidity").textContent = data.latest.humidity ?? "--";
      el("sec-motion").innerHTML = motionBadge(data.latest.motion);
      el("sec-smoke").innerHTML = smokeBadge(data.latest.smoke);
      el("sec-updated").textContent = "Updated " + timeAgo(data.latest.created_at);
    }
    renderReadings(el("sec-readings-body"), data.recent);
  }, 4000);

  registerPoll(async () => {
    const data = await getJSON("/api/security/alerts");
    renderAlerts(el("sec-alerts-body"), data.alerts, true);
  }, 4000);
}

window.resolveAlert = async (id) => {
  await postJSON(`/api/alerts/${id}/resolve`, {});
  const data = await getJSON("/api/security/alerts");
  renderAlerts(el("sec-alerts-body"), data.alerts, true);
  refreshOpenAlerts();
};

// ---------- page: robot ----------
let lastLoadedCheckpoint = null;

async function loadCheckpointContent(cpId) {
  if (!cpId) return;
  const data = await getJSON(`/api/items/checkpoint/${cpId}/content`);
  if (data.ok) {
    el("item-title").textContent = data.title || "";
    el("item-text").textContent = data.text || "";
    el("item-source").textContent = "source: " + data.source;
  }
}

async function scanQr() {
  const url = el("qr-url").value.trim();
  if (!url) return;
  const data = await postJSON("/api/qr/scan", { content: url });
  if (data.ok) {
    el("item-title").textContent = "Scanned item";
    el("item-text").textContent = data.text || data.content;
    el("item-source").textContent = "source: qr link";
  }
}

async function initRobot() {
  const select = el("cp-select");
  try {
    const cps = (await getJSON("/api/checkpoints")).checkpoints;
    if (select) {
      select.innerHTML = cps
        .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
        .join("");
    }
  } catch (e) {
    setConn(false);
  }

  el("load-content-btn")?.addEventListener("click", () =>
    loadCheckpointContent(select.value)
  );
  el("read-btn")?.addEventListener("click", () => {
    const title = el("item-title").textContent;
    const text = el("item-text").textContent;
    Speech.speak(title + ". " + text, {
      rate: parseFloat(el("rate")?.value || "1"),
      voiceName: el("voice")?.value,
    });
  });
  el("stop-btn")?.addEventListener("click", () => Speech.stop());
  el("scan-btn")?.addEventListener("click", scanQr);

  el("video-url-save")?.addEventListener("click", async () => {
    const input = el("video-url-input");
    const note = el("video-url-note");
    const url = input ? input.value.trim() : "";
    const data = await postJSON("/api/robot/status", { video_url: url });
    if (data.ok) {
      setVideo("video-feed", "video-placeholder", data.robot.video_url);
      if (note) {
        note.textContent = url ? "Saved. Live feed updated." : "Cleared.";
        note.className = "mt-2 text-sm text-emerald-600";
      }
    } else if (note) {
      note.textContent = "Could not save the URL.";
      note.className = "mt-2 text-sm text-rose-600";
    }
  });

  try {
    const robot = (await getJSON("/api/robot/status")).robot;
    const input = el("video-url-input");
    if (input) input.value = robot.video_url || "";
  } catch (e) {
    setConn(false);
  }

  registerPoll(async () => {
    const robot = (await getJSON("/api/robot/status")).robot;
    el("robot-state").innerHTML = stateBadge(robot.state);
    el("robot-cp").textContent = robot.current_checkpoint ? robot.current_checkpoint.name : "None";
    setVideo("video-feed", "video-placeholder", robot.video_url);

    if (
      robot.state === "stopped" &&
      robot.current_checkpoint_id &&
      lastLoadedCheckpoint !== robot.current_checkpoint_id
    ) {
      lastLoadedCheckpoint = robot.current_checkpoint_id;
      if (select) select.value = robot.current_checkpoint_id;
      loadCheckpointContent(robot.current_checkpoint_id);
    }
  }, 3000);
}

// ---------- page: checkpoints ----------
function initCheckpoints() {
  registerPoll(async () => {
    const data = await getJSON("/api/checkpoints");
    renderCheckpointsGrid(el("checkpoints-grid"), data.checkpoints);
  }, 3000);
}

// ---------- page: items ----------
async function initItems() {
  try {
    const data = await getJSON("/api/items");
    renderItemsTable(el("items-body"), data.items);
    setConn(true);
  } catch (e) {
    setConn(false);
  }
}

window.saveItem = async (id) => {
  const payload = {
    title: el(`item-title-${id}`).value,
    content_url: el(`item-url-${id}`).value,
    summary: el(`item-summary-${id}`).value,
  };
  const data = await postJSON(`/api/items/${id}`, payload);
  const note = el(`item-note-${id}`);
  if (note) {
    note.textContent = data.ok ? "Saved" : "Error";
    setTimeout(() => (note.textContent = ""), 2000);
  }
};

// ---------- bootstrap ----------
document.addEventListener("DOMContentLoaded", () => {
  startClock();
  refreshOpenAlerts();
  setInterval(refreshOpenAlerts, 6000);

  const pages = {
    dashboard: initDashboard,
    security: initSecurity,
    robot: initRobot,
    checkpoints: initCheckpoints,
    items: initItems,
  };
  (pages[document.body.dataset.page] || function () {})();
});
