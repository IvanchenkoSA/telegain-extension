function toDataUrl(content, mimeType) {
  return `data:${mimeType},${encodeURIComponent(content)}`;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "EXPORT_FILE") {
    return false;
  }

  try {
    chrome.downloads.download(
      {
        url: toDataUrl(message.content, message.mimeType),
        filename: message.filename,
        saveAs: true
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError.message || "Не удалось начать скачивание."
          });
          return;
        }

        if (typeof downloadId !== "number") {
          sendResponse({
            ok: false,
            error: "Chrome не вернул идентификатор скачивания."
          });
          return;
        }

        sendResponse({ ok: true });
      }
    );
  } catch (error) {
    sendResponse({
      ok: false,
      error: error.message || "Ошибка при подготовке файла."
    });
  }

  return true;
});
