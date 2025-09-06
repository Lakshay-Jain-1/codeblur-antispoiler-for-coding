
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

function loadStats() {
  chrome.runtime.sendMessage({ type: 'get_time_stats' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error getting stats:', chrome.runtime.lastError);
      document.getElementById('loading').textContent = 'Error loading stats';
      return;
    }
    
    if (response) {
      console.log('Stats received:', response);
      
      document.getElementById('today-time').textContent = formatTime(response.todayTime);
      document.getElementById('total-time').textContent = formatTime(response.totalTime);
      
      document.getElementById('today-runs').textContent = response.todayRunClicks || 0;
      document.getElementById('today-submits').textContent = response.todaySubmitClicks || 0;
      document.getElementById('total-runs').textContent = response.totalRunClicks || 0;
      document.getElementById('total-submits').textContent = response.totalSubmitClicks || 0;
      
      const statusElement = document.getElementById('status');
      const statusText = document.getElementById('status-text');
      
      if (response.isActive) {
        statusElement.className = 'status-indicator status-active';
        statusText.textContent = 'Actively tracking';
      } else {
        statusElement.className = 'status-indicator status-inactive';
        statusText.textContent = 'Not tracking';
      }
      
      document.getElementById('loading').style.display = 'none';
      document.getElementById('stats').style.display = 'block';
    } else {
      console.error('No response received from background script');
      document.getElementById('loading').textContent = 'No data available';
    }
  });
}

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

let updateInterval;

function setUpdateInterval() {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  
  const interval = document.hidden ? 5000 : 1000;
  updateInterval = setInterval(loadStats, interval);
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup loaded');
  loadStats();
  setUpdateInterval();
  
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetTodayStats);
  }
  
  const debugBtn = document.getElementById('debug-btn');
  if (debugBtn) {
    debugBtn.addEventListener('click', showDebugInfo);
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    loadStats(); // Immediate refresh when becoming visible
  }
  setUpdateInterval(); // Adjust update frequency based on visibility
});

window.addEventListener('beforeunload', () => {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
});