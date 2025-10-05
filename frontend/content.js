// content.js - Browser Extension DOM Capture Script

(function() {
	'use strict';

	// Configuration
	const CONFIG = {
		backendUrl: 'http://localhost:8000/analyze', // Replace with your actual backend URL
		captureInterval: 5000, // Capture every 5 seconds (optional)
		autoCapture: false // Set to true for automatic captures
	};

	function captureDom() {
		const html = document.documentElement.outerHTML;
		
		return {
			html: html,
			url: window.location.href,
			title: document.title,
			timestamp: new Date().toISOString(),
			viewport: {
				width: window.innerWidth,
				height: window.innerHeight
			},
			scrollPosition: {
				x: window.scrollX,
				y: window.scrollY
			}
		};
	}

	async function sendToBackend(data) {
		try {
			const response = await fetch(CONFIG.backendUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(data)
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			console.log('DOM capture sent successfully:', result);
			return result;
		} catch (error) {
			console.error('Error sending DOM capture:', error);
			throw error;
		}
	}

	function applyCorrections(result) {
		console.log(result)	
		const findings = result.findings;
		const sources = result.sources;

		if (!findings || !Array.isArray(findings) || findings.length === 0) {
			console.log('No findings to apply');
			return;
		}

		// Add styles for popups (only once)
		if (!document.getElementById('correction-popup-styles')) {
			const style = document.createElement('style');
			style.id = 'correction-popup-styles';
			style.textContent = `
				.correction-highlight {
					position: relative;
					background-color: #fff3cd;
					border-bottom: 2px solid #ffc107;
					cursor: pointer;
					transition: background-color 0.2s;
					z-index: auto;
				}
				.correction-highlight:hover {
					background-color: #ffe69c;
					z-index: 2147483647;
				}
				.correction-popup {
					display: none;
					position: fixed;
					background: white;
					border: 2px solid #28a745;
					border-radius: 8px;
					padding: 12px;
					margin-top: 8px;
					box-shadow: 0 4px 12px rgba(0,0,0,0.15);
					z-index: 2147483647;
					min-width: 350px;
					max-width: 400px;
					font-size: 14px;
					line-height: 1.5;
					white-space: normal;
					pointer-events: none;
				}
				.correction-highlight:hover .correction-popup {
					display: block;
					pointer-events: auto;
				}
				.correction-popup a {
					color: #007bff;
					text-decoration: none;
					word-break: break-all;
					pointer-events: auto;
				}
				.correction-popup a:hover {
					text-decoration: underline;
				}
				.sources-popup {
					display: none;
					position: fixed;
					top: 20px;
					right: 20px;
					background: white;
					border: 2px solid #007bff;
					border-radius: 8px;
					padding: 16px;
					box-shadow: 0 4px 12px rgba(0,0,0,0.2);
					z-index: 2147483646;
					max-width: 350px;
					font-size: 14px;
					line-height: 1.5;
				}
				.sources-popup.show {
					display: block;
				}
				.sources-popup h4 {
					margin: 0 0 12px 0;
					color: #007bff;
					font-size: 16px;
				}
				.sources-popup ul {
					margin: 0;
					padding-left: 20px;
				}
				.sources-popup li {
					margin-bottom: 8px;
				}
				.sources-popup .close-btn {
					position: absolute;
					top: 8px;
					right: 12px;
					cursor: pointer;
					font-size: 20px;
					color: #666;
					background: none;
					border: none;
					padding: 0;
					line-height: 1;
				}
				.sources-popup .close-btn:hover {
					color: #000;
				}
			`;
			document.head.appendChild(style);
		}

		// Create sources popup if sources exist
		if (sources && Array.isArray(sources) && sources.length > 0) {
			// Remove existing sources popup if any
			const existingPopup = document.getElementById('sources-info-popup');
			if (existingPopup) {
				existingPopup.remove();
			}

			const sourcesPopup = document.createElement('div');
			sourcesPopup.id = 'sources-info-popup';
			sourcesPopup.className = 'sources-popup show';
			
			const closeBtn = document.createElement('button');
			closeBtn.className = 'close-btn';
			closeBtn.textContent = '×';
			closeBtn.onclick = () => sourcesPopup.remove();
			
			const title = document.createElement('h4');
			title.textContent = 'More credible info:';
			
			const list = document.createElement('ul');
			sources.forEach(source => {
				const li = document.createElement('li');
				const link = document.createElement('a');
				link.href = source;
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				link.textContent = source;
				li.appendChild(link);
				list.appendChild(li);
			});
			
			sourcesPopup.appendChild(closeBtn);
			sourcesPopup.appendChild(title);
			sourcesPopup.appendChild(list);
			document.body.appendChild(sourcesPopup);
		}

		let correctionsApplied = 0;

		findings.forEach((finding, index) => {
			const { text, correction, source } = finding;
			
			if (!text || !correction) return;

			// Find all text nodes containing the target text
			const walker = document.createTreeWalker(
				document.body,
				NodeFilter.SHOW_TEXT,
				{
					acceptNode: function(node) {
						// Skip script and style tags
						if (node.parentElement.tagName === 'SCRIPT' || 
								node.parentElement.tagName === 'STYLE') {
							return NodeFilter.FILTER_REJECT;
						}
						// Only accept nodes that contain our text
						return node.textContent.includes(text) ? 
							NodeFilter.FILTER_ACCEPT : 
							NodeFilter.FILTER_SKIP;
					}
				}
			);

			const nodesToProcess = [];
			let node;
			while (node = walker.nextNode()) {
				nodesToProcess.push(node);
			}

			// Process each matching text node
			nodesToProcess.forEach(textNode => {
				const content = textNode.textContent;
				const parts = content.split(text);
				
				if (parts.length < 2) return; // Text not found

				const fragment = document.createDocumentFragment();
				
				parts.forEach((part, i) => {
					// Add the text part
					if (part) {
						fragment.appendChild(document.createTextNode(part));
					}
					
					// Add highlighted text with popup (except after last part)
					if (i < parts.length - 1) {
						const wrapper = document.createElement('span');
						wrapper.className = 'correction-highlight';
						wrapper.textContent = text;
						
						const popup = document.createElement('div');
						popup.className = 'correction-popup';
						popup.textContent = `✓ Correction: ${correction}`;
						
						if (source) {
							popup.innerHTML += `<br><br>More info: <a href="${source}" target="_blank" rel="noopener noreferrer">${source}</a>`;
						}
						
						wrapper.appendChild(popup);
						fragment.appendChild(wrapper);
						correctionsApplied++;
					}
				});
				
				textNode.parentNode.replaceChild(fragment, textNode);
			});
		});

		console.log(`Applied ${correctionsApplied} corrections to the DOM`);
		return correctionsApplied;
	}

	async function captureAndSend() {
		try {
			console.log('Capturing DOM...');
			const data = captureDom();
			console.log('Sending to backend...');
			const result = await sendToBackend(data);
			console.log('DOM capture complete!');
			
			// Apply corrections if findings are returned
			console.log(result)
			if (result && result.findings) {
				console.log(`Received ${result.findings.length} findings`);
				applyCorrections(result);
			}
			
			return result;
		} catch (error) {
			console.error('Failed to capture and send DOM:', error);
		}
	}

	function init() {
		console.log('DOM Capture Extension loaded');

		// Listen for messages from popup or background script
		chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
			if (request.action === 'captureDom') {
				captureAndSend()
					.then(() => sendResponse({ success: true }))
					.catch((error) => sendResponse({ success: false, error: error.message }));
				return true; // Keep the message channel open for async response
			}
		});

		// Optional: Auto-capture at intervals
		if (CONFIG.autoCapture) {
			setInterval(() => {
				captureAndSend();
			}, CONFIG.captureInterval);
		}

		// Optional: Capture on page load
		captureAndSend();
	}

	// Initialize when DOM is ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

	// Expose capture function globally for debugging
	window.manualCapture = captureAndSend;

})();