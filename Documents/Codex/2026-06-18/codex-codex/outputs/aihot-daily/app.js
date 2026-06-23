const CATEGORY_META = {
  all: { label: "全部", color: "var(--accent-2)" },
  "ai-models": { label: "模型发布", color: "var(--accent)" },
  "ai-products": { label: "产品发布", color: "var(--accent-2)" },
  industry: { label: "行业动态", color: "var(--accent-3)" },
  paper: { label: "论文研究", color: "#d7a8ff" },
  tip: { label: "技巧观点", color: "#f1cf73" },
  unknown: { label: "未分类", color: "#9ab4d1" },
};

const state = {
  data: null,
  category: "all",
  query: "",
};

const els = {
  count: document.getElementById("metric-count"),
  updated: document.getElementById("metric-updated"),
  syncStatus: document.getElementById("sync-status"),
  syncDetails: document.getElementById("sync-details"),
  datePicker: document.getElementById("date-picker"),
  dateGo: document.getElementById("date-go"),
  dateLatest: document.getElementById("date-latest"),
  search: document.getElementById("search"),
  rail: document.getElementById("rail"),
  sections: document.getElementById("sections"),
  pills: document.getElementById("category-pills"),
  empty: document.getElementById("empty-state"),
};

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatTime(value) {
  if (!value) return "刚刚";
  return timeFormatter.format(new Date(value));
}

function formatDate(value) {
  return value ? dateFormatter.format(new Date(value)) : "今日";
}

function dateKey(value) {
  return value ? dayKeyFormatter.format(new Date(value)) : "";
}

function nextRunLabel() {
  return "每日 07:20（北京时间）";
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function snapshotUrl(dateKey) {
  return dateKey ? `./data/${dateKey}.json` : "./data/latest.json";
}

function getDateParam() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("date");
  return value && isDateKey(value) ? value : "";
}

function navigateToDate(dateKey) {
  const url = new URL(window.location.href);
  if (dateKey) {
    url.searchParams.set("date", dateKey);
  } else {
    url.searchParams.delete("date");
  }
  window.location.href = url.toString();
}

function syncDatePicker(dateKey) {
  if (!els.datePicker) return;
  els.datePicker.max = dateKeyFromDate(new Date());
  els.datePicker.min = dateKeyFromDate(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
  els.datePicker.value = dateKey || dateKeyFromDate(new Date());
}

function normalizeCategory(category) {
  return CATEGORY_META[category] ? category : "unknown";
}

function buildGroups(items) {
  const map = new Map();
  for (const item of items) {
    const key = normalizeCategory(item.category);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].map(([key, groupItems]) => ({
    key,
    label: CATEGORY_META[key].label,
    color: CATEGORY_META[key].color,
    items: groupItems,
    count: groupItems.length,
  }));
}

function itemMatches(item, query) {
  if (!query) return true;
  const haystack = [item.title, item.source, item.summary, item.title_en]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function filteredItems(items) {
  return items.filter((item) => {
    const categoryOk = state.category === "all" || normalizeCategory(item.category) === state.category;
    return categoryOk && itemMatches(item, state.query);
  });
}

function renderPills(groups) {
  const total = state.data?.items?.length ?? 0;
  const fragments = [
    `<button class="pill ${state.category === "all" ? "active" : ""}" data-category="all">全部 ${total}</button>`,
    ...groups.map(
      (group) =>
        `<button class="pill ${state.category === group.key ? "active" : ""}" data-category="${group.key}">${group.label} ${group.count}</button>`,
    ),
  ];
  els.pills.innerHTML = fragments.join("");
}

function renderRail(groups) {
  els.rail.innerHTML = groups
    .map(
      (group) =>
        `<a href="#section-${group.key}" class="${state.category === group.key ? "active" : ""}">
          <span>${group.label}</span>
          <span class="count">${group.count}</span>
        </a>`,
    )
    .join("");
}

function renderSections(groups) {
  const visibleGroups = groups.filter((group) => group.items.length > 0);
  els.empty.classList.toggle("hidden", visibleGroups.length > 0);
  els.sections.innerHTML = visibleGroups
    .map((group) => {
      const items = group.items
        .map(
          (item) => `
            <article class="item">
              <div class="item-top">
                <div class="tag" style="background:${group.color}22;color:${group.color};">${group.label}</div>
                <div class="meta">
                  <span>${formatTime(item.publishedAt)}</span>
                  ${item.score != null ? `<span class="score">评分 ${item.score}</span>` : ""}
                </div>
              </div>
              <h3><a href="${item.url}" target="_blank" rel="noreferrer noopener">${item.title}</a></h3>
              <div class="meta">
                <span>${item.source}</span>
                ${item.selected ? "<span>精选</span>" : ""}
              </div>
              ${item.summary ? `<p class="summary">${item.summary}</p>` : ""}
            </article>
          `,
        )
        .join("");

      return `
        <section class="section" id="section-${group.key}">
          <div class="section-header">
            <div>
              <h2>${group.label}</h2>
              <span>${group.count} 条 · ${state.category === "all" ? "全部浏览" : "已筛选"}</span>
            </div>
            <span>${formatDate(state.data.date)}</span>
          </div>
          <div class="items">${items}</div>
        </section>
      `;
    })
    .join("");
}

function render() {
  if (!state.data) return;
  const groups = buildGroups(filteredItems(state.data.items));
  const total = state.data.items.length;
  els.count.textContent = `${total} 条`;
  els.updated.textContent = formatTime(state.data.generatedAt);
  const isFreshToday = dateKey(state.data.generatedAt) === dateKey(new Date());
  els.syncStatus.textContent = isFreshToday ? "今日已刷新" : "等待刷新";
  els.syncDetails.textContent = isFreshToday
    ? `已按 ${nextRunLabel()} 成功生成`
    : `上次生成时间：${formatTime(state.data.generatedAt)}`;
  els.syncStatus.parentElement.classList.toggle("status-ok", isFreshToday);
  els.syncStatus.parentElement.classList.toggle("status-warn", !isFreshToday);
  renderPills(buildGroups(state.data.items));
  renderRail(buildGroups(state.data.items));
  renderSections(groups);
}

async function loadData() {
  const inline = document.getElementById("aihot-data")?.textContent?.trim();
  const dateKey = getDateParam();
  const dataUrl = snapshotUrl(dateKey);

  if (inline && inline !== "__AIHOT_INLINE_DATA__" && !dateKey) {
    state.data = JSON.parse(inline);
    render();
    syncDatePicker("");
    return;
  }

  const response = await fetch(dataUrl, { cache: "no-store" });
  if (!response.ok) {
    const extra = dateKey ? `；该日期已超过 30 天保留期，可能已被清理` : "";
    throw new Error(`Failed to load ${dataUrl}: ${response.status}${extra}`);
  }
  state.data = await response.json();
  render();
  syncDatePicker(dateKey);
}

function dateKeyFromDate(input) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(input));
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  render();
});

els.search.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  render();
});

els.dateGo?.addEventListener("click", () => {
  const value = els.datePicker?.value || "";
  navigateToDate(value);
});

els.dateLatest?.addEventListener("click", () => {
  navigateToDate("");
});

els.datePicker?.addEventListener("change", () => {
  if (els.datePicker.value) {
    navigateToDate(els.datePicker.value);
  }
});

loadData().catch((error) => {
  els.sections.innerHTML = `<section class="section"><div class="empty-state">加载失败：${error.message}</div></section>`;
  els.empty.classList.add("hidden");
  console.error(error);
});
