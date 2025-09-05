// content.js - CodeBlur (improved)
// Track initialization per page load (not just URL)
let isInitialized = false;
let currentEditor = null;
let controlPanel = null;
let lastSubmissionTime = 0;

// Prevent attaching global listeners multiple times per content script injection
if (!window.__codeblur_listeners_attached) {
  window.__codeblur_listeners_attached = true;
}

// --- STORAGE HELPERS ---

function getProblemSlug() {
  // matches /problems/<slug>/...
  const match = location.href.match(/problems\/([^/]+)/);
  return match ? match[1] : null;
}

function setUserUnblurChoice(unblurred) {
  const slug = getProblemSlug();
  if (slug) {
    sessionStorage.setItem("codeblur-unblur-" + slug, unblurred ? "1" : "0");
  }
}

function getUserUnblurChoice() {
  const slug = getProblemSlug();
  if (slug) {
    return sessionStorage.getItem("codeblur-unblur-" + slug) === "1";
  }
  return false;
}

function setSkipNextBlur() {
  const slug = getProblemSlug();
  if (!slug) return;
  const key = "codeblur-skip-next-blur-" + slug;
  sessionStorage.setItem(key, "1");
  // Clean up after 20 seconds (tunable)
  setTimeout(() => {
    if (sessionStorage.getItem(key) === "1") {
      sessionStorage.removeItem(key);
    }
  }, 20000);
}

function getSkipNextBlur() {
  const slug = getProblemSlug();
  if (!slug) return false;
  return sessionStorage.getItem("codeblur-skip-next-blur-" + slug) === "1";
}

// --- BLUR & CONTROL PANEL FUNCTIONALITY ---

function blurEditor(editor) {
  if (!editor) return;
  if (!editor.classList.contains("editor-blur")) {
    editor.classList.add("editor-blur");
    console.log("CodeBlur: Editor blurred");
    setUserUnblurChoice(false);
  }
}

function unblurEditor(editor) {
  if (!editor) return;
  if (editor.classList.contains("editor-blur")) {
    editor.classList.remove("editor-blur");
    console.log("CodeBlur: Editor unblurred");
    setUserUnblurChoice(true);
  } else {
    // Still save choice if user triggers unblur on already-unblurred element
    setUserUnblurChoice(true);
  }
}

function removeControlPanel() {
  if (controlPanel) {
    controlPanel.remove();
    controlPanel = null;
  }
}

function createControlPanel(editor) {
  // Remove & recreate so the UI always refers to the current editor node
  removeControlPanel();

  const wrapper = document.createElement("div");
  wrapper.id = "blur-control-wrapper";
  wrapper.style.position = "fixed";
  wrapper.style.right = "12px";
  wrapper.style.top = "12px";
  wrapper.style.zIndex = 999999;
  // Minimal styling so it is visible; you can move styles to CSS file
  wrapper.style.display = "flex";
  wrapper.style.gap = "8px";

  controlPanel = wrapper;

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "blur-toggle-btn";
  toggleBtn.textContent = editor.classList.contains("editor-blur")
    ? "Unblur Editor"
    : "Blur Editor";

  const closeBtn = document.createElement("button");
  closeBtn.id = "blur-close-btn";
  closeBtn.textContent = "✕";

  toggleBtn.addEventListener("click", () => {
    const isCurrentlyBlurred = editor.classList.contains("editor-blur");

    if (isCurrentlyBlurred) {
      unblurEditor(editor);
      toggleBtn.textContent = "Blur Editor";
    } else {
      blurEditor(editor);
      toggleBtn.textContent = "Unblur Editor";
    }

    sendActivitySignal();
  });

  closeBtn.addEventListener("click", () => {
    unblurEditor(editor);
    wrapper.remove();
    controlPanel = null;
    sendActivitySignal();
  });

  wrapper.appendChild(toggleBtn);
  wrapper.appendChild(closeBtn);
  document.body.appendChild(wrapper);

  console.log("CodeBlur: Control panel created and bound to current editor");
}

// --- CORE LOGIC ---

