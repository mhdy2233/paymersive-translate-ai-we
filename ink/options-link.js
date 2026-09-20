(() => {
  const link = document.createElement('a');
  link.href = chrome.runtime.getURL('ink/settings.html'); link.textContent = '墨识 OCR · 本地接口';
  link.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483647;padding:12px 18px;background:#226d4c;color:white;border-radius:8px;text-decoration:none;font:14px system-ui;box-shadow:0 2px 12px #0003';
  document.body.append(link);
})();
