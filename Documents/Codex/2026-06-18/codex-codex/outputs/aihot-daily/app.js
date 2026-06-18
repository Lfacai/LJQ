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

function formatTime(value) {
  if (!value) return "刚刚";
  return timeFormatter.format(new Date(value));
}

function formatDate(value) {
  return value ? dateFormatter.format(new Date(value)) : "今日";
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
  const groups = buildGroups(filteredItems(state.data.items));
  const total = state.data.items.length;
  els.count.textContent = `${total} 条`;
  els.updated.textContent = formatTime(state.data.generatedAt);
  renderPills(buildGroups(state.data.items));
  renderRail(buildGroups(state.data.items));
  renderSections(groups);
}

async function loadData() {
  const inline = document.getElementById("aihot-data")?.textContent?.trim();
  if (inline && inline !== "__AIHOT_INLINE_DATA__") {
    state.data = JSON.parse(inline);
    render();
    return;
  }

  const response = await fetch("./data.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load data.json: ${response.status}`);
  }
  state.data = await response.json();
  render();
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

loadData().catch((error) => {
  els.sections.innerHTML = `<section class="section"><div class="empty-state">加载失败：${error.message}</div></section>`;
  els.empty.classList.add("hidden");
  console.error(error);
});
