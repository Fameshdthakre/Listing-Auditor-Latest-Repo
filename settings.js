document.addEventListener('DOMContentLoaded', async () => {
    // Navigation Logic
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.dataset.target;
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            sections.forEach(sec => {
                sec.classList.remove('active');
                if (sec.id === targetId) sec.classList.add('active');
            });
        });
    });

    // Toggle Logic
    const uaToggle = document.getElementById('uaToggle');
    const aiProvider = document.getElementById('aiProvider');
    const aiApiKey = document.getElementById('aiApiKey');
    const aiModel = document.getElementById('aiModel');
    const aiModelList = document.getElementById('aiModelList');
    const aiCustomEndpoint = document.getElementById('aiCustomEndpoint');
    const aiApiKeyGroup = document.getElementById('aiApiKeyGroup');
    const aiModelGroup = document.getElementById('aiModelGroup');
    const aiCustomEndpointGroup = document.getElementById('aiCustomEndpointGroup');
    const saveAiConfigBtn = document.getElementById('saveAiConfigBtn');
    const aiStatusDiv = document.getElementById('aiStatus');
    const toggleApiKeyVisibilityBtn = document.getElementById('toggleApiKeyVisibility');
    const eyeIconOpen = document.getElementById('eyeIconOpen');
    const eyeIconClosed = document.getElementById('eyeIconClosed');

    const proxyToggle = document.getElementById('proxyToggle');
    const proxyControls = document.getElementById('proxyControls');

    // Proxy Form Elements
    const addBtn = document.getElementById('addBtn');
    const saveConfigBtn = document.getElementById('saveConfigBtn');
    const deleteAllBtn = document.getElementById('deleteAllBtn');
    const checkAllBtn = document.getElementById('checkAllBtn'); // New Button
    const proxyInput = document.getElementById('proxyInput');
    const defaultProtocolSelect = document.getElementById('defaultProtocol');
    const statusDiv = document.getElementById('status');
    const proxyTableBody = document.querySelector('#proxyTable tbody');
    const emptyState = document.getElementById('emptyState');
    const proxyCountSpan = document.getElementById('proxyCount');
    const testUrlInput = document.getElementById('testUrl');

    let currentProxies = [];

    // Load existing settings
    const data = await chrome.storage.local.get(['proxyConfig', 'uaRotationEnabled', 'aiConfig']);
    
    // 1. General Settings
    if (data.uaRotationEnabled !== undefined) {
        uaToggle.checked = data.uaRotationEnabled;
    } else {
        uaToggle.checked = false; // Default Off
        chrome.storage.local.set({ uaRotationEnabled: false });
    }

    // --- AI Settings Configuration ---
    const MODELS = {
        gemini: [
            { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro-Preview' },
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash-Preview' },
            { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite' },
            { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash-Image' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite' },
            { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash-Image' },
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
            { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite' },
            { id: 'gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro' },
            { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash' }
        ],
        openai: [
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
        ],
        anthropic: [
            { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet' },
            { id: 'claude-3-opus-latest', name: 'Claude 3 Opus' },
            { id: 'claude-3-haiku-latest', name: 'Claude 3 Haiku' }
        ],
        custom: []
    };

    function populateModelDropdown(provider, selectedModel = '') {
        aiModelList.replaceChildren();
        const models = MODELS[provider] || [];
        
        models.forEach(m => {
            const option = document.createElement('option');
            option.value = m.id;
            // Datalist options can have text content, but browsers display them differently
            // Usually setting value to the ID and letting user see it is best for APIs
            aiModelList.appendChild(option);
        });

        if (selectedModel) {
            aiModel.value = selectedModel;
        } else if (models.length > 0) {
            aiModel.value = models[0].id;
        } else {
            aiModel.value = '';
        }
    }
    
    // Toggle API Key visibility
    if (toggleApiKeyVisibilityBtn) {
        toggleApiKeyVisibilityBtn.addEventListener('click', () => {
            if (aiApiKey.type === 'password') {
                aiApiKey.type = 'text';
                eyeIconOpen.style.display = 'block';
                eyeIconClosed.style.display = 'none';
            } else {
                aiApiKey.type = 'password';
                eyeIconOpen.style.display = 'none';
                eyeIconClosed.style.display = 'block';
            }
        });
    }

    // Store configurations for all providers in memory to prevent losing them when switching tabs
    let providerConfigs = {
        gemini: { apiKey: '', model: '', customEndpoint: '' },
        openai: { apiKey: '', model: '', customEndpoint: '' },
        anthropic: { apiKey: '', model: '', customEndpoint: '' },
        custom: { apiKey: '', model: '', customEndpoint: '' }
    };
    
    // Save current form inputs to providerConfigs memory
    function saveCurrentToMemory() {
        const currentProvider = aiProvider.dataset.previousValue || aiProvider.value;
        if (currentProvider && currentProvider !== 'none') {
            providerConfigs[currentProvider] = {
                apiKey: aiApiKey.value,
                model: aiModel.value.trim(),
                customEndpoint: aiCustomEndpoint.value
            };
        }
    }

    // Load inputs from providerConfigs memory
    function loadFromMemory(provider) {
        if (provider && provider !== 'none') {
            const config = providerConfigs[provider] || { apiKey: '', model: '', customEndpoint: '' };
            aiApiKey.value = config.apiKey || '';
            aiCustomEndpoint.value = config.customEndpoint || '';
            populateModelDropdown(provider, config.model);
        } else {
            populateModelDropdown('none');
        }
    }

    // 2. AI Settings Load
    if (data.aiConfig) {
        aiProvider.value = data.aiConfig.provider || 'none';
        aiProvider.dataset.previousValue = aiProvider.value;
        
        // Load legacy structure or new structure
        if (data.aiConfig.providers) {
            providerConfigs = { ...providerConfigs, ...data.aiConfig.providers };
        } else if (data.aiConfig.provider && data.aiConfig.provider !== 'none') {
            // Migrate old structure
            providerConfigs[data.aiConfig.provider] = {
                apiKey: data.aiConfig.apiKey || '',
                model: data.aiConfig.model || '',
                customEndpoint: data.aiConfig.customEndpoint || ''
            };
        }
        loadFromMemory(aiProvider.value);
    } else {
        populateModelDropdown('none');
    }
    
    function updateAiFormVisibility() {
        const provider = aiProvider.value;
        aiApiKeyGroup.style.display = provider === 'none' ? 'none' : 'block';
        aiModelGroup.style.display = provider === 'none' ? 'none' : 'block';
        aiCustomEndpointGroup.style.display = provider === 'custom' ? 'block' : 'none';
    }

    if (aiProvider) {
        aiProvider.addEventListener('change', () => {
            saveCurrentToMemory();
            updateAiFormVisibility();
            loadFromMemory(aiProvider.value);
            aiProvider.dataset.previousValue = aiProvider.value;
        });
        
        // Force initial visibility without resetting the model loaded from storage
        updateAiFormVisibility();
    }

    if (saveAiConfigBtn) {
        saveAiConfigBtn.addEventListener('click', async () => {
            let finalModel = aiModel.value.trim();
            if (aiProvider.value !== 'none' && !finalModel && aiProvider.value !== 'custom') {
                 aiStatusDiv.textContent = 'Please enter or select a model.';
                 aiStatusDiv.className = 'error';
                 aiStatusDiv.style.display = 'block';
                 setTimeout(() => aiStatusDiv.style.display = 'none', 3000);
                 return;
            }

            saveCurrentToMemory(); // Update memory with final values

            const aiConfig = {
                provider: aiProvider.value,
                providers: providerConfigs,
                // keep legacy fields for backward compatibility if needed, or rely solely on providers
                apiKey: aiProvider.value !== 'none' ? providerConfigs[aiProvider.value].apiKey : '',
                model: finalModel,
                customEndpoint: aiProvider.value !== 'none' ? providerConfigs[aiProvider.value].customEndpoint : ''
            };
            await chrome.storage.local.set({ aiConfig });
            
            aiStatusDiv.textContent = 'AI Configuration saved successfully.';
            aiStatusDiv.className = 'success';
            aiStatusDiv.style.display = 'block';
            setTimeout(() => aiStatusDiv.style.display = 'none', 3000);
        });
    }



    // 2. Proxy Settings
    if (data.proxyConfig) {
        if (data.proxyConfig.proxies) {
            currentProxies = data.proxyConfig.proxies;
            renderTable();
        }
        if (data.proxyConfig.enabled !== undefined) {
            proxyToggle.checked = data.proxyConfig.enabled;
        } else {
            proxyToggle.checked = false; // Default Off
            data.proxyConfig.enabled = false;
            chrome.storage.local.set({ proxyConfig: data.proxyConfig });
        }
    } else {
        proxyToggle.checked = false;
        chrome.storage.local.set({ proxyConfig: { enabled: false, proxies: [] } });
    }

    // Initialize UI State
    updateProxyUI(proxyToggle.checked);

    // Event Listeners for Toggles
    uaToggle.addEventListener('change', () => {
        const isEnabled = uaToggle.checked;
        chrome.storage.local.set({ uaRotationEnabled: isEnabled });
        
        // Immediate Reset if Disabled
        if (!isEnabled) {
            chrome.runtime.sendMessage({ action: 'RESET_USER_AGENT' }).catch(() => {});
            showStatus("User-Agent rotation disabled & reset to default.", "success");
        }
    });

    proxyToggle.addEventListener('change', () => {
        const isEnabled = proxyToggle.checked;
        updateProxyUI(isEnabled);
        
        // Auto-save the toggle state to config immediately
        saveProxyConfig();

        // Immediate Reset if Disabled
        if (!isEnabled) {
            chrome.runtime.sendMessage({ action: 'RESET_PROXY' }).catch(() => {});
            showStatus("Proxy rotation disabled & connection reset to Direct.", "success");
        }
    });

    function updateProxyUI(enabled) {
        if (enabled) {
            proxyControls.classList.remove('disabled-overlay');
            // Re-enable inputs
            addBtn.disabled = false;
            saveConfigBtn.disabled = false;
            deleteAllBtn.disabled = false;
            if(checkAllBtn) checkAllBtn.disabled = false;
            proxyInput.disabled = false;
            defaultProtocolSelect.disabled = false;
        } else {
            proxyControls.classList.add('disabled-overlay');
            // Disable inputs
            addBtn.disabled = true;
            saveConfigBtn.disabled = true;
            deleteAllBtn.disabled = true;
            if(checkAllBtn) checkAllBtn.disabled = true;
            proxyInput.disabled = true;
            defaultProtocolSelect.disabled = true;
        }
    }

    async function saveProxyConfig() {
        const config = {
            proxies: currentProxies,
            enabled: proxyToggle.checked
        };
        await chrome.storage.local.set({ proxyConfig: config });
        // Notify background
        chrome.runtime.sendMessage({ action: 'PROXY_CONFIG_UPDATED' }).catch(() => {});
    }

    addBtn.addEventListener('click', () => {
        const rawList = proxyInput.value.trim();
        const defaultProtocol = defaultProtocolSelect.value;
        
        if (!rawList) {
            showStatus('Please enter at least one proxy.', 'error');
            return;
        }

        const lines = rawList.split('\n').filter(l => l.trim().length > 0);
        let addedCount = 0;

        for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine.includes(':')) continue;

            // Parse Logic with Protocol Detection
            // Regex for protocol prefix: ^([a-z0-9]+):\/\/
            let protocol = defaultProtocol;
            let body = cleanLine;

            const protoMatch = cleanLine.match(/^([a-z0-9]+):\/\/(.*)/i);
            if (protoMatch) {
                protocol = protoMatch[1].toLowerCase();
                body = protoMatch[2];
            }

            let host = '';
            let port = 0;
            let username = null;
            let password = null;

            // Strategy 1: URL format (user:pass@host:port)
            if (body.includes('@')) {
                const atSplit = body.split('@');
                const authPart = atSplit[0];
                const hostPart = atSplit[1];
                
                const authSplit = authPart.split(':');
                username = authSplit[0];
                password = authSplit.slice(1).join(':');

                const hostSplit = hostPart.split(':');
                host = hostSplit[0];
                port = parseInt(hostSplit[1]);
            } else {
                // Strategy 2: Colons
                // Find all colons to determine structure
                // Assuming IP doesn't have colons (IPv4).
                const parts = body.split(':');
                if (parts.length >= 2) {
                    host = parts[0];
                    port = parseInt(parts[1]);
                    
                    if (parts.length >= 4) {
                        username = parts[2];
                        password = parts.slice(3).join(':'); // Handle complex passwords
                    }
                }
            }

            if (host && !isNaN(port)) {
                const validProtos = ['http', 'https', 'socks4', 'socks5'];
                if (!validProtos.includes(protocol)) {
                    if (protocol.includes('socks')) protocol = 'socks5';
                    else protocol = 'http';
                }

                currentProxies.push({
                    protocol: protocol,
                    host: host,
                    port: port,
                    username: username,
                    password: password
                });
                addedCount++;
            }
        }

        if (addedCount > 0) {
            renderTable();
            proxyInput.value = '';
            showStatus(`Added ${addedCount} proxies to list. Don't forget to SAVE.`, 'success');
        } else {
            showStatus('No valid proxies parsed.', 'error');
        }
    });

    deleteAllBtn.addEventListener('click', () => {
        if (confirm("Delete all saved proxies?")) {
            currentProxies = [];
            renderTable();
            showStatus("List cleared. Click Save to apply changes.", "error");
        }
    });

    if (checkAllBtn) {
        checkAllBtn.addEventListener('click', async () => {
            if (!proxyToggle.checked) {
                alert("Please enable Proxy Rotation to run tests.");
                return;
            }
            if (currentProxies.length === 0) return;

            checkAllBtn.disabled = true;
            checkAllBtn.textContent = "Checking...";
            
            let successCount = 0;
            let deadCount = 0;

            // Sequential Check to avoid browser connection limit issues
            for (let i = 0; i < currentProxies.length; i++) {
                const proxy = currentProxies[i];
                // Find row
                // We assume renderTable order matches array index
                const row = proxyTableBody.children[i];
                if (row) {
                    const status = await runTest(proxy, row);
                    if (status) successCount++; else deadCount++;
                }
            }

            checkAllBtn.disabled = false;
            checkAllBtn.textContent = "Check All";
            showStatus(`Check Complete: ${successCount} Live, ${deadCount} Dead/Blocked.`, "success");
        });
    }

    saveConfigBtn.addEventListener('click', async () => {
        await saveProxyConfig();
        showStatus(`Configuration saved with ${currentProxies.length} proxies.`, 'success');
    });

    function renderTable() {
        proxyTableBody.replaceChildren();
        proxyCountSpan.textContent = currentProxies.length;

        if (currentProxies.length === 0) {
            emptyState.style.display = 'block';
            return;
        }
        emptyState.style.display = 'none';

        currentProxies.forEach((proxy, index) => {
            const tr = document.createElement('tr');
            tr.dataset.index = index; // Identify row for updates
            
            const tdProto = document.createElement('td');
            const protoBadge = document.createElement('span');
            // Safe access for protocol
            protoBadge.textContent = (proxy.protocol || 'http').toUpperCase();
            protoBadge.style.fontSize = '11px';
            protoBadge.style.padding = '2px 6px';
            protoBadge.style.borderRadius = '4px';
            protoBadge.style.background = '#e1e1e1';
            tdProto.appendChild(protoBadge);
            tr.appendChild(tdProto);

            const tdHost = document.createElement('td');
            tdHost.textContent = proxy.host;
            tr.appendChild(tdHost);

            const tdPort = document.createElement('td');
            tdPort.textContent = proxy.port;
            tr.appendChild(tdPort);

            const tdUser = document.createElement('td');
            if (proxy.username) {
                tdUser.textContent = proxy.username + ' ';
                const authSavedSpan = document.createElement('span');
                authSavedSpan.title = 'Auth Saved';
                authSavedSpan.textContent = '🔒';
                tdUser.appendChild(authSavedSpan);
                tdUser.style.color = '#333';
            } else {
                tdUser.textContent = 'IP Auth';
                tdUser.style.color = '#999';
                tdUser.style.fontStyle = 'italic';
            }
            tr.appendChild(tdUser);

            // New Status Column
            const tdStatus = document.createElement('td');
            tdStatus.className = 'status-cell';
            tdStatus.style.fontSize = '11px';
            tdStatus.textContent = '-';
            tr.appendChild(tdStatus);

            const tdAction = document.createElement('td');
            tdAction.style.display = "flex";
            tdAction.style.gap = "4px";
            tdAction.style.alignItems = "center";

            // Test Button
            const testBtn = document.createElement('button');
            testBtn.className = 'action-btn test-btn';
            testBtn.textContent = '⚡'; // Lightning icon
            testBtn.title = "Test Connection";
            testBtn.style.color = "#0071e3";
            testBtn.onclick = () => runTest(proxy, tr);
            tdAction.appendChild(testBtn);

            // Delete Button
            const delBtn = document.createElement('button');
            delBtn.className = 'action-btn delete-btn';
            delBtn.textContent = '×'; // Cross icon
            delBtn.title = "Remove";
            delBtn.onclick = () => {
                // If disabled, prevent action
                if (!proxyToggle.checked) return;
                currentProxies.splice(index, 1);
                renderTable();
            };
            tdAction.appendChild(delBtn);
            
            tr.appendChild(tdAction);

            proxyTableBody.appendChild(tr);
        });
    }

    async function runTest(proxy, rowElement) {
        if (!proxyToggle.checked) {
            // alert("Please enable Proxy Rotation to run tests.");
            return false;
        }

        const statusEl = rowElement.querySelector('.status-cell');
        const testBtn = rowElement.querySelector('.test-btn');
        
        testBtn.disabled = true;
        testBtn.style.opacity = '0.5';
        statusEl.textContent = "Testing...";
        statusEl.style.color = "#666";

        const url = testUrlInput.value.trim() || "https://www.amazon.com";

        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: "TEST_PROXY",
                payload: { proxy, testUrl: url }
            }, (response) => {
                testBtn.disabled = false;
                testBtn.style.opacity = '1';

                if (chrome.runtime.lastError || !response) {
                    statusEl.textContent = "Error";
                    statusEl.style.color = "#ff3b30";
                    resolve(false);
                    return;
                }

                if (response.success) {
                    statusEl.textContent = `OK (${response.status})`;
                    statusEl.style.color = "#34c759";
                    resolve(true);
                } else {
                    statusEl.textContent = `Fail (${response.status || 'Err'})`;
                    statusEl.style.color = "#ff3b30";
                    if (response.error) console.error("Proxy Test Error:", response.error);
                    resolve(false);
                }
            });
        });
    }

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = type === 'success' ? 'success' : 'error';
        statusDiv.style.display = 'block';
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
});