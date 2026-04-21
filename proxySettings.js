document.addEventListener('DOMContentLoaded', async () => {
    const saveBtn = document.getElementById('saveBtn');
    const clearBtn = document.getElementById('clearBtn');
    const proxyListInput = document.getElementById('proxyList');
    const protocolSelect = document.getElementById('protocol');
    const statusDiv = document.getElementById('status');

    // Load existing settings
    const data = await chrome.storage.local.get(['proxyConfig']);
    if (data.proxyConfig) {
        if (data.proxyConfig.rawList) {
            proxyListInput.value = data.proxyConfig.rawList;
        }
        if (data.proxyConfig.protocol) {
            protocolSelect.value = data.proxyConfig.protocol;
        }
    }

    saveBtn.addEventListener('click', async () => {
        const rawList = proxyListInput.value.trim();
        const protocol = protocolSelect.value;
        
        if (!rawList) {
            showStatus('Please enter at least one proxy.', 'error');
            return;
        }

        const lines = rawList.split('\n').filter(l => l.trim().length > 0);
        const parsedProxies = [];
        let validCount = 0;

        for (const line of lines) {
            const cleanLine = line.trim();
            // Basic format check: IP:Port or IP:Port:User:Pass
            if (!cleanLine.includes(':')) continue;

            const firstColon = cleanLine.indexOf(':');
            const secondColon = cleanLine.indexOf(':', firstColon + 1);
            
            let host = '';
            let port = 0;
            let username = null;
            let password = null;

            if (secondColon === -1) {
                // Format: IP:Port
                host = cleanLine.substring(0, firstColon);
                port = parseInt(cleanLine.substring(firstColon + 1));
            } else {
                // Format: IP:Port:User:Pass
                // We assume User doesn't have colon for simplicity, or we split strictly on first 3 colons if standard
                // However, passwords often have colons. Let's split by first 3 colons safely.
                
                const thirdColon = cleanLine.indexOf(':', secondColon + 1);
                
                host = cleanLine.substring(0, firstColon);
                port = parseInt(cleanLine.substring(firstColon + 1, secondColon));
                
                if (thirdColon !== -1) {
                    // IP:Port:User:Pass(with:colons)
                    username = cleanLine.substring(secondColon + 1, thirdColon);
                    password = cleanLine.substring(thirdColon + 1);
                } else {
                    // IP:Port:User (unlikely) or malformed.
                    // Fallback to simple split if only 2 colons found (IP:Port:User) ?? No, assume standard proxy format
                    // Actually, if only 2 colons, it might be IP:Port:User (no pass) or just text
                    // Let's assume remaining part is User:Pass combined?
                    // Standard format is usually 4 parts. 
                    // Let's rely on standard split with limit? No, limit merges last.
                    // Let's use the parts logic but robustly.
                    
                    const parts = cleanLine.split(':');
                    if (parts.length >= 4) {
                        host = parts[0];
                        port = parseInt(parts[1]);
                        username = parts[2];
                        password = parts.slice(3).join(':'); // Re-join password parts
                    }
                }
            }

            if (host && !isNaN(port)) {
                parsedProxies.push({ host, port, username, password });
                validCount++;
            }
        }

        if (validCount === 0) {
            showStatus('No valid proxies found. Check format: IP:Port or IP:Port:User:Pass', 'error');
            return;
        }

        const config = {
            proxies: parsedProxies,
            protocol: protocol,
            rawList: rawList,
            enabled: true
        };

        await chrome.storage.local.set({ proxyConfig: config });
        showStatus(`Saved ${validCount} proxies successfully. Ready for scanning.`, 'success');
        
        // Notify background to reload if needed
        chrome.runtime.sendMessage({ action: 'PROXY_CONFIG_UPDATED' }).catch(() => {});
    });

    clearBtn.addEventListener('click', async () => {
        await chrome.storage.local.remove('proxyConfig');
        proxyListInput.value = '';
        showStatus('Proxy configuration cleared. Scraper will use direct connection.', 'success');
        
        // Notify background
        chrome.runtime.sendMessage({ action: 'PROXY_CONFIG_UPDATED' }).catch(() => {});
    });

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = type === 'success' ? 'success' : 'error';
        statusDiv.style.display = 'block';
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
});