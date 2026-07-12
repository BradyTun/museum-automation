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
function createVideoStream(imgId, placeholderId) {
  const img = el(imgId);
  const placeholder = el(placeholderId);
  const defaultMsg = placeholder ? placeholder.textContent : "";
  let baseUrl = "";
  let watchdog = null;
  let retry = null;
  let stopping = false;

  function clearTimers() {
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
    if (retry) {
      clearTimeout(retry);
      retry = null;
    }
  }
  function showPlaceholder(msg) {
    if (img) img.classList.add("hidden");
    if (placeholder) {
      placeholder.textContent = msg;
      placeholder.classList.remove("hidden");
    }
  }
  function showImage() {
    if (placeholder) placeholder.classList.add("hidden");
    if (img) img.classList.remove("hidden");
  }
  function connect() {
    if (!img || !baseUrl) return;
    clearTimers();
    showPlaceholder("Connecting to camera...");
    // A fresh query value forces a brand new connection and drops any
    // stale one, so a black frame does not stay stuck forever.
    const sep = baseUrl.includes("?") ? "&" : "?";
    stopping = false;
    img.src = baseUrl + sep + "cb=" + Date.now();
    // If no first frame arrives in time, drop it and try again.
    watchdog = setTimeout(connect, 8000);
  }

  if (img) {
    img.addEventListener("load", () => {
      clearTimers(); // first frame arrived, the stream is healthy
      showImage();
    });
    img.addEventListener("error", () => {
      if (stopping) {
        stopping = false;
        return;
      }
      clearTimers();
      showPlaceholder("Reconnecting to camera...");
      retry = setTimeout(connect, 1500);
    });
  }

  // Release the camera connection while the tab is hidden, then resume.
  document.addEventListener("visibilitychange", () => {
    if (!baseUrl) return;
    if (document.hidden) {
      clearTimers();
      stopping = true;
      if (img) img.src = "";
    } else {
      connect();
    }
  });

  return {
    set(url) {
      url = url || "";
      if (url === baseUrl) return; // no change, keep the current stream
      baseUrl = url;
      if (!url) {
        clearTimers();
        stopping = true;
        if (img) img.src = "";
        showPlaceholder(defaultMsg);
        return;
      }
      connect();
    },
    reconnect() {
      if (baseUrl) connect();
    },
  };
}

const _videoStreams = {};

function setVideo(imgId, placeholderId, url) {
  let stream = _videoStreams[imgId];
  if (!stream) {
    stream = createVideoStream(imgId, placeholderId);
    _videoStreams[imgId] = stream;
  }
  stream.set(url || "");
  return stream;
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
let tourScript = { title: "", text: "" };
let checkpointDetected = false;
let serialPort = null;
let serialReader = null;
let serialKeepReading = false;

function speakTourScript() {
  Speech.speak((tourScript.title || "") + ". " + (tourScript.text || ""), {
    rate: parseFloat(el("rate")?.value || "1"),
    voiceName: el("voice")?.value,
  });
}

function setCheckpointDetected(on) {
  if (on === checkpointDetected) return; // only act on a real change
  checkpointDetected = on;
  if (el("cp-badge")) {
    el("cp-badge").innerHTML = on
      ? badge("Checkpoint detected", "warn")
      : badge("Waiting for car", "muted");
  }
  if (el("robot-state")) {
    el("robot-state").innerHTML = stateBadge(on ? "stopped" : "following");
  }
  if (el("robot-cp")) {
    el("robot-cp").textContent = on ? "Main Checkpoint" : "None";
  }
  if (on) speakTourScript();
}

function handleSerialMessage(raw) {
  const msg = (raw || "").trim().toUpperCase();
  if (!msg) return;
  if (el("serial-log")) el("serial-log").textContent = "Last message: " + msg;
  if (msg.includes("STOP")) {
    setCheckpointDetected(true);
  } else if (
    msg.includes("GO") ||
    msg.includes("START") ||
    msg.includes("CLEAR") ||
    msg.includes("RESUME")
  ) {
    setCheckpointDetected(false);
  }
}

function setBluetoothStatus(connected, text) {
  const dot = el("bt-dot");
  if (dot) {
    dot.className =
      "h-2.5 w-2.5 rounded-full " + (connected ? "bg-emerald-500" : "bg-slate-300");
  }
  if (el("bt-text")) {
    el("bt-text").textContent =
      text || (connected ? "Bluetooth connected" : "Bluetooth off");
  }
  if (el("bt-btn")) el("bt-btn").textContent = connected ? "Disconnect" : "Connect Bluetooth";
}

async function readSerialLoop() {
  const decoder = new TextDecoderStream();
  serialPort.readable.pipeTo(decoder.writable).catch(() => {});
  serialReader = decoder.readable.getReader();
  let buffer = "";
  try {
    while (serialKeepReading) {
      const { value, done } = await serialReader.read();
      if (done) break;
      buffer += value;
      let idx;
      while ((idx = buffer.search(/[\r\n]/)) >= 0) {
        handleSerialMessage(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
      }
      // Fast path in case the module sends STOP without a line break.
      if (buffer.length > 80) buffer = buffer.slice(-80);
      if (buffer.toUpperCase().includes("STOP")) {
        handleSerialMessage("STOP");
        buffer = "";
      }
    }
  } catch (e) {
    // read failed, most likely the device was disconnected
  } finally {
    try {
      serialReader.releaseLock();
    } catch (e) {}
  }
}

async function connectBluetoothSerial() {
  if (!("serial" in navigator)) {
    setBluetoothStatus(false, "Web Serial not supported");
    if (el("serial-log")) {
      el("serial-log").textContent =
        "Open this page in Chrome or Edge to use Bluetooth serial.";
    }
    return;
  }
  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 9600 });
    serialKeepReading = true;
    setBluetoothStatus(true, "Bluetooth connected");
    readSerialLoop();
  } catch (e) {
    serialPort = null;
    setBluetoothStatus(false, "Not connected");
  }
}

