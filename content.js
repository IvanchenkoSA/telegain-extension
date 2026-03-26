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

function uniqueNonEmpty(values) {
  return Array.from(
    new Set(values.map((value) => compactWhitespace(value)).filter(Boolean))
  );
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

function queryRootAndDescendants(root, selector) {
  if (!root) {
    return [];
  }

  const elements = [];

  if (typeof root.matches === "function" && root.matches(selector)) {
    elements.push(root);
  }

  if (typeof root.querySelectorAll === "function") {
    elements.push(...root.querySelectorAll(selector));
  }

  return elements;
}

function getElementTextValue(element) {
  if (!element) {
    return "";
  }

  return compactWhitespace(
    element.value
    || element.textContent
    || element.getAttribute?.("value")
    || ""
  );
}

function pickPreferredFormatInput(inputs) {
  return inputs.find((input) => input.checked)
    || inputs.find((input) => input.hasAttribute("checked"))
    || inputs.find((input) => input.dataset?.format === "24" || input.value === "24")
    || inputs[0]
    || null;
}

function normalizeTelegramUsername(value) {
  const normalized = compactWhitespace(value).replace(/^@+/, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9_]{3,}$/.test(normalized) ? normalized : "";
}

function extractTelegramUsername(text, options = {}) {
  if (!text) {
    return "";
  }

  const { allowPlain = false } = options;
  const normalized = compactWhitespace(text);
  const directLinkMatch = normalized.match(/(?:https?:\/\/)?t(?:elegram)?\.me\/([A-Za-z0-9_]{3,})/i);

  if (directLinkMatch) {
    return directLinkMatch[1];
  }

  const mentionMatch = normalized.match(/@([A-Za-z0-9_]{3,})/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  return allowPlain ? normalizeTelegramUsername(normalized) : "";
}

function buildTelegramLink(username) {
  const normalizedUsername = normalizeTelegramUsername(username);
  return normalizedUsername ? `https://t.me/${normalizedUsername}` : "";
}

function extractChannelSlugFromUrl(url) {
  if (!url) {
    return "";
  }

  const normalized = compactWhitespace(String(url));
  const match = normalized.match(/\/channels\/([^/?#]+)\/card(?:_max)?(?:[/?#]|$)/i);
  return match ? normalizeTelegramUsername(match[1]) : "";
}

function extractPublicLinkFromText(text) {
  return buildTelegramLink(extractTelegramUsername(text));
}

function extractPublicLinkFromChannelUrl(url) {
  return buildTelegramLink(extractChannelSlugFromUrl(url));
}

function extractPublicLinkFromElement(root, fallbackChannelUrl = "") {
  if (!root || typeof root.querySelectorAll !== "function") {
    return extractPublicLinkFromChannelUrl(fallbackChannelUrl);
  }

  const directPublicAnchors = queryRootAndDescendants(root, 'a[href*="t.me/"], a[href*="telegram.me/"]');

  for (const anchor of directPublicAnchors) {
    const directLink = extractPublicLinkFromText(anchor.href || anchor.getAttribute?.("href"));

    if (directLink) {
      return directLink;
    }
  }

  const trustedUsernameValues = uniqueNonEmpty([
    ...queryRootAndDescendants(root, ".js_share_channel_card[data-name]").map(
      (element) => element.dataset?.name || element.getAttribute?.("data-name") || ""
    ),
    ...queryRootAndDescendants(root, 'img[alt*="@"]').map((element) => element.alt || ""),
    ...queryRootAndDescendants(root, 'img[title*="@"]').map((element) => element.title || ""),
    ...queryRootAndDescendants(root, "#copy_value").map(getElementTextValue)
  ]);

  for (const value of trustedUsernameValues) {
    const publicLink = buildTelegramLink(
      extractTelegramUsername(value, { allowPlain: true })
    );

    if (publicLink) {
      return publicLink;
    }
  }

  const channelUrlCandidates = uniqueNonEmpty([
    fallbackChannelUrl,
    ...queryRootAndDescendants(root, 'a[href*="/channels/"], a[href*="/card"]').map(
      (element) => element.href || element.getAttribute?.("href") || ""
    )
  ]);

  for (const channelUrl of channelUrlCandidates) {
    const publicLink = extractPublicLinkFromChannelUrl(channelUrl);

    if (publicLink) {
      return publicLink;
    }
  }

  return "";
}

function parseDatasetPrice(element) {
  if (!element) {
    return null;
  }

  return firstNonEmpty(
    parsePrice(element.dataset?.priceWithDiscount),
    parsePrice(element.getAttribute?.("data-price-with-discount")),
    parsePrice(element.dataset?.priceWithoutDiscount),
    parsePrice(element.getAttribute?.("data-price-without-discount"))
  );
}

function parseDatasetCpv(element) {
  if (!element) {
    return null;
  }

  return firstNonEmpty(
    parsePrice(element.dataset?.cpv),
    parsePrice(element.getAttribute?.("data-cpv"))
  );
}

function extractPlacementPriceFromElement(root) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return null;
  }

  const inputs = queryRootAndDescendants(
    root,
    'input[data-price-with-discount], input[data-price-without-discount]'
  );
  const preferredInput = pickPreferredFormatInput(inputs);
  const datasetPrice = parseDatasetPrice(preferredInput);

  if (datasetPrice !== null) {
    return datasetPrice;
  }

  const pricedElements = queryRootAndDescendants(
    root,
    "[data-price-with-discount], [data-price-without-discount]"
  );

  for (const element of pricedElements) {
    const value = parseDatasetPrice(element);

    if (value !== null) {
      return value;
    }
  }

  const textCandidates = uniqueNonEmpty([
    root.querySelector(".channel-basket__amount .amount")?.textContent,
    root.querySelector(".channel-basket__amount-price")?.textContent,
    root.querySelector(".format-control__price")?.textContent,
    root.textContent
  ]);

  for (const text of textCandidates) {
    const value = extractPlacementPriceFromText(text);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function extractCpvFromText(text) {
  if (!text) {
    return null;
  }

  return firstNonEmpty(
    parsePrice(extractLabelValue(text, "CPV")),
    parsePrice(text.match(/cpv[^\d]{0,20}(\d+(?:[.,]\d+)?)/i)?.[1])
  );
}

function extractCpvFromElement(root) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return null;
  }

  const inputs = queryRootAndDescendants(root, "input[data-cpv]");
  const preferredInput = pickPreferredFormatInput(inputs);
  const preferredValue = parseDatasetCpv(preferredInput);

  if (preferredValue !== null) {
    return preferredValue;
  }

  const cpvElements = queryRootAndDescendants(root, "[data-cpv]");

  for (const element of cpvElements) {
    const value = parseDatasetCpv(element);

    if (value !== null) {
      return value;
    }
  }

  return extractCpvFromText(root.textContent);
}

function getMetaContents(selectors) {
  return uniqueNonEmpty(
    selectors.map((selector) => document.querySelector(selector)?.content || "")
  );
}

function collectPublicLinkCandidates(bodyText) {
  return uniqueNonEmpty([
    ...getMetaContents([
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]'
    ]),
    document.title,
    bodyText
  ]);
}

function extractPublicLinkFromPage(bodyText, fallbackChannelUrl = "") {
  for (const candidate of collectPublicLinkCandidates(bodyText)) {
    const publicLink = extractPublicLinkFromText(candidate);

    if (publicLink) {
      return publicLink;
    }
  }

  return extractPublicLinkFromChannelUrl(fallbackChannelUrl);
}

function extractPlacementPriceFromText(text, options = {}) {
  if (!text) {
    return null;
  }

  const { allowLooseCurrencyFallback = true } = options;
  const currencyValues = extractCurrencyValues(text).filter((value) => value > 0);

  return firstNonEmpty(
    parsePrice(extractLabelValue(text, "Стоимость размещения составляет")),
    parsePrice(extractLabelValue(text, "Стоимость размещения")),
    parsePrice(extractLabelValue(text, "Цена размещения")),
    parsePrice(extractLabelValue(text, "Цена за размещение")),
    parsePrice(extractLabelValue(text, "Цена")),
    parsePrice(text.match(/стоимость размещения[^\d]{0,20}([\d\s.,]+)\s*₽/i)?.[1]),
    parsePrice(text.match(/цена(?:\s+за)?\s+размещ(?:ение|ения)[^\d]{0,20}([\d\s.,]+)\s*₽/i)?.[1]),
    parsePrice(text.match(/(?:^|\s)от\s*([\d\s.,]+)\s*(?:₽|руб(?:\.|лей|ля|ль)?)/i)?.[1]),
    parsePrice(text.match(/(\d[\d\s.,]*)\s*₽\s+1\/24\b/i)?.[1]),
    parsePrice(text.match(/\b1\/24\b\s+(\d[\d\s.,]*)\s*₽/i)?.[1]),
    allowLooseCurrencyFallback ? currencyValues[0] ?? null : null
  );
}

function collectChannelPriceCandidates(bodyText) {
  const candidates = [];
  const seen = new Set();

  function pushCandidate(text, options = {}) {
    const normalized = compactWhitespace(text);

    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    candidates.push({ text: normalized, options });
  }

  const metaContents = getMetaContents([
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
    'meta[property="og:title"]',
    'meta[name="twitter:title"]'
  ]);

  for (const metaContent of metaContents) {
    pushCandidate(metaContent);
  }

  pushCandidate(document.title);

  let current = document.querySelector("h1")?.parentElement || null;

  while (current && current !== document.body) {
    const text = current.innerText || "";

    if (/[₽]/.test(text) && text.length <= 6000) {
      pushCandidate(text);
    }

    current = current.parentElement;
  }

  pushCandidate(bodyText, { allowLooseCurrencyFallback: false });

  return candidates;
}

function extractPlacementPriceFromPage(bodyText) {
  const candidates = collectChannelPriceCandidates(bodyText);

  for (const candidate of candidates) {
    const price = extractPlacementPriceFromText(candidate.text, candidate.options);

    if (price !== null) {
      return price;
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

function isLikelyCityValue(value, excludedValues = []) {
  const normalized = compactWhitespace(value);

  if (!normalized) {
    return false;
  }

  const normalizedLower = normalized.toLowerCase();
  const excluded = excludedValues
    .map((item) => compactWhitespace(item).toLowerCase())
    .filter(Boolean);

  if (excluded.includes(normalizedLower)) {
    return false;
  }

  if (/^(cpv|err|er|tg|max)$/i.test(normalized)) {
    return false;
  }

  if (/\d|[%₽@*]/.test(normalized)) {
    return false;
  }

  if (/\b\d{1,2}:\d{2}\b/.test(normalized) || /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/.test(normalized)) {
    return false;
  }

  if (!/[A-Za-zА-Яа-яЁё]/.test(normalized) || normalized.length > 60) {
    return false;
  }

  return true;
}

function extractCityFromElement(root, excludedValues = []) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return "";
  }

  const selectors = [
    ".about__content .caption-normal-x3",
    ".about__location .caption-normal-x3",
    ".cards-channel__about .caption-normal-x3",
    ".wrapper-info .caption-normal-x3",
    ".caption-normal-x3"
  ];

  for (const selector of selectors) {
    const candidates = uniqueNonEmpty(
      queryRootAndDescendants(root, selector).map((element) => element.textContent)
    );
    const city = candidates.find((candidate) => isLikelyCityValue(candidate, excludedValues));

    if (city) {
      return city;
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
    cpv: item.cpv ?? null,
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
  const pageRoot = document.querySelector(".about") || document;
  const title = compactWhitespace(document.querySelector("h1")?.textContent)
    || compactWhitespace(document.title.split("|")[0]);

  if (!title) {
    return [];
  }

  const subscribers = parseMetric(extractLabelValue(bodyText, "Подписчики"));
  const views = parseMetric(extractLabelValue(bodyText, "Среднее количество просмотров на пост"))
    || parseMetric(extractLabelValue(bodyText, "Просмотры на пост"));
  const cpv = firstNonEmpty(
    extractCpvFromElement(
      document.querySelector(".channel-page__basket")
      || document.querySelector(".channel-basket")
      || document.querySelector("form.channel-basket__content")
    ),
    extractCpvFromText(bodyText)
  );
  const placementPrice = firstNonEmpty(
    extractPlacementPriceFromElement(
      document.querySelector(".channel-page__basket")
      || document.querySelector(".channel-basket")
      || document.querySelector("form.channel-basket__content")
    ),
    extractPlacementPriceFromPage(bodyText)
  );
  const link = firstNonEmpty(
    extractPublicLinkFromElement(pageRoot, location.href),
    extractPublicLinkFromPage(bodyText, location.href),
    location.href
  );

  return [
    normalizeChannel({
      name: title,
      subscribers,
      views,
      placementPrice,
      cpv,
      link,
      city: firstNonEmpty(
        extractCityFromElement(pageRoot, [title]),
        inferCity(bodyText)
      ) || "",
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
  const cpv = firstNonEmpty(
    extractCpvFromElement(card),
    extractCpvFromText(text)
  );
  const placementPrice = firstNonEmpty(
    extractPlacementPriceFromElement(card),
    extractPlacementPriceFromText(text)
  );
  const publicLink = firstNonEmpty(
    extractPublicLinkFromElement(card, href),
    extractPublicLinkFromPage(text, href),
    href
  );

  return normalizeChannel({
    name: heading,
    subscribers,
    views,
    cpv,
    placementPrice,
    link: publicLink,
    city: firstNonEmpty(
      extractCityFromElement(card, [heading]),
      inferCity(text)
    ) || "",
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
