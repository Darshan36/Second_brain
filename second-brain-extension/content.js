// --- 1. Inject the Status Indicator Dot ---
const statusDot = document.createElement('div');
Object.assign(statusDot.style, {
    width: '15px', height: '15px', borderRadius: '50%', opacity: '1',
    position: 'fixed', bottom: '50px', right: '50px', 
    zIndex: '2147483647', pointerEvents: 'none', 
    transition: 'background-color 0.3s',
    backgroundColor: '#34c759', boxShadow: '0 0 10px rgba(0,0,0,0.5)'
});
document.body.appendChild(statusDot);

function setStatus(state) {
    if (state === 'listening') statusDot.style.backgroundColor = '#34c759'; // Green
    if (state === 'sending') statusDot.style.backgroundColor = '#ffcc00';   // Yellow
    if (state === 'error') statusDot.style.backgroundColor = '#ff3b30';     // Red
}

// --- 2. State Variables ---
let debounceTimer;
let lastProcessedMessage = "";
let currentUrl = window.location.href;

// --- 3. The Observer (State-Aware) ---
const observer = new MutationObserver(() => {
    // Reset state if URL changes (new conversation)
    if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        lastProcessedMessage = "";
    }

    clearTimeout(debounceTimer);
    
    debounceTimer = setTimeout(() => {
        const isStreamingClaude = document.querySelector('[data-is-streaming="true"]');
        console.log('[DEBUG] AI elements at fire time:', document.querySelectorAll('.font-claude-response').length);
        console.log('[DEBUG] Is streaming (Claude):', isStreamingClaude);

        let userMessages, aiResponses, platformName;

        // --- PLATFORM SPECIFIC LOGIC & STREAMING CHECKS ---
        if (window.location.hostname.includes('claude')) {
            platformName = 'Claude';
            
            // Explicit Claude streaming check
            if (isStreamingClaude) return; // Still generating, bail out early

            userMessages = document.querySelectorAll('[data-testid="user-message"]');
            aiResponses = document.querySelectorAll('.font-claude-response');
            
        } else {
            platformName = 'ChatGPT';
            
            // Explicit ChatGPT streaming check
            const isStreaming = document.querySelector('.result-streaming');
            if (isStreaming) return; // Still generating, bail out early

            userMessages = document.querySelectorAll('[data-message-author-role="user"]');
            aiResponses = document.querySelectorAll('[data-message-author-role="assistant"]');
        }

        // --- EXTRACTION ---
        if (!userMessages || !aiResponses || userMessages.length === 0 || aiResponses.length === 0) {
            setStatus('error');
            return;
        }

        setStatus('listening'); // Reset to green once elements are confirmed

        const lastUser = userMessages[userMessages.length - 1].innerText.trim();
        const lastAI = aiResponses[aiResponses.length - 1].innerText.trim();

        // Prevent duplicate captures
        const signature = lastUser + lastAI;
        if (signature === lastProcessedMessage) return;
        
        lastProcessedMessage = signature;
        setStatus('sending');

        const payload = {
            platform: platformName,
            conversation_id: window.location.pathname,
            timestamp: new Date().toISOString(),
            user_prompt: lastUser,
            ai_response: lastAI
        };

        console.log(`✅ Captured [${platformName}]:`, payload);

        // POST to FastAPI via background.js (Bypasses CORS)
        chrome.runtime.sendMessage({ type: "SEND_TO_BRAIN", payload: payload }, (response) => {
            if (chrome.runtime.lastError || (response && !response.success)) {
                console.error("Backend Error:", chrome.runtime.lastError?.message || response?.error);
                setStatus('error');
                setTimeout(() => setStatus('listening'), 5000);
            } else {
                console.log("✅ Successfully stored in Second Brain!");
                setStatus('listening');
            }
        });

    }, 1500); // 1.5s buffer, but only fires if streaming is explicitly false
});

// Start observing
observer.observe(document.body, { childList: true, subtree: true, characterData: true });