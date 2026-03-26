const parseButton = document.getElementById("parseButton");
const jsonButton = document.getElementById("jsonButton");
const csvButton = document.getElementById("csvButton");
const cityFilterInput = document.getElementById("cityFilter");
const typeFilterSelect = document.getElementById("typeFilter");
const statusText = document.getElementById("statusText");
const resultCount = document.getElementById("resultCount");
const resultPreview = document.getElementById("resultPreview");

let lastItems = [];

function setStatus(message) {
  statusText.textContent = message;
}

function escapeCsv(value) {
  const stringValue = value === undefined || value === null ? "" : String(value);
  return /[,"\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, "\"\"")}"` : stringValue;
}

function toCsv(items) {
  const header = ["name", "subscribers", "views", "placementPrice", "cpv", "link", "city", "type"];
  const rows = items.map((item) =>
    [
      item.name,
      item.subscribers,
      item.views,
      item.placementPrice,
      item.cpv,
      item.link,
      item.city,
      item.type
    ].map(escapeCsv).join(",")
  );

  return [header.join(","), ...rows].join("\n");
}

function downloadFile(filename, content, mimeType, onComplete) {
  chrome.runtime.sendMessage(
    {
      type: "EXPORT_FILE",
      filename,
      content,
      mimeType
    },
    (response) => {
      if (chrome.runtime.lastError) {
        setStatus(`Ошибка экспорта: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (!response?.ok) {
        setStatus(response?.error || "Экспорт не удался.");
        return;
      }

      onComplete();
    }
  );
}

function getFilters() {
  return {
    city: cityFilterInput.value.trim(),
    type: typeFilterSelect.value
  };
}

function applyFilters(items) {
  const filters = getFilters();

  return items.filter((item) => {
    const cityMatches = !filters.city
      || (item.city && item.city.toLowerCase().includes(filters.city.toLowerCase()));
    const typeMatches = !filters.type || item.type === filters.type;

    return cityMatches && typeMatches;
  });
}

function render(items) {
  const filteredItems = applyFilters(items);
  resultCount.textContent = String(filteredItems.length);
  resultPreview.textContent = JSON.stringify(filteredItems, null, 2);
  return filteredItems;
}

function withActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const [tab] = tabs;

    if (!tab?.id) {
      setStatus("Активная вкладка не найдена.");
      return;
    }

    callback(tab);
  });
}

function persistLastItems(items) {
  lastItems = items;
  chrome.storage.local.set({ telegainLastItems: items });
}

function loadPersistedItems() {
  chrome.storage.local.get(["telegainLastItems"], ({ telegainLastItems = [] }) => {
    if (Array.isArray(telegainLastItems) && telegainLastItems.length > 0) {
      lastItems = telegainLastItems;
      render(lastItems);
      setStatus("Показаны последние считанные данные.");
    }
  });
}

parseButton.addEventListener("click", () => {
  setStatus("Считываю DOM текущей страницы...");

  withActiveTab((tab) => {
    chrome.tabs.sendMessage(
      tab.id,
      { type: "PARSE_TELEGAIN_PAGE" },
      (response) => {
        if (chrome.runtime.lastError) {
          setStatus("Не удалось связаться с content script. Откройте страницу telega.in и обновите ее.");
          return;
        }

        if (!response?.ok) {
          setStatus(response?.error || "Парсинг не удался.");
          return;
        }

        persistLastItems(response.items || []);
        const filteredItems = render(lastItems);
        setStatus(`Считано ${response.items.length} элементов, после фильтрации осталось ${filteredItems.length}.`);
      }
    );
  });
});

jsonButton.addEventListener("click", () => {
  const filteredItems = render(lastItems);

  if (filteredItems.length === 0) {
    setStatus("Нет данных для экспорта JSON.");
    return;
  }

  downloadFile(
    "telegain-channels.json",
    JSON.stringify(filteredItems, null, 2),
    "application/json",
    () => setStatus(`Экспортировано ${filteredItems.length} строк в JSON.`)
  );
});

csvButton.addEventListener("click", () => {
  const filteredItems = render(lastItems);

  if (filteredItems.length === 0) {
    setStatus("Нет данных для экспорта CSV.");
    return;
  }

  downloadFile(
    "telegain-channels.csv",
    toCsv(filteredItems),
    "text/csv;charset=utf-8",
    () => setStatus(`Экспортировано ${filteredItems.length} строк в CSV.`)
  );
});

cityFilterInput.addEventListener("input", () => {
  render(lastItems);
});

typeFilterSelect.addEventListener("change", () => {
  render(lastItems);
});

loadPersistedItems();
