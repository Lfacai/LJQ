import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const OUTPUT_DIR = path.join(ROOT, "outputs", "aihot-daily");

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
    <meta name="description" content="AI HOT 今日精选，按类别浏览最近 24 小时的精选日报。" />
    <title>AI HOT 今日精选</title>
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
          <h1>今日精选，按类别快速看完</h1>
          <p class="lede">把最近 24 小时内的精选 AI 日报收拢到一页，按模型、产品、行业、论文和技巧分类浏览。</p>
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
              <span class="metric-label">时间窗口</span>
              <strong>最近 24 小时</strong>
            </div>
          </div>
        </div>
        <aside class="hero-panel">
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
  const data = {
    source: "https://aihot.virxact.com",
    generatedAt,
    windowStart: since,
    windowHours: 24,
    total: items.length,
    groups: groupItems(items),
    items,
  };

  const css = await readFile(path.join(OUTPUT_DIR, "styles.css"), "utf8");
  const js = await readFile(path.join(OUTPUT_DIR, "app.js"), "utf8");

  await writeFile(path.join(OUTPUT_DIR, "data.json"), JSON.stringify(data, null, 2), "utf8");
  await writeFile(path.join(OUTPUT_DIR, "index.html"), buildHtml(data, css, js), "utf8");
  console.log(`Wrote ${items.length} items to ${path.join(OUTPUT_DIR, "data.json")}`);
}

await main();
