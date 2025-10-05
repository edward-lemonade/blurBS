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

	function applyCorrections(findings) {
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
				}
				.correction-highlight:hover {
					background-color: #ffe69c;
				}
				.correction-popup {
					display: none;
					position: absolute;
					bottom: 100%;
					left: 0;
					background: white;
					border: 2px solid #28a745;
					border-radius: 8px;
					padding: 12px;
					margin-bottom: 8px;
					box-shadow: 0 4px 12px rgba(0,0,0,0.15);
					z-index: 10000;
					min-width: 200px;
					max-width: 400px;
					font-size: 14px;
					line-height: 1.5;
					white-space: normal;
				}
				.correction-highlight:hover .correction-popup {
					display: block;
				}
			`;
			document.head.appendChild(style);
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
						if (source) {
							popup.textContent = `✓ Correction: ${correction} \n\n More info: ${source}`;
						} else {
							popup.textContent = `✓ Correction: ${correction}`;
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
				applyCorrections(result.findings);
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