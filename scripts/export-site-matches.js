const fs = require("fs");
const path = require("path");

function decodeHtmlEntities(value) {
  if (!value) return "";

  return String(value)
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || ""))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAll(pattern, text) {
  const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const results = [];
  let match = regex.exec(text);
  while (match) {
    results.push(match);
    match = regex.exec(text);
  }
  return results;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const positional = [];
  const options = {};

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, rawValue] = arg.slice(2).split("=");
      options[key] = rawValue === undefined ? true : rawValue;
    } else {
      positional.push(arg);
    }
  }

  return { positional, options };
}

function ensureAbsoluteOutput(filePath) {
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(process.cwd(), filePath);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "EverGreenSiteExport/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch fallita ${response.status} ${response.statusText} per ${url}`);
  }

  return response.text();
}

function buildUrlWithToken(urlString, token) {
  const url = new URL(urlString);
  if (token && !url.searchParams.has("token")) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}

function stripTokenFromUrl(urlString) {
  const url = new URL(urlString);
  url.searchParams.delete("token");
  return url.toString();
}

function parseMatchList(html, listUrl) {
  const base = new URL(listUrl);
  const totalMatch = html.match(/Totale:\s*<strong>(\d+)<\/strong>/i);
  const rowMatches = extractAll(
    /<tr>\s*<td>\s*<div class="hub-member-name">([\s\S]*?)<\/div>\s*<div class="hub-member-sub">([\s\S]*?)<\/div>\s*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>[\s\S]*?<span class="hub-badge [^"]+">\s*([\s\S]*?)\s*<\/span>[\s\S]*?<\/td>\s*<td>\s*([\s\S]*?)\s*<\/td>\s*<td>\s*<span class="hub-badge [^"]+">\s*([\s\S]*?)\s*<\/span>[\s\S]*?<\/td>\s*<td><a class="hub-day-link" href="([^"]+)">/gi,
    html
  );

  const matches = rowMatches.map(match => {
    const resultCell = stripTags(match[5]);
    const detailHref = decodeHtmlEntities(match[7]);
    return {
      title: stripTags(match[1]),
      slug: stripTags(match[2]),
      dateLabel: stripTags(match[3]),
      statusLabel: stripTags(match[4]),
      resultLabel: resultCell || "",
      reviewLabel: stripTags(match[6]),
      detailPath: detailHref,
      detailUrl: stripTokenFromUrl(new URL(detailHref, base.origin).toString()),
    };
  });

  return {
    total: totalMatch ? Number(totalMatch[1]) : matches.length,
    matches,
  };
}

function parseSummaryCards(html) {
  const cards = extractAll(
    /<article class="hub-grid-card">[\s\S]*?<div class="hub-summary-label">([\s\S]*?)<\/div>[\s\S]*?<div class="hub-summary-value(?:".*?)?>([\s\S]*?)<\/div>[\s\S]*?<div class="hub-summary-sub">([\s\S]*?)<\/div>[\s\S]*?<\/article>/gi,
    html
  );

  const summary = {};
  for (const card of cards) {
    summary[stripTags(card[1]).toLowerCase()] = {
      value: stripTags(card[2]),
      sub: stripTags(card[3]),
    };
  }
  return summary;
}

function parseMaps(html) {
  const mapMatches = extractAll(
    /<article class="hub-grid-card" style="margin:0; padding:16px;">[\s\S]*?<div class="hub-summary-label">Mappa\s+(\d+)<\/div>[\s\S]*?<div class="hub-member-name"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div class="hub-member-sub">([\s\S]*?)<\/div>[\s\S]*?<div class="hub-member-sub">([\s\S]*?)<\/div>[\s\S]*?<div style="margin-top:12px; font-size:24px; font-weight:900;">\s*([\s\S]*?)\s*<\/div>[\s\S]*?<\/article>/gi,
    html
  );

  return mapMatches.map(match => {
    const rawScore = stripTags(match[5]);
    const scoreMatch = rawScore.match(/(\d+)\s*-\s*(\d+)/);
    return {
      orderIndex: Number(match[1]),
      mode: stripTags(match[2]),
      mapName: stripTags(match[3]),
      sideName: stripTags(match[4]),
      scoreLabel: rawScore,
      team1Score: scoreMatch ? Number(scoreMatch[1]) : null,
      team2Score: scoreMatch ? Number(scoreMatch[2]) : null,
    };
  });
}

