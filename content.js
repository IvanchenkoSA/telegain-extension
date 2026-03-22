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

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return null;
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

function extractCurrencyValues(text) {
  const matches = text.match(/\d[\d\s.,]*\s*₽/g) || [];

  return matches
    .map((value) => parsePrice(value))
    .filter((value) => Number.isFinite(value));
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

function isCatalogPage() {
  return /\/catalog(?:\/|$|\?)/.test(location.href)
    || /каталог проверенных каналов/i.test(document.body?.innerText || "")
    || /каталог телеграм каналов/i.test(document.title);
}

function isChannelPage() {
  return /\/channels\//.test(location.href) && /\/card/.test(location.href);
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

function resolveChannelUrl(href) {
  if (!href) {
    return "";
  }

  try {
    return new URL(href, location.origin).toString();
  } catch {
    return "";
  }
}

function isTitleLikeLink(link) {
  const text = compactWhitespace(link.textContent);

  if (!text) {
    return false;
  }

  const excluded = new Set([
    "Посмотреть канал",
    "Выбрать",
    "Подробнее",
    "Войти",
    "Регистрация"
  ]);

  if (excluded.has(text)) {
    return false;
  }

  return /\/channels\//.test(link.getAttribute("href") || "");
}

function findCardContainer(link) {
  let current = link;

  while (current && current !== document.body) {
    const text = current.innerText || "";

    if (
      /Подписчиков:/i.test(text)
      && /(?:ERR:|Формат:|Действия с каналом|Посмотреть канал)/i.test(text)
      && text.length < 5000
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function parseCardElement(card, titleLink = null) {
  const text = card?.innerText || "";
  const linkElement = titleLink || card?.querySelector('a[href*="/channels/"], a[href*="/card"]');
  const href = resolveChannelUrl(linkElement?.getAttribute("href"));

  const heading = compactWhitespace(titleLink?.textContent)
    || compactWhitespace(
      card?.querySelector("h2, h3, h4, [class*='title'], [class*='name']")?.textContent
    )
    || compactWhitespace(linkElement?.textContent);

  if (!heading) {
    return null;
  }

  const subscribers = parseMetric(firstNonEmpty(
    extractLabelValue(text, "Подписчиков"),
    extractLabelValue(text, "Подписчики")
  ));
  const views = parseMetric(firstNonEmpty(
    extractLabelValue(text, "Просмотров"),
    extractLabelValue(text, "Просмотры"),
    extractLabelValue(text, "Среднее количество просмотров на пост")
  ));
  const currencyValues = extractCurrencyValues(text);
  const placementPrice = firstNonEmpty(
    parsePrice(extractLabelValue(text, "Стоимость размещения")),
    parsePrice(extractLabelValue(text, "Цена")),
    parsePrice(text.match(/от\s*([\d\s.,]+)/i)?.[1]),
    currencyValues.find((value) => value > 0) ?? currencyValues[0] ?? null
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
  const titleLinks = Array.from(document.querySelectorAll("a[href*='/channels/']"))
    .filter(isTitleLikeLink);
  const uniqueByLink = new Map();

  for (const link of titleLinks) {
    const href = resolveChannelUrl(link.getAttribute("href"));

    if (!href || uniqueByLink.has(href)) {
      continue;
    }

    const card = findCardContainer(link);

    if (!card) {
      continue;
    }

    const parsed = parseCardElement(card, link);

    if (!parsed?.name) {
      continue;
    }

    uniqueByLink.set(href, parsed);
  }

  return Array.from(uniqueByLink.values());
}

function parseCurrentPage() {
  if (isChannelPage()) {
    return parseChannelPage();
  }

  if (isCatalogPage()) {
    return parseCatalogPage();
  }

  return [];
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "PARSE_TELEGAIN_PAGE") {
    return false;
  }

  try {
    const items = parseCurrentPage();

    if (isCatalogPage() && items.length === 0) {
      sendResponse({
        ok: false,
        error: "Не удалось найти карточки каталога на странице. Обновите страницу и попробуйте снова."
      });
      return true;
    }

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
