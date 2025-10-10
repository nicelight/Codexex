(() => {
  const moduleUrl = chrome.runtime.getURL("src/content.main.js");

  import(moduleUrl).catch((error) => {
    console.error('Failed to bootstrap Codex content script module', error);
  });
})();
