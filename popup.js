const TARGET_SELECTOR = "main";
const API_URL         = "https://portal.globalleadersinc.com/api/v1/linkedin-profile-hunter";
const BOARDS_URL      = "https://portal.globalleadersinc.com/api/v1/trello/boards";


// ── DOM refs ──────────────────────────────────────────────────────────────────
const dot             = document.getElementById("dot");
const spinner         = document.getElementById("spinner");
const scanText        = document.getElementById("scanText");
const copyBtn         = document.getElementById("copyBtn");
const btnLabel        = document.getElementById("btnLabel");
const btnIcon         = document.getElementById("btnIcon");
const toast           = document.getElementById("toast");
const progressSection = document.getElementById("progressSection");
const progressBar     = document.getElementById("progressBar");
const progressPct     = document.getElementById("progressPct");
const stepLabel       = document.getElementById("stepLabel");
const resultSection   = document.getElementById("resultSection");
const resultBody      = document.getElementById("resultBody");
const recopyBtn       = document.getElementById("recopyBtn");

const boardSelect   = document.getElementById("boardSelect");
const boardRefresh  = document.getElementById("boardRefresh");
const rememberBoard = document.getElementById("rememberBoard");

const steps = [
  document.getElementById("step1"),
  document.getElementById("step2"),
  document.getElementById("step3"),
  document.getElementById("step4"),
];

let foundCount = 0;
let lastResult = "";
let scanOk     = false;

// ── Trello board picker ───────────────────────────────────────────────────────
// Boards come live from the portal (which reads Trello), so newly created
// boards appear here automatically. The selection can be remembered in
// chrome.storage until the user picks a different board.

function updateHuntEnabled() {
  copyBtn.disabled = !(scanOk && boardSelect.value);
}

async function loadBoards() {
  boardSelect.disabled = true;
  boardSelect.innerHTML = '<option value="">Loading boards…</option>';
  updateHuntEnabled();

  let boards = [];
  try {
    const res = await fetch(BOARDS_URL);
    const json = await res.json();
    if (!res.ok || !json?.success) throw new Error(json?.message || `HTTP ${res.status}`);
    boards = json.data || [];
  } catch (err) {
    boardSelect.innerHTML = '<option value="">Couldn\'t load boards — retry ↻</option>';
    return;
  }

  if (!boards.length) {
    boardSelect.innerHTML = '<option value="">No boards found</option>';
    return;
  }

  const { savedBoardId, savedBoardRemember } = await chrome.storage.local.get([
    "savedBoardId",
    "savedBoardRemember",
  ]).then((s) => ({
    savedBoardId: s.savedBoardId || "",
    savedBoardRemember: !!s.savedBoardRemember,
  }));

  boardSelect.innerHTML = '<option value="">Select a board…</option>';
  boards.forEach(({ id, name }) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    boardSelect.appendChild(opt);
  });

  rememberBoard.checked = savedBoardRemember;

  // Restore the remembered board only if it still exists on Trello.
  if (savedBoardRemember && boards.some((b) => b.id === savedBoardId)) {
    boardSelect.value = savedBoardId;
  }

  boardSelect.disabled = false;
  updateHuntEnabled();
}

async function persistBoardChoice() {
  if (rememberBoard.checked && boardSelect.value) {
    await chrome.storage.local.set({
      savedBoardId: boardSelect.value,
      savedBoardRemember: true,
    });
  } else {
    await chrome.storage.local.set({
      savedBoardId: "",
      savedBoardRemember: rememberBoard.checked,
    });
  }
}

boardSelect.addEventListener("change", () => {
  persistBoardChoice();
  updateHuntEnabled();
});

rememberBoard.addEventListener("change", persistBoardChoice);
boardRefresh.addEventListener("click", loadBoards);

// ── Scan helpers ──────────────────────────────────────────────────────────────

function setDot(state) {
  dot.className = "dot" + (state ? " " + state : "");
}