function waitForElement(selector, callback, timeout = 15000) {
  const existing = document.querySelector(selector);
  if (existing) {
    callback(existing);
    return;
  }

  const observer = new MutationObserver(() => {
    const el = document.querySelector(selector);
    if (el) {
      observer.disconnect();
      callback(el);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Cleanup observer after timeout
  setTimeout(() => {
    observer.disconnect();
    console.log("CodeBlur: Element wait timeout for", selector);
  }, timeout);
}

function initializeBlur() {
  // Only skip initialize if it's already correctly attached to the current editor.
  // We still allow re-initialization when the editor node was replaced.
  const currentUrl = location.href;
  console.log(`CodeBlur: Initializing blur for ${currentUrl}`);

  const siteConfig = {
    "leetcode.com/problems/": {
      editorSelector: ".monaco-editor",
      blurOnInit: true,
    },
    "geeksforgeeks.org/problems/": {
      editorSelector: "#editor",
      blurOnInit: true,
    },
  };

  for (const [site, config] of Object.entries(siteConfig)) {
    if (currentUrl.includes(site)) {
      waitForElement(config.editorSelector, (editor) => {
        // If the editor node is same as currentEditor and isInitialized true, skip
        if (isInitialized && currentEditor === editor) {
          console.log("CodeBlur: Already initialized on this editor node; skipping.");
          return;
        }

        // store reference to the current editor node
        currentEditor = editor;

        // If user explicitly unblurred earlier OR skip marker exists, restore unblur
        const userUnblurred = getUserUnblurChoice();
        const skipNext = getSkipNextBlur();

        if (config.blurOnInit) {
          if (userUnblurred || skipNext) {
            unblurEditor(editor);
          } else {
            blurEditor(editor);
          }
        }

        // Recreate the control panel for this editor node
        createControlPanel(editor);

        isInitialized = true;
        console.log("CodeBlur: Initialization complete for", site, { userUnblurred, skipNext });
      });
      break;
    }
  }
}

// --- ACTIVITY & EVENT TRACKING ---

function sendActivitySignal() {
  try {
    if (!chrome.runtime?.id) {
      // Extension context gone - skip
      return;
    }
    chrome.runtime.sendMessage({ type: "user_activity" }).catch(() => {
      // ignore background worker being asleep or other rejections
    });
  } catch (err) {
    // Some errors (like "Extension context invalidated") are thrown synchronously
    if (err.message && err.message.includes("Extension context invalidated")) {
      // ignore
    } else {
      console.error("CodeBlur: Unexpected error in sendActivitySignal", err);
    }
  }
}

function setupActivityTracking() {
  if (!window.__codeblur_activity_attached) {
    window.__codeblur_activity_attached = true;
    const events = ["click", "keypress", "mousemove", "scroll"];
    events.forEach((event) => {
      document.addEventListener(event, sendActivitySignal, { passive: true });
    });
    window.addEventListener("focus", sendActivitySignal);
    window.addEventListener("blur", sendActivitySignal);
    sendActivitySignal(); // initial ping
  }
}

// --- BUTTON & CLICK TRACKING ---

function handleClick(event) {
  let target = event.target;
  while (target && target !== document) {
    if (target.matches("button, [role='button']")) break;
    target = target.parentElement;
  }
  if (!target || target === document) return;

  if (location.href.includes("leetcode.com")) {
    if (target.matches('[data-e2e-locator="console-run-button"]')) return sendButtonClick("run");
    if (target.matches('[data-e2e-locator="console-submit-button"]')) return sendButtonClick("submit");
  }

  if (location.href.includes("geeksforgeeks.org")) {
    if (target.matches("#compile")) return sendButtonClick("run");
    if (target.matches("#submit")) return sendButtonClick("submit");
  }

  const allText = (target.textContent?.toLowerCase().trim() || "") + " " + (target.getAttribute("aria-label")?.toLowerCase() || "");
  if ((allText.includes("run") || allText.includes("compile") || allText.includes("test")) && !allText.includes("submit")) {
    sendButtonClick("run");
  } else if (allText.includes("submit")) {
    sendButtonClick("submit");
  }
}

function sendButtonClick(buttonType) {
  console.log(`CodeBlur: Tracked ${buttonType} click`);
  try {
    chrome.runtime.sendMessage({ type: "button_click", buttonType: buttonType }).catch(() => {});
  } catch (err) {
    // extension context invalidated - ignore
  }

  if (buttonType === "submit") {
    lastSubmissionTime = Date.now();
    // set a skip marker so the immediate next editor re-render doesn't re-apply blur
    setSkipNextBlur();
  }
}

// --- PAGE CHANGE DETECTION ---

function handlePageChange() {
  console.log("CodeBlur: Page navigation detected");

  // We'll not rely solely on timing; initializeBlur will consult the skip marker and stored choice.
  // Clean up current references to force re-bind to the new editor node.
  isInitialized = false;
  currentEditor = null;
  removeControlPanel();

  // Give SPA a moment to update DOM, then re-run initialize
  setTimeout(initializeBlur, 700);
}

// --- INITIALIZATION ---

function initialize() {
  console.log("CodeBlur: Starting content script initialization...");
  initializeBlur();
  setupActivityTracking();

  // Attach click tracking once per content script lifecycle
  if (!window.__codeblur_click_attached) {
    window.__codeblur_click_attached = true;
    document.addEventListener("click", handleClick, true);
  }

  console.log("CodeBlur: Content script initialization complete.");
}

// Run when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

// SPA navigation detection (URL changes)
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    handlePageChange();
  }
});
urlObserver.observe(document, { subtree: true, childList: true });

// Back/forward navigation
window.addEventListener("popstate", handlePageChange);

// Visibility change (tab switch)
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    // If we lost the editor node while hidden, try re-init
    setTimeout(() => {
      if (!isInitialized) initializeBlur();
    }, 400);
  }
});

console.log("CodeBlur: Content script loaded");
