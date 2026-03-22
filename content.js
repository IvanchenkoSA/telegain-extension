function compactWhitespace(value) {
  return value ? value.replace(/\s+/g, " ").trim() : "";
}

function parseMetric(rawValue) {
  if (!rawValue) {
    return null;
  }

  const normalized = rawValue.replace(/\s+/g, "").replace(",", ".").toUpperCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)([KMB]?)/);

  if (!match) {
    return null;
  }

  const base = Number(match[1]);
  const suffix = match[2];
  const multipliers = { K: 1000, M: 1000000, B: 1000000000 };

  return Math.round(base * (multipliers[suffix] || 1));
}

function parsePrice(rawValue) {
  if (!rawValue) {
    return null;
  }

  const match = rawValue.replace(/\s+/g, "").replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function extractLabelValue(text, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`${escapedLabel}\\s*:?\\s*([\\d\\s.,KMB+-]+)`, "i"),
    new RegExp(`${escapedLabel}[\\s\\S]{0,80}?([\\d][\\d\\s.,KMB+-]*)`, "i")
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return compactWhitespace(match[1]);
    }
  }

  return null;
}

function inferType(text, href = "") {
  if (/(\bmax\b|канал max|в max)/i.test(text) || /card_max/i.test(href)) {
    return "max";
  }

  return "telegram";
}

function inferCity(text) {
  const lines = text
    .split("\n")
    .map((line) => compactWhitespace(line))
    .filter(Boolean);

  for (const line of lines) {
    if (
      /(?:москва|санкт|петербург|область|край|республика|россия|спб|казань|екатеринбург|новосибирск|сочи|нижний|ростов|самара|омск|пермь|уфа|краснодар|челябинск|воронеж|тюмень|иркутск)/i.test(line)
      && line.length <= 70
      && !/[₽]/.test(line)
    ) {
      return line;
    }
  }

  return "";
}

function normalizeChannel(item) {
  return {
    name: item.name || "",
    subscribers: item.subscribers ?? null,
    views: item.views ?? null,
    placementPrice: item.placementPrice ?? null,
    link: item.link || location.href,
    city: item.city || "",
    type: item.type || "telegram"
  };
}

function parseChannelPage() {
  const bodyText = document.body?.innerText || "";
  const title = compactWhitespace(document.querySelector("h1")?.textContent)
    || compactWhitespace(document.title.split("|")[0]);

  if (!title) {
    return [];
  }

  const subscribers = parseMetric(extractLabelValue(bodyText, "Подписчики"));
  const views = parseMetric(extractLabelValue(bodyText, "Среднее количество просмотров на пост"))
    || parseMetric(extractLabelValue(bodyText, "Просмотры на пост"));
  const placementPrice = parsePrice(
    extractLabelValue(bodyText, "Стоимость размещения составляет")
    || document.title
  );

  return [
    normalizeChannel({
      name: title,
      subscribers,
      views,
      placementPrice,
      link: location.href,
      city: inferCity(bodyText),
      type: inferType(bodyText, location.href)
    })
  ];
}

function parseCardElement(card) {
  const text = card.innerText || "";
  const linkElement = card.querySelector('a[href*="/channels/"], a[href*="/card"]');
  const href = linkElement ? new URL(linkElement.getAttribute("href"), location.origin).toString() : location.href;

  const heading = compactWhitespace(
    card.querySelector("h2, h3, h4, [class*='title'], [class*='name']")?.textContent
  ) || compactWhitespace(linkElement?.textContent);

  if (!heading) {
    return null;
  }

  const subscribers = parseMetric(extractLabelValue(text, "Подписчики"));
  const views = parseMetric(extractLabelValue(text, "Просмотры"))
    || parseMetric(extractLabelValue(text, "Среднее количество просмотров на пост"));
  const placementPrice = parsePrice(
    extractLabelValue(text, "Стоимость размещения")
    || extractLabelValue(text, "Цена")
    || text.match(/от\s*([\d\s.,]+)/i)?.[1]
  );

  return normalizeChannel({
    name: heading,
    subscribers,
    views,
    placementPrice,
    link: href,
    city: inferCity(text),
    type: inferType(text, href)
  });
}

function parseCatalogPage() {
  const candidates = Array.from(document.querySelectorAll("a[href*='/channels/'], article, [class*='card'], [data-testid*='card']"));
  const uniqueByLink = new Map();

  for (const candidate of candidates) {
    const card = candidate.closest("article, a, div") || candidate;
    const parsed = parseCardElement(card);

    if (!parsed?.name) {
      continue;
    }

    uniqueByLink.set(parsed.link, parsed);
  }

  return Array.from(uniqueByLink.values());
}

function parseCurrentPage() {
  const href = location.href;

  if (/\/channels\//.test(href) && /\/card/.test(href)) {
    return parseChannelPage();
  }

  const catalogItems = parseCatalogPage();
  if (catalogItems.length > 0) {
    return catalogItems;
  }

  return parseChannelPage();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "PARSE_TELEGAIN_PAGE") {
    return false;
  }

  try {
    const items = parseCurrentPage();

    sendResponse({
      ok: true,
      items
    });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error.message || "Unexpected parsing error."
    });
  }

  return true;
});
