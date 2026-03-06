// app.js - Mit automatischer ID-Erkennung

let EXTENSION_ID = '';
let extensionConnected = false;
let blockedSites = [];
let timeLimits = {};
let timeWindows = {};
let usageToday = {};
let globalBlocking = true;
let stats = { blockedCount: 0 };

// Auf ID von Extension warten
window.addEventListener('message', function(event) {
    if (event.data.type === 'EXTENSION_ID_FROM_EXTENSION') {
        console.log('ID von Extension erhalten:', event.data.id);
        EXTENSION_ID = event.data.id;
        localStorage.setItem('extensionId', EXTENSION_ID);
        checkExtension();
    }
});

// Auch beim Laden prüfen ob ID gespeichert
document.addEventListener('DOMContentLoaded', function() {
    const savedId = localStorage.getItem('extensionId');
    if (savedId) {
        EXTENSION_ID = savedId;
        checkExtension();
    }
    
    document.getElementById('globalToggle').addEventListener('click', toggleGlobal);
    loadLocalData();
});

function checkExtension() {
    const statusEl = document.getElementById('connectionStatus');
    
    if (!EXTENSION_ID) {
        statusEl.textContent = 'Warte auf Extension...';
        return;
    }
    
    try {
        chrome.runtime.sendMessage(EXTENSION_ID, { type: 'ping' }, function(response) {
            if (response && response.success) {
                extensionConnected = true;
                statusEl.textContent = 'Verbunden';
                statusEl.classList.add('connected');
                loadFromExtension();
                setInterval(loadFromExtension, 5000);
            } else {
                extensionConnected = false;
                statusEl.textContent = 'Nicht verbunden';
                statusEl.classList.remove('connected');
            }
        });
    } catch (e) {
        extensionConnected = false;
        statusEl.textContent = 'Extension nicht gefunden';
        statusEl.classList.remove('connected');
    }
}

function sendToExtension(message, callback) {
    if (!extensionConnected || !EXTENSION_ID) return;
    
    try {
        chrome.runtime.sendMessage(EXTENSION_ID, message, function(response) {
            if (callback) callback(response);
        });
    } catch (e) {}
}

function loadFromExtension() {
    sendToExtension({ type: 'getData' }, function(response) {
        if (response) {
            blockedSites = response.sites || [];
            timeLimits = response.timeLimits || {};
            timeWindows = response.timeWindows || {};
            usageToday = response.usageToday || {};
            globalBlocking = response.globalBlocking !== undefined ? response.globalBlocking : true;
            stats = response.stats || { blockedCount: 0 };
            
            updateUI();
            saveLocalData();
        }
    });
}

function saveLocalData() {
    localStorage.setItem('blockedSites', JSON.stringify(blockedSites));
    localStorage.setItem('globalBlocking', globalBlocking);
}

function loadLocalData() {
    const saved = localStorage.getItem('blockedSites');
    const savedGlobal = localStorage.getItem('globalBlocking');
    
    if (saved) blockedSites = JSON.parse(saved);
    if (savedGlobal !== null) globalBlocking = savedGlobal === 'true';
}

function updateUI() {
    const toggle = document.getElementById('globalToggle');
    if (globalBlocking) {
        toggle.classList.add('active');
    } else {
        toggle.classList.remove('active');
    }
    
    document.getElementById('statsBlocked').textContent = stats.blockedCount || 0;
    document.getElementById('statsSites').textContent = blockedSites.length;
    
    let totalUsage = 0;
    for (let site in usageToday) {
        totalUsage += usageToday[site] || 0;
    }
    document.getElementById('statsUsage').textContent = totalUsage;
    
    renderSitesList();
}

function renderSitesList() {
    const container = document.getElementById('sitesContainer');
    
    if (blockedSites.length === 0) {
        container.innerHTML = '<div class="empty-state">Keine blockierten Seiten</div>';
        return;
    }
    
    let html = '';
    blockedSites.forEach(site => {
        const limit = timeLimits[site] || '';
        const window = timeWindows[site] || {};
        const usage = usageToday[site] || 0;
        
        html += `
            <div class="site-card">
                <div class="site-header">
                    <span class="site-url">${site}</span>
                    <button class="button small" onclick="removeSite('${site}')">Entfernen</button>
                </div>
                
                <div class="limit-controls">
                    <div class="limit-item">
                        <label>Limit (min):</label>
                        <input type="number" id="limit-${site}" value="${limit}" min="0" placeholder="∞">
                        <button class="button small" onclick="setTimeLimit('${site}')">Setzen</button>
                    </div>
                    
                    <div class="limit-item">
                        <label>Von:</label>
                        <input type="time" id="start-${site}" value="${window.start || ''}">
                        <label>bis:</label>
                        <input type="time" id="end-${site}" value="${window.end || ''}">
                        <button class="button small" onclick="setTimeWindow('${site}')">Setzen</button>
                    </div>
                    
                    <div class="usage-info">
                        Heute: <span>${usage} min</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function addNewSite() {
    const input = document.getElementById('newSiteInput');
    let url = input.value.trim().toLowerCase();
    
    if (!url) return;
    
    url = url.replace('https://', '').replace('http://', '').replace('www.', '');
    
    if (blockedSites.includes(url)) {
        alert('Seite bereits in der Liste');
        return;
    }
    
    blockedSites.push(url);
    
    sendToExtension({
        type: 'updateBlocklist',
        sites: blockedSites
    }, function() {
        input.value = '';
        loadFromExtension();
    });
}

function removeSite(url) {
    if (!confirm(`"${url}" entfernen?`)) return;
    
    blockedSites = blockedSites.filter(s => s !== url);
    
    sendToExtension({
        type: 'updateBlocklist',
        sites: blockedSites
    }, loadFromExtension);
}

function setTimeLimit(site) {
    const input = document.getElementById(`limit-${site}`);
    const minutes = parseInt(input.value);
    
    if (isNaN(minutes) || minutes <= 0) {
        sendToExtension({
            type: 'removeTimeLimit',
            site: site
        }, loadFromExtension);
    } else {
        sendToExtension({
            type: 'setTimeLimit',
            site: site,
            minutes: minutes
        }, loadFromExtension);
    }
}

function setTimeWindow(site) {
    const start = document.getElementById(`start-${site}`).value;
    const end = document.getElementById(`end-${site}`).value;
    
    if (!start || !end) {
        sendToExtension({
            type: 'removeTimeWindow',
            site: site
        }, loadFromExtension);
    } else {
        sendToExtension({
            type: 'setTimeWindow',
            site: site,
            start: start,
            end: end
        }, loadFromExtension);
    }
}

function toggleGlobal() {
    globalBlocking = !globalBlocking;
    
    sendToExtension({
        type: 'toggleGlobal'
    }, function(response) {
        if (response) {
            globalBlocking = response.globalBlocking;
            updateUI();
        }
    });
}

// Funktionen global machen
window.addNewSite = addNewSite;
window.removeSite = removeSite;
window.setTimeLimit = setTimeLimit;
window.setTimeWindow = setTimeWindow;
window.toggleGlobal = toggleGlobal;
