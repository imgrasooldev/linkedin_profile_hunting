const TARGET_SELECTOR = "div._83309bd4._6e63fa0b.d343d86c";
const API_URL         = "http://portal.globalleadersinc.com/api/v1/linkedin-profile-hunter";


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

const steps = [
  document.getElementById("step1"),
  document.getElementById("step2"),
  document.getElementById("step3"),
  document.getElementById("step4"),
];

let foundCount   = 0;
let lastResult   = "";

// ── Scan helpers ──────────────────────────────────────────────────────────────

function setDot(state) {
  dot.className = "dot" + (state ? " " + state : "");
}

function setScanning() {
  spinner.classList.remove("hidden");
  scanText.textContent = "Scanning…";
  scanText.className = "scan-text";
  setDot("");
  copyBtn.disabled = true;
}

function setInactive(msg) {
  spinner.classList.add("hidden");
  scanText.textContent = msg;
  scanText.className = "scan-text notfound";
  setDot("inactive");
  copyBtn.disabled = true;
}

function setFound(count) {
  spinner.classList.add("hidden");
  scanText.textContent = `${count} element${count !== 1 ? "s" : ""} found`;
  scanText.className = "scan-text found";
  setDot("active");
  copyBtn.disabled = false;
}

function setNotFound() {
  spinner.classList.add("hidden");
  scanText.textContent = "No elements found";
  scanText.className = "scan-text notfound";
  setDot("inactive");
  copyBtn.disabled = true;
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
    if (i < index)       s.className = "step done";
    else if (i === index) s.className = "step active";
    else                 s.className = "step";
  });
}

// ── Result rendering ──────────────────────────────────────────────────────────

function renderResult(text) {
  resultBody.innerHTML = "";

  // Try to parse "Name | Country | LinkedIn URL" rows
  const lines = text.trim().split("\n").filter((l) => l.trim());
  const parsed = lines.map((line) => {
    const parts = line.split("|").map((p) => p.trim());
    return parts.length >= 3 ? parts : null;
  }).filter(Boolean);

  if (parsed.length > 0) {
    parsed.forEach(([name, country, url]) => {
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
      if (url.startsWith("http")) {
        linkEl.href   = url;
        linkEl.target = "_blank";
        linkEl.rel    = "noopener";
      } else {
        linkEl.textContent = url;
      }

      row.append(nameEl, countryEl, linkEl);
      resultBody.appendChild(row);
    });
  } else {
    // Fallback: show raw text
    const pre = document.createElement("div");
    pre.className = "result-raw";
    pre.textContent = text;
    resultBody.appendChild(pre);
  }

  resultSection.style.display = "flex";
}

// ── Main hunt handler ─────────────────────────────────────────────────────────

copyBtn.addEventListener("click", hunt);

async function hunt() {
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
          // Collect unique LinkedIn profile URLs from the element
          const links = [...new Set(
            [...el.querySelectorAll('a[href*="/in/"]')]
              .map((a) => a.href.split("?")[0])   // drop tracking params
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
  // Slowly walk bar to ~75% while waiting for OpenAI (typically 5-15s)
  const crawl = crawlProgress(35, 75, 12000);

  let apiData;
  try {
    const form = new FormData();
    form.append("prompt", htmlPayload);

    const res = await fetch(API_URL, { method: "POST", body: form });

    clearTimeout(crawl);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return huntFailed(err?.message || `API error ${res.status}`);
    }

    apiData = await res.json();
  } catch (err) {
    clearTimeout(crawl);
    return huntFailed("Network error — check your connection");
  }

  if (!apiData?.success) {
    return huntFailed(apiData?.message || "API returned failure");
  }

  // ── Step 3: Process ────────────────────────────────────────────────────────
  activateStep(2);
  setProgress(90, "Processing profiles…", 300);

  const resultText = apiData?.data?.response ?? "";

  if (!resultText) {
    return huntFailed("API returned empty response");
  }

  await new Promise((r) => setTimeout(r, 350));

  // ── Step 4: Copy to clipboard ──────────────────────────────────────────────
  activateStep(3);
  setProgress(100, "Ready to paste!", 300);

  try {
    await navigator.clipboard.writeText(resultText);
  } catch {
    // fallback
    const ta = Object.assign(document.createElement("textarea"), {
      value: resultText,
      style: "position:fixed;left:-9999px",
    });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  lastResult = resultText;

  await new Promise((r) => setTimeout(r, 400));

  renderResult(resultText);
  showToast("Profiles copied — just paste anywhere!");
  copyBtn.classList.add("success");
  btnLabel.textContent = "✓  Hunt again";
  copyBtn.disabled = false;
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
  copyBtn.disabled = false;
  showToast(msg);

  setTimeout(() => {
    copyBtn.classList.remove("error");
    btnLabel.textContent = "Hunt Profiles";
    copyBtn.disabled = false;
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
