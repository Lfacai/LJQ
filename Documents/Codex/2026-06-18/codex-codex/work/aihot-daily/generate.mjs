import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const OUTPUT_DIR = path.join(ROOT, "outputs", "aihot-daily");
const DATA_DIR = path.join(OUTPUT_DIR, "data");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CATEGORY_LABELS = {
  "ai-models": "模型发布",
  "ai-products": "产品发布",
  industry: "行业动态",
  paper: "论文研究",
  tip: "技巧观点",
};

function normalizeItem(item) {
  return {
    id: item.id,
    title: item.title,
    title_en: item.title_en ?? null,
    url: item.url,
    source: item.source,
    publishedAt: item.publishedAt ?? null,
    summary: item.summary ?? null,
    category: item.category ?? "unknown",
    score: item.score ?? null,
    selected: Boolean(item.selected),
  };
}

function formatDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function dateKeyToDayNumber(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

async function pruneOldSnapshots(retainDays = 30) {
  const entries = await readdir(DATA_DIR, { withFileTypes: true }).catch(() => []);
  const todayKey = formatDateKey();
  const todayDay = dateKeyToDayNumber(todayKey);
  const dateFilePattern = /^\d{4}-\d{2}-\d{2}\.json$/;

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && dateFilePattern.test(entry.name))
      .map(async (entry) => {
        const fileDateKey = entry.name.replace(/\.json$/, "");
        const ageDays = todayDay - dateKeyToDayNumber(fileDateKey);
        if (ageDays > retainDays) {
          await rm(path.join(DATA_DIR, entry.name), { force: true });
        }
      }),
  );
}

function groupItems(items) {
  const order = ["ai-models", "ai-products", "industry", "paper", "tip", "unknown"];
  const grouped = new Map(order.map((key) => [key, []]));
  for (const item of items) {
    const key = grouped.has(item.category) ? item.category : "unknown";
    grouped.get(key).push(item);
  }

  return order
    .map((key) => ({
      key,
      label: CATEGORY_LABELS[key] ?? "未分类",
      count: grouped.get(key).length,
      items: grouped.get(key),
    }))
    .filter((group) => group.count > 0);
}

function buildHtml(data, css, js) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="24 小时 AI 资讯精选，从新模型、新产品到行业动态，帮你快速抓住 AI 领域正在发生的重要变化。" />
    <title>AI HOT 24 小时 AI 资讯精选</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <div class="backdrop"></div>
    <script id="aihot-data" type="application/json">${JSON.stringify(data).replaceAll("</", "<\\/")}</script>
    <main class="shell">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">AI HOT · 每日 07:20 自动刷新</p>
          <h1>24 小时 AI 资讯精选</h1>
          <p class="lede">从新模型、新产品到行业动态，帮你快速抓住 AI 领域正在发生的重要变化。</p>
          <div class="hero-meta">
            <div class="metric">
              <span class="metric-label">本次收录</span>
              <strong id="metric-count">-</strong>
            </div>
            <div class="metric">
              <span class="metric-label">最后更新</span>
              <strong id="metric-updated">-</strong>
            </div>
            <div class="metric">
              <span class="metric-label">自动更新状态</span>
              <strong id="sync-status">-</strong>
              <small id="sync-details">-</small>
            </div>
            <div class="metric">
              <span class="metric-label">时间窗口</span>
              <strong>最近 24 小时</strong>
            </div>
          </div>
        </div>
        <aside class="hero-panel">
          <a
            class="manual-update"
            href="https://github.com/Lfacai/LJQ/actions/workflows/aihot-pages.yml"
            target="_blank"
            rel="noreferrer noopener"
          >
            <span class="manual-update-kicker">备用入口</span>
            <strong>手动更新</strong>
            <span class="manual-update-note">打开 GitHub Actions 手动运行页面，必要时可立即补跑一次更新。</span>
          </a>
          <label class="search" for="search">
            <span>搜索标题 / 来源 / 摘要</span>
            <input id="search" type="search" placeholder="试试输入 OpenAI、模型、论文..." />
          </label>
          <div class="category-pills" id="category-pills"></div>
        </aside>
      </section>

      <section class="board">
        <nav class="rail" id="rail"></nav>
        <div class="content">
          <div id="empty-state" class="empty-state hidden">没有找到匹配的条目。</div>
          <div id="sections"></div>
        </div>
      </section>
    </main>
    <script>
${js}
    </script>
  </body>
</html>
`;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const url = new URL("https://aihot.virxact.com/api/public/items");
  url.searchParams.set("mode", "selected");
  url.searchParams.set("since", since);
  url.searchParams.set("take", "50");

  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok) {
    throw new Error(`AI HOT request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const items = (payload.items ?? [])
    .map(normalizeItem)
    .sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime());

  const generatedAt = new Date().toISOString();
  const snapshotDate = formatDateKey();
  const data = {
    source: "https://aihot.virxact.com",
    date: snapshotDate,
    generatedAt,
    windowStart: since,
    windowHours: 24,
    total: items.length,
    groups: groupItems(items),
    items,
  };

  const css = await readFile(path.join(OUTPUT_DIR, "styles.css"), "utf8");
  const js = await readFile(path.join(OUTPUT_DIR, "app.js"), "utf8");

  const datedPath = path.join(DATA_DIR, `${snapshotDate}.json`);
  const latestPath = path.join(DATA_DIR, "latest.json");
  const aliasPath = path.join(OUTPUT_DIR, "data.json");

  await writeFile(datedPath, JSON.stringify(data, null, 2), "utf8");
  await writeFile(latestPath, JSON.stringify(data, null, 2), "utf8");
  await writeFile(aliasPath, JSON.stringify(data, null, 2), "utf8");
  await writeFile(path.join(OUTPUT_DIR, "index.html"), buildHtml(data, css, js), "utf8");
  await pruneOldSnapshots(30);
  console.log(`Wrote ${items.length} items to ${path.join(OUTPUT_DIR, "data.json")}`);
}

await main();