async function disconnectBluetoothSerial() {
  serialKeepReading = false;
  try {
    if (serialReader) await serialReader.cancel();
  } catch (e) {}
  try {
    if (serialPort) await serialPort.close();
  } catch (e) {}
  serialPort = null;
  serialReader = null;
  setBluetoothStatus(false, "Bluetooth off");
}

async function initRobot() {
  // Load the hardcoded exhibit script once.
  try {
    tourScript = await getJSON("/api/tour/script");
    el("item-title").textContent = tourScript.title || "";
    el("item-text").textContent = tourScript.text || "";
    el("item-source").textContent = "hardcoded script";
  } catch (e) {
    setConn(false);
  }

  el("read-btn")?.addEventListener("click", speakTourScript);
  el("stop-btn")?.addEventListener("click", () => Speech.stop());

  // Camera stream URL is view only.
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

  el("video-reconnect")?.addEventListener("click", () => {
    const stream = _videoStreams["video-feed"];
    if (stream) stream.reconnect();
  });

  try {
    const robot = (await getJSON("/api/robot/status")).robot;
    const input = el("video-url-input");
    if (input) input.value = robot.video_url || "";
    setVideo("video-feed", "video-placeholder", robot.video_url);
  } catch (e) {
    setConn(false);
  }

  // Bluetooth serial: mark the checkpoint when the module sends STOP at 9600 baud.
  el("bt-btn")?.addEventListener("click", () => {
    if (serialPort) disconnectBluetoothSerial();
    else connectBluetoothSerial();
  });
  if ("serial" in navigator) {
    navigator.serial.addEventListener("disconnect", () => {
      if (serialPort) disconnectBluetoothSerial();
    });
  }

  // Starting UI state.
  if (el("cp-badge")) el("cp-badge").innerHTML = badge("Waiting for car", "muted");
  if (el("robot-state")) el("robot-state").innerHTML = stateBadge("idle");
  if (el("robot-cp")) el("robot-cp").textContent = "None";
  setBluetoothStatus(false, "Bluetooth off");

  // Test without hardware: run simulateSerial("STOP") in the browser console,
  // or open /robot?test=1 to get on-page Test STOP and Test GO buttons.
  window.simulateSerial = (msg) => handleSerialMessage(msg || "STOP");
  if (new URLSearchParams(location.search).has("test")) {
    const host = el("bt-btn")?.parentElement;
    if (host) {
      const makeTestButton = (label, message, className) => {
        const button = document.createElement("button");
        button.textContent = label;
        button.className = className;
        button.addEventListener("click", () => handleSerialMessage(message));
        host.appendChild(button);
      };
      makeTestButton(
        "Test STOP",
        "STOP",
        "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
      );
      makeTestButton(
        "Test GO",
        "GO",
        "rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
      );
    }
  }
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
