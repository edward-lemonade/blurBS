// Popup script for medical misinformation detector
class PopupController {
  constructor() {
    this.isEnabled = true;
    this.stats = {
      claimsAnalyzed: 0,
      misinformationFound: 0
    };
    this.init();
  }
  
  async init() {
    // Load saved state
    await this.loadState();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Update UI
    this.updateUI();
    
    // Load current tab stats
    await this.loadCurrentTabStats();
  }

  setupEventListeners() {
    // Toggle button
    document.getElementById('toggleButton').addEventListener('click', () => {
      this.toggleExtension();
    });

    // Analyze button
    document.getElementById('analyzeButton').addEventListener('click', () => {
      this.analyzeCurrentPage();
    });

    // Settings button
    document.getElementById('settingsButton').addEventListener('click', () => {
      this.openSettings();
    });
  }

  async loadState() {
    try {
      const result = await chrome.storage.local.get(['extensionEnabled', 'stats']);
      this.isEnabled = result.extensionEnabled !== false;
      this.stats = result.stats || this.stats;
    } catch (error) {
      console.error('Error loading state:', error);
    }
  }

  async saveState() {
    try {
      await chrome.storage.local.set({
        extensionEnabled: this.isEnabled,
        stats: this.stats
      });
    } catch (error) {
      console.error('Error saving state:', error);
    }
  }

  async toggleExtension() {
    this.isEnabled = !this.isEnabled;
    await this.saveState();
    
    // Notify background script
    try {
      await chrome.runtime.sendMessage({
        action: 'toggleExtension'
      });
    } catch (error) {
      console.error('Error toggling extension:', error);
    }
    
    this.updateUI();
  }

  async analyzeCurrentPage() {
    this.showLoading(true);
    
    try {
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('No active tab found');
      }

      // Send message to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'analyzePage'
      });

      if (response && response.status === 'success') {
        // Update stats
        this.stats.claimsAnalyzed += 1;
        await this.saveState();
        this.updateUI();
        
        // Show success message
        this.showMessage('Page analysis completed!', 'success');
      } else {
        throw new Error('Analysis failed');
      }
      
    } catch (error) {
      console.error('Error analyzing page:', error);
      this.showMessage('Failed to analyze page. Make sure the extension is enabled.', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  async loadCurrentTabStats() {
    try {
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab) {
        // Request stats from content script
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'getStats'
        });
        
        if (response && response.stats) {
          this.stats = { ...this.stats, ...response.stats };
          this.updateUI();
        }
      }
    } catch (error) {
      // Ignore errors - content script might not be loaded
      console.log('Could not load tab stats:', error.message);
    }
  }

  updateUI() {
    // Update status indicator
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const toggleButton = document.getElementById('toggleButton');

    if (this.isEnabled) {
      statusDot.classList.remove('inactive');
      statusText.textContent = 'Active';
      toggleButton.textContent = 'Disable Extension';
    } else {
      statusDot.classList.add('inactive');
      statusText.textContent = 'Inactive';
      toggleButton.textContent = 'Enable Extension';
    }

    // Update stats
    document.getElementById('claimsAnalyzed').textContent = this.stats.claimsAnalyzed;
    document.getElementById('misinformationFound').textContent = this.stats.misinformationFound;
  }

  showLoading(show) {
    const loading = document.getElementById('loading');
    const content = document.querySelector('.content');
    
    if (show) {
      loading.style.display = 'block';
      content.style.display = 'none';
    } else {
      loading.style.display = 'none';
      content.style.display = 'block';
    }
  }

  showMessage(message, type = 'info') {
    // Create temporary message element
    const messageEl = document.createElement('div');
    messageEl.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      right: 20px;
      padding: 12px;
      border-radius: 6px;
      color: white;
      font-size: 14px;
      text-align: center;
      z-index: 1000;
      background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    messageEl.textContent = message;
    
    document.body.appendChild(messageEl);
    
    // Remove after 3 seconds
    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.parentNode.removeChild(messageEl);
      }
    }, 3000);
  }

  openSettings() {
    // Open settings page in new tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('settings.html')
    });
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
