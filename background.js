// background.js - Service Worker for Manifest V3

const IDLE_THRESHOLD = 30000; // 30 seconds
const ACTIVITY_CHECK_INTERVAL = 5000; // 5 seconds

let activeTabId = null;
let startTime = null;
let isLeetCodeActive = false;
let lastActivityTime = Date.now();
let idleCheckInterval = null;

// --- UTILITY FUNCTIONS ---
function isLeetCodeUrl(url) {
  return url && (url.includes('leetcode.com/problems/') || url.includes('geeksforgeeks.org/problems/'));
}

function saveAccumulatedTime() {
  if (startTime && isLeetCodeActive) {
    const sessionTime = Date.now() - startTime;
    console.log(`Saving accumulated time: ${sessionTime}ms`);

    chrome.storage.local.get(['totalTime', 'todayTime', 'lastDate'], (result) => {
      const today = new Date().toDateString();
      let todayTime = result.todayTime || 0;

      // Reset daily stats if it's a new day
      if (result.lastDate !== today) {
        todayTime = 0;
      }

      const updates = {
        totalTime: (result.totalTime || 0) + sessionTime,
        todayTime: todayTime + sessionTime,
        lastDate: today
      };

      chrome.storage.local.set(updates, () => {
        console.log('Time saved:', updates);
      });
    });
  }
}

function checkForIdle() {
  if (isLeetCodeActive && Date.now() - lastActivityTime > IDLE_THRESHOLD) {
    console.log('User went idle, stopping tracking');
    saveAccumulatedTime();
    isLeetCodeActive = false;
    startTime = null;
  }
}

// --- TRACKING FUNCTIONS ---
function startTracking(tabId) {
  if (activeTabId !== tabId || !isLeetCodeActive) {
    console.log(`Starting tracking for tab ${tabId}`);
    saveAccumulatedTime(); // Save any existing session
    
    activeTabId = tabId;
    startTime = Date.now();
    isLeetCodeActive = true;
    lastActivityTime = Date.now();

    // Setup idle checking
    if (idleCheckInterval) clearInterval(idleCheckInterval);
    idleCheckInterval = setInterval(checkForIdle, ACTIVITY_CHECK_INTERVAL);
  }
}

function stopTracking() {
  if (isLeetCodeActive) {
    console.log('Stopping tracking');
    saveAccumulatedTime();
    isLeetCodeActive = false;
    startTime = null;
    activeTabId = null;

    if (idleCheckInterval) {
      clearInterval(idleCheckInterval);
      idleCheckInterval = null;
    }
  }
}

function updateActivity() {
  lastActivityTime = Date.now();
  
  // If user was idle and becomes active again, resume tracking
  if (activeTabId && !isLeetCodeActive) {
    chrome.tabs.get(activeTabId, (tab) => {
      if (chrome.runtime.lastError || !tab) return;
      
      if (isLeetCodeUrl(tab.url)) {
        console.log('Resuming tracking after idle period');
        startTime = Date.now();
        isLeetCodeActive = true;
      }
    });
  }
}

function getTimeStats(callback) {
  chrome.storage.local.get([
    'totalTime', 'todayTime', 'lastDate',
    'totalRunClicks', 'totalSubmitClicks',
    'todayRunClicks', 'todaySubmitClicks'
  ], (result) => {
    const today = new Date().toDateString();
    let todayTime = result.todayTime || 0;
    let todayRunClicks = result.todayRunClicks || 0;
    let todaySubmitClicks = result.todaySubmitClicks || 0;

    // Reset daily stats if it's a new day
    if (result.lastDate !== today) {
      todayTime = 0;
      todayRunClicks = 0;
      todaySubmitClicks = 0;
      
      chrome.storage.local.set({
        todayTime: 0,
        todayRunClicks: 0,
        todaySubmitClicks: 0,
        lastDate: today
      });
    }

    // Add current session time
    let currentSessionTime = 0;
    if (isLeetCodeActive && startTime) {
      currentSessionTime = Date.now() - startTime;
    }

    callback({
      totalTime: (result.totalTime || 0) + currentSessionTime,
      todayTime: todayTime + currentSessionTime,
      isActive: isLeetCodeActive,
      totalRunClicks: result.totalRunClicks || 0,
      totalSubmitClicks: result.totalSubmitClicks || 0,
      todayRunClicks,
      todaySubmitClicks
    });
  });
}

function trackButtonClick(type) {
  console.log(`Button click tracked: ${type}`);
  
  chrome.storage.local.get([
    'totalRunClicks', 'totalSubmitClicks',
    'todayRunClicks', 'todaySubmitClicks', 'lastDate'
  ], (result) => {
    const today = new Date().toDateString();
    const isNewDay = result.lastDate !== today;
    
    // Reset daily counts for new day
    const todayRunClicks = isNewDay ? 0 : (result.todayRunClicks || 0);
    const todaySubmitClicks = isNewDay ? 0 : (result.todaySubmitClicks || 0);

    const updates = { lastDate: today };

    if (type === 'run') {
      updates.totalRunClicks = (result.totalRunClicks || 0) + 1;
      updates.todayRunClicks = todayRunClicks + 1;
    } else if (type === 'submit') {
      updates.totalSubmitClicks = (result.totalSubmitClicks || 0) + 1;
      updates.todaySubmitClicks = todaySubmitClicks + 1;
    }

    chrome.storage.local.set(updates, () => {
      console.log(`${type} click saved:`, updates);
    });
  });
}

function handleTabChange(url, tabId) {
  if (isLeetCodeUrl(url)) {
    startTracking(tabId);
  } else {
    stopTracking();
  }
}

// --- EVENT LISTENERS ---

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message);
  
  switch (message.type) {
    case 'user_activity':
      updateActivity();
      break;
      
    case 'button_click':
      if (message.buttonType) {
        trackButtonClick(message.buttonType);
      }
      break;
      
    case 'get_time_stats':
      getTimeStats((stats) => {
        sendResponse(stats);
      });
      return true; // Keep message channel open for async response
      
    default:
      console.log('Unknown message type:', message.type);
  }
});

// Handle tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    handleTabChange(tab.url, tab.id);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    handleTabChange(changeInfo.url, tabId);
  }
});

// Handle window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // All windows lost focus
    updateActivity(); // This will trigger idle check
  } else {
    // A window gained focus, check if it has a LeetCode tab
    chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
      if (tabs.length > 0) {
        handleTabChange(tabs[0].url, tabs[0].id);
      }
    });
  }
});

// Save time when extension is being suspended
chrome.runtime.onSuspend.addListener(() => {
  console.log('Extension suspending, saving time...');
  saveAccumulatedTime();
});

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension starting up');
  // Check if we're already on a LeetCode page
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      handleTabChange(tabs[0].url, tabs[0].id);
    }
  });
});

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated');
  // Initialize storage if needed
  chrome.storage.local.get(['totalTime'], (result) => {
    if (result.totalTime === undefined) {
      chrome.storage.local.set({
        totalTime: 0,
        todayTime: 0,
        totalRunClicks: 0,
        totalSubmitClicks: 0,
        todayRunClicks: 0,
        todaySubmitClicks: 0,
        lastDate: new Date().toDateString()
      });
    }
  });
});

console.log('Background script loaded');