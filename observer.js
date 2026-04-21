(function() {
    // Prevent multiple injections if possible, though executeScript usually re-injects
    if (window.AMAZON_OBSERVER_ACTIVE) return;
    window.AMAZON_OBSERVER_ACTIVE = true;

    const POLL_INTERVAL_MS = 100;
    const MAX_WAIT_MS = 30000; // Backup timeout
    const START_TIME = Date.now();

    function checkPage() {
        // 1. Check for Errors (CAPTCHA)
        if (document.title.includes("Robot Check") ||
            document.querySelector('form[action*="/errors/validateCaptcha"]')) {
            notifyAndStop({ status: 'error', type: 'CAPTCHA', url: window.location.href });
            return true;
        }

        // 2. Check for Errors (404)
        if (document.title.includes("Page Not Found") ||
            document.querySelector('img[alt*="Dogs of Amazon"]') ||
            document.querySelector('a[href*="/ref=cs_404_logo"]')) {
            notifyAndStop({ status: 'error', type: '404', url: window.location.href });
            return true;
        }

        // 3. Check for Success (Product Page)
        // #dp: Standard Detail Page container
        // #dp-container: Another common wrapper
        // #ppd: Product Page Details (images + buy box area)
        if (document.getElementById('dp') ||
            document.getElementById('dp-container') ||
            document.getElementById('ppd')) {
            notifyAndStop({ status: 'ready', url: window.location.href });
            return true;
        }

        // 4. Check Timeout
        if (Date.now() - START_TIME > MAX_WAIT_MS) {
            notifyAndStop({ status: 'timeout', url: window.location.href });
            return true;
        }

        return false;
    }

    function notifyAndStop(payload) {
        try {
            chrome.runtime.sendMessage({
                action: 'PAGE_READY_SIGNAL',
                payload: payload
            });
        } catch (e) {
            // Context might be invalidated if page reloads
            console.error("Observer Message Error:", e);
        }
    }

    // Start Polling
    const intervalId = setInterval(() => {
        if (checkPage()) {
            clearInterval(intervalId);
        }
    }, POLL_INTERVAL_MS);

    // Initial check
    if (checkPage()) {
        clearInterval(intervalId);
    }

})();
