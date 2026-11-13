const BASE_STYLE = [
    "display:inline-block",
    "margin-left:6px",
    "padding:1px 6px",
    "border-radius:3px",
    "font-size:11px",
    "font-weight:bold",
    "vertical-align:middle",
    "cursor:default",
    "font-family:sans-serif",
    "line-height:1.4",
].join(";");

const STYLE_LOADING = `${BASE_STYLE};background:#ddd;color:#666`;
const STYLE_RATED   = `${BASE_STYLE};background:#1a73e8;color:#fff`;
const STYLE_NONE    = `${BASE_STYLE};background:#eee;color:#aaa`;

function updateBadge(badge, data) {
    if (!badge.isConnected) return;
    // RMP reports avgRating 0 for professors with no reviews
    if (!data || data.avgRating == null || !data.numRatings) {
        badge.style.cssText = STYLE_NONE;
        badge.textContent = "N/A";
        return;
    }
    badge.style.cssText = STYLE_RATED + ";text-decoration:none";
    badge.textContent = `⭐ ${data.avgRating.toFixed(1)}`;
    if (data.url) {
        badge.href = data.url;
        badge.target = "_blank";
        badge.rel = "noopener noreferrer";
    }
    // RMP uses -1 when no one has answered the "would take again" question
    const again = data.wouldTakeAgainPercent != null && data.wouldTakeAgainPercent >= 0
        ? `${Math.round(data.wouldTakeAgainPercent)}%` : "?";
    const diff = data.avgDifficulty != null
        ? data.avgDifficulty.toFixed(1) : "?";
    badge.title = `${data.numRatings} rating${data.numRatings !== 1 ? "s" : ""} · Difficulty: ${diff} · Would take again: ${again}`;
}

function processRow(tr) {
    // A row can list several instructors (co-taught sections)
    tr.querySelectorAll("a.email").forEach(processLink);
}

function processLink(link) {
    if (link.dataset.rmrDone) return;

    const name = link.textContent.trim();
    if (!name) return;

    link.dataset.rmrDone = "1";

    const td = link.parentElement;
    td.style.overflow = "visible";
    td.style.whiteSpace = "normal";

    const badge = document.createElement("a");
    badge.style.cssText = STYLE_LOADING;
    badge.textContent = "…";
    link.insertAdjacentElement("afterend", badge);

    // chrome.runtime.id is undefined when the extension is reloaded mid-session
    if (!chrome.runtime?.id) return;
    try {
        chrome.runtime.sendMessage({ type: "LOOKUP_PROF", name })
            .then(resp => updateBadge(badge, resp))
            .catch(() => {});
    } catch (_) {
        // Extension context invalidated (reloaded while tab was open)
    }
}

function scanNode(root) {
    if (root.matches?.("tr") && root.closest("table#table1")) {
        processRow(root);
        return;
    }
    root.querySelectorAll?.("table#table1 tbody tr").forEach(processRow);
}

document.querySelectorAll("table#table1 tbody tr").forEach(processRow);

new MutationObserver((mutations) => {
    for (const m of mutations) {
        for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) scanNode(node);
        }
    }
}).observe(document.body, { childList: true, subtree: true });