function parseScreenshots(html) {
  const screenshotMatches = extractAll(
    /<a href="([^"]+)"[^>]*class="hub-grid-card hub-screenshot-card">[\s\S]*?<div class="hub-screenshot-order">Screenshot\s+(\d+)<\/div>[\s\S]*?<img src="([^"]+)"/gi,
    html
  );

  return screenshotMatches.map(match => ({
    sortOrder: Number(match[2]),
    url: decodeHtmlEntities(match[1]),
    imageUrl: decodeHtmlEntities(match[3]),
  }));
}

function parsePlayers(html) {
  const tableMatch = html.match(
    /<section class="hub-card hub-table-card">[\s\S]*?<h2>Player estratti<\/h2>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>[\s\S]*?<\/section>/i
  );

  if (!tableMatch) return [];

  const tbody = tableMatch[1];
  if (/Nessun dato player ancora disponibile/i.test(tbody)) {
    return [];
  }

  const rowMatches = extractAll(/<tr>([\s\S]*?)<\/tr>/gi, tbody);
  const players = [];

  for (const row of rowMatches) {
    const cols = extractAll(/<td[^>]*>([\s\S]*?)<\/td>/gi, row[1]).map(cell => stripTags(cell[1]));
    if (cols.length < 8) continue;

    const kda = cols[3].match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);

    players.push({
      mapLabel: cols[0],
      teamName: cols[1],
      playerName: cols[2],
      kills: kda ? Number(kda[1]) : null,
      deaths: kda ? Number(kda[2]) : null,
      assists: kda ? Number(kda[3]) : null,
      points: cols[4] ? Number(cols[4].replace(/[^\d]/g, "")) || null : null,
      timePlayed: cols[5],
      impact: cols[6] ? Number(cols[6].replace(/[^\d]/g, "")) || null : null,
      mvpLabel: cols[7],
    });
  }

  return players;
}

function parseDebugJson(html) {
  const match = html.match(/<h2>Debug Parser JSON<\/h2>[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!match) return null;

  const raw = decodeHtmlEntities(match[1]);
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {
      parseError: error.message || String(error),
      raw,
    };
  }
}

function parseDetailPage(html, detailUrl) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? stripTags(titleMatch[1]) : "";
  const summary = parseSummaryCards(html);
  const screenshots = parseScreenshots(html);
  const maps = parseMaps(html);
  const players = parsePlayers(html);
  const debug = parseDebugJson(html);
  const sourceSections = extractAll(
    /<h2>Messaggio sorgente Parte\s+(\d)<\/h2>[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/gi,
    html
  ).map(match => ({
    part: Number(match[1]),
    rawText: decodeHtmlEntities(match[2]).trim(),
  }));

  return {
    detailUrl: stripTokenFromUrl(detailUrl),
    pageTitle,
    summary: {
      date: summary.data || null,
      series: summary.serie || null,
      winner: summary.vincitore || null,
      review: summary.review || null,
    },
    maps,
    players,
    screenshots,
    sourceMessages: sourceSections,
    debug,
  };
}

async function main() {
  const { positional, options } = parseArgs(process.argv);
  const listUrl = buildUrlWithToken(
    positional[0] || options.url || "https://p01--evergreen--ddlpzyfwn6xj.code.run/matches",
    options.token || process.env.MATCH_SITE_TOKEN || ""
  );
  const outputPath = ensureAbsoluteOutput(
    positional[1] || options.output || "exports/site-match-snapshot.json"
  );

  const listHtml = await fetchText(listUrl);
  const listData = parseMatchList(listHtml, listUrl);

  const matches = [];
  for (let index = 0; index < listData.matches.length; index += 1) {
    const item = listData.matches[index];
    const detailUrl = buildUrlWithToken(item.detailUrl, options.token || process.env.MATCH_SITE_TOKEN || "");
    console.log(`ℹ️ Export sito match [${index + 1}/${listData.matches.length}]: ${item.slug}`);
    const detailHtml = await fetchText(detailUrl);
    const detail = parseDetailPage(detailHtml, detailUrl);
    matches.push({
      ...item,
      detail,
    });
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    source: {
      listUrl: stripTokenFromUrl(listUrl),
      totalMatches: listData.total,
    },
    matches,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(`✅ Export sito creato: ${outputPath}`);
  console.log(`ℹ️ Match salvati: ${matches.length}`);
}

main().catch(error => {
  console.error("❌ Errore export sito match:", error);
  process.exitCode = 1;
});