function setScanning() {
  spinner.classList.remove("hidden");
  scanText.textContent = "Scanning…";
  scanText.className = "scan-text";
  setDot("");
  scanOk = false;
  updateHuntEnabled();
}

function setInactive(msg) {
  spinner.classList.add("hidden");
  scanText.textContent = msg;
  scanText.className = "scan-text notfound";
  setDot("inactive");
  scanOk = false;
  updateHuntEnabled();
}

function setFound(count) {
  spinner.classList.add("hidden");
  scanText.textContent = `${count} element${count !== 1 ? "s" : ""} found`;
  scanText.className = "scan-text found";
  setDot("active");
  scanOk = true;
  updateHuntEnabled();
}

function setNotFound() {
  spinner.classList.add("hidden");
  scanText.textContent = "No elements found";
  scanText.className = "scan-text notfound";
  setDot("inactive");
  scanOk = false;
  updateHuntEnabled();
}

// ── Page scan ─────────────────────────────────────────────────────────────────

async function scanPage() {
  setScanning();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url?.match(/linkedin\.com/)) {
    setInactive("Not on LinkedIn");
    return;
  }

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel) => document.querySelectorAll(sel).length,
      args: [TARGET_SELECTOR],
    });
  } catch {
    setInactive("Cannot access page");
    return;
  }

  foundCount = results?.[0]?.result ?? 0;
  foundCount > 0 ? setFound(foundCount) : setNotFound();
}

// ── Progress helpers ──────────────────────────────────────────────────────────

function showProgress() {
  progressSection.style.display = "flex";
  resultSection.style.display   = "none";
  setProgress(0, "Starting…", 0);
  steps.forEach((s) => s.className = "step");
}

function setProgress(pct, label, transitionMs = 600) {
  progressBar.style.transition = `width ${transitionMs}ms cubic-bezier(0.4,0,0.2,1)`;
  progressBar.style.width = pct + "%";
  progressPct.textContent = pct + "%";
  stepLabel.textContent   = label;

  if (pct >= 100) {
    progressBar.classList.add("done");
  } else {
    progressBar.classList.remove("done");
  }
}

function activateStep(index) {
  steps.forEach((s, i) => {
    if (i < index)        s.className = "step done";
    else if (i === index) s.className = "step active";
    else                  s.className = "step";
  });
}

// ── Result rendering ──────────────────────────────────────────────────────────

function renderResult(created, skipped) {
  resultBody.innerHTML = "";

  const buildSection = (title, profiles) => {
    if (!profiles.length) return;

    const heading = document.createElement("div");
    heading.className = "result-section-title";
    heading.textContent = `${title} (${profiles.length})`;
    resultBody.appendChild(heading);

    profiles.forEach(({ name, country, url }) => {
      const row = document.createElement("div");
      row.className = "result-row";

      const nameEl = document.createElement("span");
      nameEl.className = "result-name";
      nameEl.textContent = name;

      const countryEl = document.createElement("span");
      countryEl.className = "result-country";
      countryEl.textContent = country;

      const linkEl = document.createElement("a");
      linkEl.className = "result-link";
      linkEl.textContent = "View";
      linkEl.href   = url;
      linkEl.target = "_blank";
      linkEl.rel    = "noopener";

      row.append(nameEl, countryEl, linkEl);
      resultBody.appendChild(row);
    });
  };

  buildSection("Added to Trello", created);
  buildSection("Already Exists", skipped);

  resultSection.style.display = "flex";
}

// ── Main hunt handler ─────────────────────────────────────────────────────────

copyBtn.addEventListener("click", hunt);

