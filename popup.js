// popup.js

// Format milliseconds to human readable time with seconds
function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours === 0 && minutes === 0) {
    return `${seconds}s`;
  } else if (hours === 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
}

// Load and display stats
function loadStats() {
  chrome.runtime.sendMessage({ type: 'get_time_stats' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error getting stats:', chrome.runtime.lastError);
      document.getElementById('loading').textContent = 'Error loading stats';
      return;
    }
    
    if (response) {
      console.log('Stats received:', response);
      
      // Update time displays
      document.getElementById('today-time').textContent = formatTime(response.todayTime);
      document.getElementById('total-time').textContent = formatTime(response.totalTime);
      
      // Update click counts
      document.getElementById('today-runs').textContent = response.todayRunClicks || 0;
      document.getElementById('today-submits').textContent = response.todaySubmitClicks || 0;
      document.getElementById('total-runs').textContent = response.totalRunClicks || 0;
      document.getElementById('total-submits').textContent = response.totalSubmitClicks || 0;
      
      // Update status
      const statusElement = document.getElementById('status');
      const statusText = document.getElementById('status-text');
      
      if (response.isActive) {
        statusElement.className = 'status-indicator status-active';
        statusText.textContent = 'Actively tracking';
      } else {
        statusElement.className = 'status-indicator status-inactive';
        statusText.textContent = 'Not tracking';
      }
      
      // Show stats, hide loading
      document.getElementById('loading').style.display = 'none';
      document.getElementById('stats').style.display = 'block';
    } else {
      console.error('No response received from background script');
      document.getElementById('loading').textContent = 'No data available';
    }
  });
}

// Reset today's stats
function resetTodayStats() {
  if (confirm('Reset today\'s time and click counts to 0? This cannot be undone.')) {
    chrome.storage.local.set({ 
      todayTime: 0,
      todayRunClicks: 0,
      todaySubmitClicks: 0,
      lastDate: new Date().toDateString() 
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error resetting stats:', chrome.runtime.lastError);
        return;
      }
      console.log('Today\'s stats reset');
      loadStats(); // Refresh display
    });
  }
}

// Debug function to show raw storage data
function showDebugInfo() {
  chrome.storage.local.get(null, (result) => {
    console.log('All storage data:', result);
    
    // Create debug info display
    const debugDiv = document.createElement('div');
    debugDiv.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: white;
      border: 2px solid #ccc;
      padding: 10px;
      z-index: 10000;
      max-width: 300px;
      font-size: 12px;
      font-family: monospace;
    `;
    
    debugDiv.innerHTML = `
      <h4>Debug Info:</h4>
      <pre>${JSON.stringify(result, null, 2)}</pre>
      <button onclick="this.parentElement.remove()">Close</button>
    `;
    
    document.body.appendChild(debugDiv);
  });
}

// Dynamic update interval management
let updateInterval;

function setUpdateInterval() {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  
  // Update every 1 second when visible, every 5 seconds when hidden
  const interval = document.hidden ? 5000 : 1000;
  updateInterval = setInterval(loadStats, interval);
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup loaded');
  loadStats();
  setUpdateInterval();
  
  // Reset button handler
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetTodayStats);
  }
  
  // Debug button (add to popup HTML if needed for debugging)
  const debugBtn = document.getElementById('debug-btn');
  if (debugBtn) {
    debugBtn.addEventListener('click', showDebugInfo);
  }
});

// Handle visibility changes to adjust update frequency
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    loadStats(); // Immediate refresh when becoming visible
  }
  setUpdateInterval(); // Adjust update frequency based on visibility
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
});