// content.js

// Original blur functionality
function isProblemSolved() {
  return !!document.querySelector(
    'div.text-body.text-text-secondary, div.text-body.dark\\:text-text-secondary'
  );
}

function blurEditor(editor) {
  editor.classList.add("editor-blur");
}

function unblurEditor(editor) {
  editor.classList.remove("editor-blur");
}

function createControlPanel(editor) {
  if (document.getElementById("blur-control-wrapper")) return;

  const wrapper = document.createElement("div");
  wrapper.id = "blur-control-wrapper";

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "blur-toggle-btn";
  toggleBtn.textContent = "Unblur Editor";

  const closeBtn = document.createElement("button");
  closeBtn.id = "blur-close-btn";
  closeBtn.textContent = "✕";

  toggleBtn.addEventListener("click", () => {
    const isBlurred = editor.classList.toggle("editor-blur");
    toggleBtn.textContent = isBlurred ? "Unblur Editor" : "Blur Editor";
    sendActivitySignal();
  });

  closeBtn.addEventListener("click", () => {
    unblurEditor(editor);
    wrapper.remove();
    sendActivitySignal();
  });

  wrapper.appendChild(toggleBtn);
  wrapper.appendChild(closeBtn);
  document.body.appendChild(wrapper);
}

function waitForElement(selector, callback, timeout = 10000) {
  const existing = document.querySelector(selector);
  if (existing) return callback(existing);

  const observer = new MutationObserver(() => {
    const el = document.querySelector(selector);
    if (el) {
      observer.disconnect();
      callback(el);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), timeout);
}

function runExtension() {
  const url = location.href;

  if (url.includes("leetcode.com/problems/")) {
    waitForElement(".monaco-editor", (editor) => {
      if (isProblemSolved()) blurEditor(editor);
      createControlPanel(editor);
    });
  }

  if (url.includes("geeksforgeeks.org/problems/")) {
    waitForElement("#editor", (editor) => {
      blurEditor(editor);
      createControlPanel(editor);
    });
  }
}

// Time tracking functionality
function sendActivitySignal() {
  chrome.runtime.sendMessage({ type: 'user_activity' }).catch(() => {
    // Ignore errors if background script isn't ready
  });
}

// Track user activity for time tracking
function setupActivityTracking() {
  const events = ['click', 'keypress', 'mousemove', 'scroll'];
  
  events.forEach(event => {
    document.addEventListener(event, () => {
      sendActivitySignal();
    }, { passive: true });
  });

  window.addEventListener('focus', sendActivitySignal);
  window.addEventListener('blur', sendActivitySignal);
  
  // Send initial activity signal
  sendActivitySignal();
}

// Event delegation for button clicks
function handleClick(event) {
  let target = event.target;
  // Traverse up to find the button element if the click is on a child
  while (target && target !== document) {
    if (target.matches('button, [role="button"]')) {
      break;
    }
    target = target.parentElement;
  }

  if (!target || target === document) return;

  // Check LeetCode buttons
  if (location.href.includes('leetcode.com')) {
    if (target.matches('[data-e2e-locator="console-run-button"]')) {
      sendButtonClick('run');
      return;
    }
    if (target.matches('[data-e2e-locator="console-submit-button"]')) {
      sendButtonClick('submit');
      return;
    }
  }

  // Check GeeksforGeeks buttons
  if (location.href.includes('geeksforgeeks.org')) {
    if (target.matches('#compile')) {
      sendButtonClick('run');
      return;
    }
    if (target.matches('#submit')) {
      sendButtonClick('submit');
      return;
    }
  }

  // Fallback: Check by text content
  const text = target.textContent?.toLowerCase().trim() || '';
  const ariaLabel = target.getAttribute('aria-label')?.toLowerCase() || '';
  const title = target.getAttribute('title')?.toLowerCase() || '';
  const allText = `${text} ${ariaLabel} ${title}`;

  // Identify Run buttons (but not Submit buttons)
  if ((allText.includes('run') || allText.includes('compile') || allText.includes('test')) && 
      !allText.includes('submit')) {
    sendButtonClick('run');
  }
  // Identify Submit buttons
  else if (allText.includes('submit')) {
    sendButtonClick('submit');
  }
}

function sendButtonClick(buttonType) {
  console.log(`CodeBlur: Tracked ${buttonType} click`);
  chrome.runtime.sendMessage({
    type: 'button_click',
    buttonType: buttonType,
    url: window.location.href,
    timestamp: Date.now()
  }).catch(error => {
    console.error('Failed to send button click message:', error);
  });
}

// Initialize everything
function initialize() {
  console.log('CodeBlur: Initializing...');
  
  // Run the main extension
  runExtension();
  
  // Setup activity tracking
  setupActivityTracking();
  
  // Setup click event delegation
  document.addEventListener('click', handleClick, true); // capture phase
  
  console.log('CodeBlur: Initialization complete');
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Handle SPA navigation (for LeetCode)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('CodeBlur: URL changed, reinitializing...');
    // Wait a bit for the new page to load
    setTimeout(() => {
      runExtension();
    }, 1000);
  }
}).observe(document, { subtree: true, childList: true });