async function hunt() {
  if (!boardSelect.value) {
    showToast("Select a Trello board first");
    return;
  }

  copyBtn.disabled = true;
  resultSection.style.display = "none";
  showProgress();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // ── Step 1: Extract HTML ───────────────────────────────────────────────────
  activateStep(0);
  setProgress(10, "Extracting HTML…", 300);

  let htmlPayload;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel) => {
        const els = document.querySelectorAll(sel);
        if (!els.length) return null;

        return Array.from(els).map((el) => {
          const links = [...new Set(
            [...el.querySelectorAll('a[href*="/in/"]')]
              .map((a) => a.href.split("?")[0])
              .filter((h) => /linkedin\.com\/in\//i.test(h))
          )];

          const text = (el.innerText || el.textContent || "").trim();

          return links.length
            ? `${text}\n\nProfile Links:\n${links.join("\n")}`
            : text;
        }).join("\n\n---\n\n");
      },
      args: [TARGET_SELECTOR],
    });

    htmlPayload = results?.[0]?.result;
  } catch {
    return huntFailed("Failed to extract page content");
  }

  if (!htmlPayload) {
    return huntFailed("Target element not found — rescan the page");
  }

  activateStep(1);
  setProgress(30, "Sending to AI…", 400);

  // ── Step 2: Call API ───────────────────────────────────────────────────────
  // FIX: was clearTimeout(crawl) but crawlProgress returns setInterval ID — must use clearInterval
  const crawl = crawlProgress(35, 75, 12000);

  let apiData;
  try {
    const form = new FormData();
    form.append("prompt", htmlPayload);
    form.append("board_id", boardSelect.value);

    const res = await fetch(API_URL, { method: "POST", body: form });

    clearInterval(crawl); // FIX: was clearTimeout — interval was never stopping

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return huntFailed(err?.message || `API error ${res.status}`);
    }

    apiData = await res.json();
  } catch (err) {
    clearInterval(crawl); // FIX: was clearTimeout
    return huntFailed("Network error — check your connection");
  }

  if (!apiData?.success) {
    return huntFailed(apiData?.message || "API returned failure");
  }

  // ── Step 3: Process ────────────────────────────────────────────────────────
  activateStep(2);
  setProgress(90, "Processing profiles…", 300);

  const created = apiData?.data?.created ?? [];
  const skipped = apiData?.data?.skipped ?? [];

  if (!created.length && !skipped.length) {
    return huntFailed("No profiles found");
  }

  await new Promise((r) => setTimeout(r, 350));

  // ── Step 4: Done ───────────────────────────────────────────────────────────
  activateStep(3);
  setProgress(100, "Ready to paste!", 300);

  await new Promise((r) => setTimeout(r, 400));

  renderResult(created, skipped);
  showToast(`${created.length} added · ${skipped.length} skipped`);
  copyBtn.classList.add("success");
  btnLabel.textContent = "✓  Hunt again";
  updateHuntEnabled();
}

// Smoothly crawl progress bar from `start` to `end` over `ms` milliseconds
function crawlProgress(start, end, ms) {
  const steps  = 20;
  const stepMs = ms / steps;
  const inc    = (end - start) / steps;
  let   current = start;
  let   count   = 0;

  const id = setInterval(() => {
    count++;
    current = Math.min(current + inc, end);
    setProgress(Math.round(current), "Waiting for AI response…", stepMs * 0.9);
    if (count >= steps) clearInterval(id);
  }, stepMs);

  return id;
}

function huntFailed(msg) {
  progressSection.style.display = "none";
  copyBtn.classList.add("error");
  btnLabel.textContent = "✕  Try again";
  updateHuntEnabled();
  showToast(msg);

  setTimeout(() => {
    copyBtn.classList.remove("error");
    btnLabel.textContent = "Hunt Profiles";
    updateHuntEnabled();
  }, 2500);
}

// ── Re-copy button ────────────────────────────────────────────────────────────
recopyBtn.addEventListener("click", async () => {
  if (!lastResult) return;
  try {
    await navigator.clipboard.writeText(lastResult);
    showToast("Copied again!");
  } catch {
    showToast("Clipboard write failed");
  }
});

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2800);
}

// ── Init ──────────────────────────────────────────────────────────────────────
scanPage();
loadBoards();
