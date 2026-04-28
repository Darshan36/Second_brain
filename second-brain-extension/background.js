// --- 1. Create the Right-Click Menu Item ---
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "send-to-second-brain",
        title: "Send to Second Brain",
        contexts: ["selection"] // This ensures it ONLY appears when text is highlighted
    });
});

// --- 2. Handle the Click ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "send-to-second-brain") {
        
        // We package the clipping into the exact format FastAPI expects
        const payload = {
            platform: 'Web Clipper',
            conversation_id: info.pageUrl, // We use the URL as the ID
            timestamp: new Date().toISOString(),
            user_prompt: `Context: Clipped from ${tab.title || 'a webpage'}`,
            ai_response: info.selectionText // The highlighted text!
        };

        console.log("Clipping to Second Brain...", payload);

        // Send directly to your FastAPI backend
        fetch('http://127.0.0.1:8000/save-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(async (res) => {
            if (res.ok) {
                console.log("✅ Clip successfully saved!");
            } else {
                console.error("❌ Clip failed:", res.status);
            }
        })
        .catch(err => console.error("❌ Network error:", err));
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SEND_TO_BRAIN") {
        fetch('http://127.0.0.1:8000/save-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request.payload)
        })
        .then(async (res) => {
            if (res.ok) {
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'Server returned ' + res.status });
            }
        })
        .catch(err => {
            sendResponse({ success: false, error: err.toString() });
        });
        
        // Return true to indicate we will send a response asynchronously
        return true; 
    }
});