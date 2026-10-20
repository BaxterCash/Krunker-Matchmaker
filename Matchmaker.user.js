// ==UserScript==
// @name Glorp Matchmaker
// @namespace local.glorp.matchmaker
// @version 1.0.3
// @description Krunker Matchmaker (F2)
// @match https://krunker.io/*
// @run-at document-start
// @grant none
// ==/UserScript==

(() => {
    'use strict';
    // Glorp injects scripts into new documents. Do not run on hub pages or frames.
    if (window.top !== window.self || location.hostname !== 'krunker.io' ||
        !['/', '/index.html'].includes(location.pathname)) return;
    const INSTANCE = '__glorpMatchmakerV1';
    if (window[INSTANCE]) return;
    window[INSTANCE] = true;

    const VERSION = '1.0.3';
    const UPDATE_REPO = 'BaxterCash/Krunker-Matchmaker';
    const API = 'https://matchmaker.krunker.io/';
    const KEY = 'glorp_matchmaker_v1';
    const REQUEST_TIMEOUT = 8000;
    const SEARCH_COOLDOWN = 500;
    const NOTICE_DURATION = 3000;
    const LIMIT = 24;
    const defaults = { kind: 'public', minPlayers: 1, maxPlayers: '', minTime: 0, maxPing: 0, switchKey: 'F8', differentMap: true, messageSize: 16, messageDuration: 3, searchDuration: 5, hideButton: false };
    // Exact mode IDs read from Krunker's host menu; IDs are not consecutive.
    const modeNames = new Map([[0,"Free for All"],[1,"Team Deathmatch"],[2,"Hardpoint"],[3,"Capture the Flag"],[4,"Parkour"],[5,"Hide & Seek"],[6,"Infected"],[7,"Race"],[8,"Last Man Standing"],[9,"Simon Says"],[10,"Gun Game"],[11,"Prop Hunt"],[12,"Boss Hunt"],[13,"Classic FFA"],[14,"Deposit"],[15,"Stalker"],[16,"King of the Hill"],[17,"One in the Chamber"],[18,"Trade"],[19,"Kill Confirmed"],[20,"Defuse"],[21,"Sharp Shooter"],[22,"Traitor"],[23,"Raid"],[24,"Blitz"],[25,"Domination"],[26,"Squad Deathmatch"],[27,"Kranked FFA"],[28,"Team Defender"],[29,"Deposit FFA"],[33,"Chaos Snipers"],[34,"Bighead FFA"],[35,"Zombies"]]);
    const regionNames = new Map([["de-fra","Frankfurt"],["us-ca-sv","Silicon Valley"],["au-syd","Sydney"],["jb-hnd","Tokyo"],["sgp","Singapore"],["us-nj","New York"],["as-mb","Mumbai"],["us-tx","Dallas"],["brz","Brazil"],["me-bhn","Middle East"],["sss","Super Secret Servers"]]);
    // Built-in maps only. Live cm=0 metadata adds future standard maps.
    const knownMaps = ["Arena","Atomic","Barnyard","Bastion","Bazaar","Bureau","Burg","Citadel","Clockwork","Erupt","Evacuation","Facility","Freight","Frontier","HQ","Habitat","Industry","Kanji","Khepri","Krunk_Plaza","Laboratory","Lagoon","Littletown","Lostworld","Lumber","Lush","Oasis","Old_Burg","Piazza","Sandstorm","Shipment","Shipyard","Site","SkyTemple","Soul Sanctum","Stockade","Subzero","Throwback","Tortuga","Tropicano","Undergrowth","Vivo","eterno_jump","slide_moonlight"];
    const catalog = { maps: new Set(knownMaps), modes: new Set([...modeNames.keys()].map(String)), regions: new Set(regionNames.keys()) };
    try {
        const saved = JSON.parse(localStorage.getItem('glorp_matchmaker_catalog_v1') || 'null');
        for (const key of ['maps', 'modes', 'regions']) if (Array.isArray(saved?.[key])) {
            for (const value of saved[key].slice(0, 5000)) if (typeof value === 'string' && value && value.length <= (key === 'maps' ? 160 : 80) && (key !== 'modes' || /^\d+$/.test(value)) && (key !== 'maps' || saved.version === 2 || knownMaps.includes(value))) catalog[key].add(value);
        }
    } catch { /* catalog persistence is optional */ }
    const selections = { maps: [], modes: [], regions: [] };
    const regionPings = new Map();
    let settings = { ...defaults };
    let legacyNoticeTiming = true;
    let storageOK = true;
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (saved && [1, 2, 3].includes(saved.version) && saved.filters && typeof saved.filters === 'object') {
            legacyNoticeTiming = saved.filters.noticeTimingVersion !== 2;
            for (const key of Object.keys(defaults)) {
                if (['string', 'number', 'boolean'].includes(typeof saved.filters[key])) settings[key] = saved.filters[key];
            }
            if (Array.isArray(saved.filters.regions)) selections.regions = [...new Set(saved.filters.regions.filter(v => typeof v === 'string' && v && v.length <= 80))];
            else if (typeof saved.filters.region === 'string' && saved.filters.region) selections.regions = [saved.filters.region.slice(0, 80)];
            if (saved.version >= 2) {
                if (Array.isArray(saved.filters.maps)) selections.maps = [...new Set(saved.filters.maps.filter(v => typeof v === 'string' && v && v.length <= 160))];
                if (Array.isArray(saved.filters.modes)) selections.modes = [...new Set(saved.filters.modes.filter(v => typeof v === 'string' && /^\d+$/.test(v)))];
            } else {
                if (typeof saved.filters.map === 'string' && saved.filters.map) selections.maps = [saved.filters.map.slice(0, 160)];
                if (/^\d+$/.test(String(saved.filters.mode))) selections.modes = [String(saved.filters.mode)];
            }
        } else {
            const region = localStorage.getItem('kro_setngss_defaultRegion');
            if (region) selections.regions = [region.replace(/^"|"$/g, '')];
        }
    } catch { storageOK = false; }
    selections.maps = selections.maps.filter(map => catalog.maps.has(map));
    if (!['public', 'custom', 'all'].includes(settings.kind)) settings.kind = defaults.kind;
    // Migrate the old four-second default while preserving custom durations.
    if (legacyNoticeTiming && Number(settings.messageDuration) === 4) settings.messageDuration = 3;
    settings.hideButton = settings.hideButton === true || settings.hideButton === 'true';
    settings.differentMap = settings.differentMap === true || settings.differentMap === 'true';
    if (typeof settings.switchKey !== 'string' || (settings.switchKey && !validShortcut(settings.switchKey))) settings.switchKey = 'F8';
    for (const key of ['minPlayers', 'maxPlayers', 'minTime', 'maxPing']) {
        if (key === 'maxPlayers' && settings[key] === '') continue;
        if (!/^\d+$/.test(String(settings[key])) || Number(settings[key]) > 100000) settings[key] = defaults[key];
    }
    if (settings.maxPlayers !== '' && Number(settings.maxPlayers) < Number(settings.minPlayers)) settings.maxPlayers = '';
    for (const [key, min, max] of [['messageSize', 10, 40], ['messageDuration', 1, 30], ['searchDuration', 1, 30]]) {
        if (!Number.isInteger(Number(settings[key])) || Number(settings[key]) < min || Number(settings[key]) > max) settings[key] = defaults[key];
    }

    let root, host, panel, trigger, status, list, summary, form, timer, previousFocus, notice, noticeTimer;
    let opened = false, operation = null, generation = 0, busy = '', games = [], fetchedAt = 0, lastSearch = -Infinity;
    let searchAnimation, searchDeadlineTimer;
    let visibleLimit = LIMIT;
    let navigating = false, confirmationTimer, updateTimer, ready = false, pendingMenuToggle = false;
    let invalidRows = 0, recordingKey = false;
    const controls = {};
    const abortError = () => new DOMException('Cancelled', 'AbortError');
    const currentActivity = () => {
        try { return typeof window.getGameActivity === 'function' ? window.getGameActivity() : null; } catch { return null; }
    };
    const currentId = () => {
        const activity = currentActivity();
        return validId(activity?.id) ? activity.id : new URL(location.href).searchParams.get('game');
    };
    const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,24}:[a-zA-Z0-9_-]{1,80}$/.test(id);
    const number = value => typeof value === 'number' && Number.isFinite(value);
    const flag = value => value === 1 || value === true || value === '1' || value === 'true';

    // Capture F2 before the game attaches its own keyboard handlers.
    window.addEventListener('keydown', event => {
        if (!(event.key === 'F2' || event.code === 'F2' || event.keyCode === 113) || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.repeat) return;
        if (!ready) { pendingMenuToggle = !pendingMenuToggle; return; }
        if (busy === 'quick') { cancel(); hideNotice(); }
        if (opened) close(); else show();
    }, true);
    function syncToolbar() {
        if (!root) return;
        root.querySelector('#toolbar').hidden = !!document.pointerLockElement;
        root.querySelector('#toolbar').dataset.hidden = String(settings.hideButton && !opened);
    }
    function focusGameDocument() {
        if (document.visibilityState !== 'visible' || opened || document.pointerLockElement) return;
        if (document.activeElement && ![document.body, document.documentElement].includes(document.activeElement)) return;
        try { window.focus(); document.body.focus({ preventScroll: true }); } catch { /* native focus remains controlled by Glorp */ }
    }
    function versionParts(value) {
        const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value));
        return match ? match.slice(1).map(Number) : null;
    }
    function newerVersion(candidate, installed) {
        const a = versionParts(candidate), b = versionParts(installed);
        if (!a || !b) return false;
        for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
        return false;
    }
    function displayRelease(release) {
        if (!release || release.draft || release.prerelease || !newerVersion(release.tag_name, VERSION)) return;
        const url = new URL(release.html_url);
        if (url.origin !== 'https://github.com' || !(url.pathname.startsWith('/' + UPDATE_REPO + '/releases/tag/') || url.pathname === '/' + UPDATE_REPO + '/blob/main/Matchmaker.user.js')) return;
        const link = root.querySelector('#updateAvailable');
        link.href = url.href; link.hidden = false;
        link.title = 'Version ' + release.tag_name;
        host.style.setProperty('--notice-top', '180px');
    }
    async function checkUpdates() {
        const key = 'glorp_matchmaker_update_check_v1';
        try {
            const prior = JSON.parse(sessionStorage.getItem(key) || 'null');
            if (prior?.installed === VERSION) { displayRelease(prior.release); return; }
            sessionStorage.setItem(key, JSON.stringify({ installed: VERSION }));
        } catch { return; }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            let release = null;
            try {
                const response = await fetch('https://api.github.com/repos/' + UPDATE_REPO + '/releases/latest', {
                    signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
                    headers: { Accept: 'application/vnd.github+json' }
                });
                if (response.ok) release = await response.json();
            } catch { /* the repository version may still be available */ }
            // Also inspect main: publishing a source update need not wait for a GitHub release.
            if (!controller.signal.aborted) try {
                const response = await fetch('https://raw.githubusercontent.com/' + UPDATE_REPO + '/main/Matchmaker.user.js', {
                    signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache'
                });
                if (response.ok && Number(response.headers.get('content-length') || 0) <= 250000) {
                    const source = await response.text();
                    const header = /^\s*\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/.exec(source.slice(0, 4096));
                    const version = header && /^\/\/ @version\s+(\S+)\s*$/m.exec(header[1])?.[1];
                    const internal = /const VERSION = ['"]([^'"]+)['"]/.exec(source)?.[1];
                    if (source.length <= 250000 && version === internal && versionParts(version) && /@namespace local\.glorp\.matchmaker/.test(header?.[1] || '') && (!release || release.draft || release.prerelease || newerVersion(version, release.tag_name))) {
                        release = { tag_name: version, html_url: 'https://github.com/' + UPDATE_REPO + '/blob/main/Matchmaker.user.js' };
                    }
                }
            } catch { /* source inspection never executes remote code */ }
            displayRelease(release);
            sessionStorage.setItem(key, JSON.stringify({ installed: VERSION, release: release && {
                tag_name: release.tag_name, html_url: release.html_url, draft: release.draft, prerelease: release.prerelease
            } }));
        } catch { /* no retries, downloads, or interruption on offline/rate-limit errors */ }
        finally { clearTimeout(timeout); }
    }
    function announceLocalUpdate() {
        try {
            const key = 'glorp_matchmaker_installed_version';
            let until = Number(sessionStorage.getItem('glorp_matchmaker_updated_until')) || 0;
            if (localStorage.getItem(key) !== VERSION) {
                localStorage.setItem(key, VERSION);
                until = Date.now() + 5000;
                sessionStorage.setItem('glorp_matchmaker_updated_until', String(until));
            }
            if (until <= Date.now()) return;
            const toast = root.querySelector('#updatedNotice');
            toast.textContent = 'UPDATED · ' + VERSION; toast.hidden = false;
            updateTimer = setTimeout(() => {
                toast.hidden = true;
                try { sessionStorage.removeItem('glorp_matchmaker_updated_until'); } catch { /* optional */ }
            }, Math.min(5000, until - Date.now()));
        } catch { /* a version announcement must never prevent startup */ }
    }

    // Accept extra fields/maps/modes; reject ambiguous counts and incompatible schemas.
    function parseGame(row) {
        if (!Array.isArray(row) || row.length < 6) return null;
        const [id, region, players, capacity, info, seconds] = row;
        if (!validId(id) || typeof region !== 'string' || !region || region.length > 80 ||
            !Number.isInteger(players) || !Number.isInteger(capacity) || capacity < 1 ||
            players < 0 || players > capacity || !info || typeof info !== 'object' || Array.isArray(info)) return null;
        return {
            id, region, players, capacity,
            map: typeof info.i === 'string' ? info.i.slice(0, 160) : '',
            standardMap: info.cm === 0 || (info.cm == null && catalog.maps.has(info.i)),
            mode: Number.isInteger(info.g) && info.g >= 0 ? String(info.g) : '?',
            kind: info.c === 0 ? 'public' : info.c === 1 ? 'custom' : 'unknown',
            locked: flag(info.pw), paid: flag(info.kr),
            seconds: number(seconds) && seconds >= 0 ? seconds : null
        };
    }

    async function request(path, signal) {
        const controller = new AbortController();
        let timedOut = false;
        const cancel = () => controller.abort();
        if (signal.aborted) throw abortError();
        signal.addEventListener('abort', cancel, { once: true });
        const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT);
        try {
            const response = await fetch(new URL(path, API).href, {
                signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
            });
            if (!response.ok) {
                if (response.status === 429) throw new Error('Krunker is rate limiting requests. Wait a little, then refresh.');
                throw new Error(`Krunker returned HTTP ${response.status}. Try refreshing later.`);
            }
            const payload = await response.json();
            if (signal.aborted) throw abortError();
            return payload;
        } catch (error) {
            if (signal.aborted) throw abortError();
            if (timedOut) throw new Error('Krunker did not respond within 8 seconds. Try again.');
            if (error instanceof SyntaxError) throw new Error('Krunker returned invalid JSON. Try again later.');
            if (error instanceof TypeError) throw new Error('Cannot reach Krunker. Check your connection, then refresh.');
            throw error;
        } finally {
            clearTimeout(timeout);
            signal.removeEventListener('abort', cancel);
        }
    }

    function remaining(game, since) {
        return game.seconds === null ? null : Math.max(0, game.seconds - (Date.now() - since) / 1000);
    }
    function sampleRegionPing(current = games.find(game => game.id === currentId())) {
        // Glorp exposes ICMP ping for the connected lobby only, not every destination.
        // Use its displayed value solely as a clearly labelled estimate for that region.
        const text = document.querySelector('#menuPingText')?.innerText || '';
        const value = /^\s*(\d+(?:\.\d+)?)\s*(?:ms)?\s*$/i.exec(text);
        if (current && typeof current.region === 'string' && value && Number(value[1]) > 0 && Number(value[1]) < 10000) {
            regionPings.set(current.region, { ms: Number(value[1]), sampled: Date.now() });
        }
        const samples = [...regionPings].filter(([, ping]) => Date.now() - ping.sampled < 60000);
        root.querySelector('#pingNote').textContent = samples.length ? `Region estimate: ${samples.map(([region, ping]) => `${region} ≈${Math.round(ping.ms)} ms`).join(', ')}. Other regions are unmeasured; a ping limit skips them. Destination ping can differ.` : 'Ping limit uses the connected lobby’s displayed ping as a region estimate. Unmeasured regions are skipped when a limit is set.';
    }
    function passesPing(game, limit) {
        if (!limit) return true;
        const ping = regionPings.get(game.region);
        return !!ping && Date.now() - ping.sampled < 60000 && ping.ms <= limit;
    }
    function rejectionReason(game, filters, since) {
        const time = remaining(game, since);
        if (!game.standardMap) return 'Community maps';
        if (game.id === currentId()) return 'Current lobby';
        if (game.locked || game.paid || game.players >= game.capacity) return 'Full / locked / entry fee';
        if (filters.kind !== 'all' && game.kind !== filters.kind) return 'Lobby type';
        if (filters.regions.length && !filters.regions.includes(game.region)) return 'Regions';
        if (filters.maps.length && !filters.maps.includes(game.map)) return 'Maps';
        if (filters.modes.length && !filters.modes.includes(game.mode)) return 'Modes';
        if (game.players < filters.minPlayers || game.players > filters.maxPlayers) return 'Player limits';
        if (filters.minTime !== 0 && (time === null || time < filters.minTime)) return 'Time limit';
        if (!passesPing(game, filters.maxPing)) return 'Ping estimate limit';
        return '';
    }
    function matches(game, filters, since) { return !rejectionReason(game, filters, since); }
    function renderBreakdown(selected, candidates) {
        const counts = new Map();
        for (const game of games) {
            const reason = rejectionReason(game, selected, fetchedAt);
            if (reason) counts.set(reason, (counts.get(reason) || 0) + 1);
        }
        const target = root.querySelector('#filterBreakdown');
        target.replaceChildren();
        for (const [label, count] of [['Listed lobbies', games.length], ...counts, ['Matching', candidates.length]]) {
            const row = document.createElement('div'); row.className = 'breakdown-row';
            const name = document.createElement('span'); name.textContent = label;
            const value = document.createElement('span'); value.textContent = String(count);
            row.append(name, value); target.append(row);
        }
    }
    const modeLabel = mode => modeNames.get(Number(mode)) || (mode === '?' ? 'Unknown mode' : `Mode ${mode}`);
    function formatTime(value) {
        if (value === null) return 'Time unknown';
        const seconds = Math.max(0, Math.floor(value));
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    function setStatus(message, error = false) {
        status.textContent = error ? message : '';
        status.dataset.error = String(error);
        if (busy === 'quick' && error) { stopSearchUI(); showNotice('NO LOBBY AVAILABLE', true); }
    }
    function noticeDuration() { return Number(settings.messageDuration) * 1000 || NOTICE_DURATION; }
    function showNotice(title, error = false, duration = noticeDuration(), success = false) {
        notice.style.fontSize = `${Number(settings.messageSize) || 16}px`;
        if (!notice.hidden && notice.querySelector('strong').textContent === title && notice.dataset.error === String(error) && notice.dataset.success === String(success)) return;
        notice.querySelector('strong').textContent = title;
        notice.dataset.error = String(error);
        notice.dataset.success = String(success);
        notice.hidden = false;
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => { notice.hidden = true; }, duration);
    }
    function hideNotice() { clearTimeout(noticeTimer); notice.hidden = true; }
    function switchingTo(game) {
        const info = `${game.map || 'Unknown map'} · ${modeLabel(game.mode)} · ${game.players}/${game.capacity} · ${game.region}`;
        showNotice(`SWITCHING — ${info}`, false, noticeDuration(), true);
        try { sessionStorage.setItem('glorp_matchmaker_notice_v1', JSON.stringify({ version: 2, info, id: game.id, until: Date.now() + noticeDuration() })); } catch { /* optional visual continuity */ }
    }
    async function navigateTo(game, job) {
        stopSearchUI();
        navigating = true;
        switchingTo(game);
        // Let the verified green notice paint before leaving; abort never schedules another join.
        await new Promise(resolve => {
            const done = () => { clearTimeout(delay); job.signal.removeEventListener('abort', done); resolve(); };
            const delay = setTimeout(done, 180);
            job.signal.addEventListener('abort', done, { once: true });
            if (job.signal.aborted) done();
        });
        if (!active(job)) {
            navigating = false; hideNotice();
            try { sessionStorage.removeItem('glorp_matchmaker_notice_v1'); } catch { /* optional */ }
            return;
        }
        const destination = new URL('/', location.origin);
        destination.searchParams.set('game', game.id);
        try { location.assign(destination.href); } catch (error) { navigating = false; throw error; }
    }
    function filters() {
        const result = {};
        for (const key of Object.keys(defaults)) result[key] = typeof defaults[key] === 'boolean' ? controls[key].checked : controls[key].value.trim();
        result.regions = [...selections.regions];
        result.maps = [...selections.maps];
        result.modes = [...selections.modes];
        for (const key of ['minPlayers', 'maxPlayers', 'minTime', 'maxPing']) {
            if (key === 'maxPlayers' && result[key] === '') { result[key] = Infinity; continue; }
            if (!/^\d+$/.test(result[key]) || Number(result[key]) > 100000) throw new Error('Player and time limits must be whole, nonnegative numbers.');
            result[key] = Number(result[key]);
        }
        if (result.minPlayers > result.maxPlayers) throw new Error('Minimum players cannot exceed maximum players.');
        for (const [key, min, max] of [['messageSize', 10, 40], ['messageDuration', 1, 30], ['searchDuration', 1, 30]]) {
            result[key] = Number(result[key]);
            if (!Number.isInteger(result[key]) || result[key] < min || result[key] > max) throw new Error(`${key === 'messageSize' ? 'Message size' : key === 'searchDuration' ? 'Search duration' : 'Message duration'} must be ${min}–${max}.`);
        }
        return result;
    }
    function save() {
        settings = Object.fromEntries(Object.keys(defaults).map(key => [key, typeof defaults[key] === 'boolean' ? controls[key].checked : controls[key].value.trim()]));
        try { localStorage.setItem(KEY, JSON.stringify({ version: 3, filters: { ...settings, noticeTimingVersion: 2, maps: selections.maps, modes: selections.modes, regions: selections.regions } })); storageOK = true; }
        catch { storageOK = false; }
    }
    function stopSearchUI() { clearInterval(searchAnimation); clearTimeout(searchDeadlineTimer); }
    function searchWait(ms, signal) {
        return new Promise(resolve => {
            const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
            const timer = setTimeout(done, ms);
            signal.addEventListener('abort', done, { once: true });
            if (signal.aborted) done();
        });
    }
    function beginSearchUI(job, seconds) {
        job.deadline = Date.now() + seconds * 1000;
        job.checkedIds = new Set();
        let dots = 0;
        showNotice('SEARCHING'); clearTimeout(noticeTimer);
        searchAnimation = setInterval(() => {
            if (active(job)) notice.querySelector('strong').textContent = 'SEARCHING' + '.'.repeat(dots = (dots + 1) % 4);
        }, 350);
        searchDeadlineTimer = setTimeout(() => {
            if (!active(job)) return;
            cancel(); showNotice('NO LOBBY AVAILABLE', true); render();
        }, seconds * 1000);
    }
    function cancel() {
        if (busy === 'quick') { lastSearch = Date.now(); hideNotice(); }
        stopSearchUI();
        clearInterval(confirmationTimer);
        generation++;
        operation?.abort();
        operation = null;
        busy = '';
        panel.removeAttribute('aria-busy');
    }
    function start(kind) {
        cancel();
        operation = new AbortController();
        busy = kind;
        panel.setAttribute('aria-busy', 'true');
        return { token: generation, signal: operation.signal, background: kind === 'quick' };
    }
    function active(job) { return (opened || job.background) && generation === job.token && !job.signal.aborted; }
    function finish(job) {
        if (!active(job)) return;
        stopSearchUI();
        operation = null;
        busy = '';
        panel.removeAttribute('aria-busy');
        render();
    }
    function option(select, value, label) {
        const item = document.createElement('option');
        item.value = value;
        item.textContent = label;
        select.append(item);
    }
    function updateChoices() {
        for (const game of games) {
            if (game.map && game.standardMap) catalog.maps.add(game.map);
            if (game.mode !== '?') catalog.modes.add(game.mode);
            catalog.regions.add(game.region);
        }
        try { localStorage.setItem('glorp_matchmaker_catalog_v1', JSON.stringify({ version: 2, ...Object.fromEntries(Object.entries(catalog).map(([key, values]) => [key, [...values].slice(-5000)])) })); } catch { /* optional catalog */ }
        drawChoices();
    }
    function drawChoices() {
        // Keep every known choice visible, independently of lobby type and current availability.
        const scoped = games;
        for (const key of ['maps', 'modes', 'regions']) {
            const values = [...new Set([...catalog[key], ...scoped.map(g => key === 'maps' ? (g.standardMap ? g.map : '') : key === 'modes' ? g.mode : g.region).filter(v => v && v !== '?'), ...selections[key]])];
            values.sort(key === 'modes' ? (a, b) => Number(a) - Number(b) : (a, b) => a.localeCompare(b));
            const container = root.querySelector(`#${key}`);
            container.replaceChildren();
            const add = (value, label) => {
                const button = document.createElement('button');
                button.type = 'button'; button.className = 'choice';
                button.dataset.value = value; button.textContent = label;
                button.addEventListener('click', () => {
                    if (busy === 'join' || busy === 'quick') return;
                    if (value === '*') selections[key] = [];
                    else if (selections[key].includes(value)) selections[key] = selections[key].filter(v => v !== value);
                    else selections[key].push(value);
                    save(); syncChoices(); render();
                    setStatus('Selection updated. Choose a lobby to check and join.');
                });
                container.append(button);
            };
            add('*', key === 'maps' ? 'All maps' : key === 'modes' ? 'All modes' : 'All regions');
            for (const value of values) add(value, key === 'modes' ? modeLabel(value) : key === 'regions' ? (regionNames.get(value) || value) : value);
        }
        syncChoices();
    }
    function syncChoices() {
        for (const key of ['maps', 'modes', 'regions']) {
            for (const button of root.querySelectorAll(`#${key} button`)) {
                button.setAttribute('aria-pressed', String(button.dataset.value === '*' ? !selections[key].length : selections[key].includes(button.dataset.value)));
                button.disabled = busy === 'join' || busy === 'quick';
            }
            root.querySelector(`#${key}Count`).textContent = selections[key].length ? `${selections[key].length} selected` : 'Any';
        }
    }
    function render() {
        list.replaceChildren();
        let selected;
        try { selected = filters(); }
        catch (error) { setStatus(error.message, true); return; }
        const candidates = games.filter(g => matches(g, selected, fetchedAt))
            .sort((a, b) => b.players - a.players || (b.seconds || 0) - (a.seconds || 0) || a.id.localeCompare(b.id));
        summary.textContent = fetchedAt ? `Showing ${Math.min(visibleLimit, candidates.length)} of ${candidates.length} lobbies` : '';
        renderBreakdown(selected, candidates);
        controls.showMore.hidden = candidates.length <= visibleLimit;
        controls.showMore.disabled = !!busy;
        for (const game of candidates.slice(0, visibleLimit)) {
            const row = document.createElement('article');
            row.className = 'lobby';
            const info = document.createElement('div');
            const title = document.createElement('strong');
            title.textContent = game.map || 'Unknown map';
            const detail = document.createElement('div');
            detail.className = 'muted';
            detail.textContent = `${game.region} · ${modeLabel(game.mode)}`;
            info.append(title, detail);
            const count = document.createElement('div');
            count.className = 'counts';
            const ping = regionPings.get(game.region);
            count.textContent = `${game.players}/${game.capacity} · ${formatTime(remaining(game, fetchedAt))}${ping && Date.now() - ping.sampled < 60000 ? ` · ≈${Math.round(ping.ms)}ms` : ''}`;
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = busy === 'join' || busy === 'quick' ? 'Checking…' : 'Join';
            button.disabled = !!busy;
            button.setAttribute('aria-label', `Join ${game.map || 'unknown map'} ${game.id}`);
            button.addEventListener('click', () => join(game.id));
            row.append(info, count, button);
            list.append(row);
        }
        if (fetchedAt && !candidates.length && !busy) {
            const empty = document.createElement('p');
            empty.className = 'empty';
            empty.textContent = 'No matching lobbies';
            list.append(empty);
        }
        controls.refresh.disabled = busy === 'join' || busy === 'quick';
        controls.quick.disabled = !!busy && busy !== 'quick';
        syncShortcut();
        controls.clearFilters.disabled = busy === 'join' || busy === 'quick';
        controls.reset.disabled = busy === 'join' || busy === 'quick';
        controls.bind.disabled = busy === 'join' || busy === 'quick';
        for (const key of Object.keys(defaults)) controls[key].disabled = busy === 'join' || busy === 'quick';
        for (const slider of root.querySelectorAll('input[type="range"]')) slider.disabled = busy === 'join' || busy === 'quick';
        syncChoices();
    }
    async function refresh(quick = false) {
        if (navigating || (!opened && !quick) || busy === 'join' || busy === 'quick') return;
        let selected;
        try { selected = filters(); } catch (error) { setStatus(error.message, true); if (quick) showNotice('NO LOBBY AVAILABLE', true); return; }
        if (Date.now() - lastSearch < SEARCH_COOLDOWN) {
            const message = busy ? 'Already searching…' : 'Please wait 0.5 seconds between searches.';
            setStatus(message);
            return;
        }
        save();
        lastSearch = Date.now();
        const job = start(quick ? 'quick' : 'search');
        if (quick) beginSearchUI(job, selected.searchDuration);
        games = []; fetchedAt = 0; visibleLimit = LIMIT;
        render();
        setStatus('Loading Krunker lobbies…');
        try {
          do {
            const started = Date.now();
            const payload = await request('game-list?hostname=krunker.io', job.signal);
            if (!active(job)) return;
            if (!payload || !Array.isArray(payload.games)) throw new Error('Krunker changed its lobby-list format. No join attempted.');
            invalidRows = 0;
            const unique = new Map();
            for (const row of payload.games) {
                const game = parseGame(row);
                if (game) unique.set(game.id, game); else invalidRows++;
            }
            if (payload.games.length && !unique.size) throw new Error('No readable lobbies in the response. Krunker may have changed its API.');
            games = [...unique.values()]; fetchedAt = started;
            let current = games.find(game => game.id === currentId());
            const activity = currentActivity();
            if (!current?.map && activity?.id === currentId() && typeof activity.map === 'string' && activity.map) {
                current = { id: activity.id, map: activity.map };
            }
            // The cached list can omit the connected lobby. Recover its metadata
            // directly rather than guessing its map or weakening the restriction.
            if ((!current || !current.map || (selected.maxPing > 0 && !current.region)) && ((quick && selected.differentMap) || selected.maxPing > 0) && validId(currentId())) {
                const id = currentId();
                const detail = parseGame(await request(`game-info?game=${encodeURIComponent(id)}`, job.signal));
                if (!active(job)) return;
                current = detail?.id === id ? detail : null;
            }
            sampleRegionPing(current);
            updateChoices();
            if (quick) {
                if (await quickJoin(selected, job, current)) return;
                await searchWait(Math.max(1, Math.min(1000, job.deadline - Date.now())), job.signal);
                if (!active(job)) return;
                continue;
            }
            const absentRegion = selected.regions.length && !games.some(g => selected.regions.includes(g.region));
            setStatus([
                'Ready. Choose a lobby to check and join.',
                absentRegion ? 'Your selected region is not listed. Select another region if needed.' : '',
                invalidRows ? `Skipped ${invalidRows} invalid entries.` : '',
                !storageOK ? 'Settings could not be saved in this client.' : ''
            ].filter(Boolean).join(' '));
            return;
          } while (quick && active(job) && Date.now() < job.deadline);
          if (active(job)) setStatus('No matching lobby found.', true);
        } catch (error) {
            if (active(job)) setStatus(error.message || 'Search failed. Try again.', true);
        } finally { finish(job); }
    }
    async function quickJoin(selected, job, current) {
        const map = current?.map;
        if (selected.differentMap && !map) throw new Error('Current map is unknown. Refresh later or turn off Different map only.');
        const candidates = games.filter(game => !job.checkedIds.has(game.id) && matches(game, selected, fetchedAt) && (!selected.differentMap || game.map !== map))
            .sort((a, b) => (b.capacity - b.players) - (a.capacity - a.players) || b.players - a.players);
        if (!candidates.length) return false;
        for (const game of candidates.slice(0, 3)) {
            if (!active(job)) return;
            job.checkedIds.add(game.id);
            const started = Date.now();
            const fresh = parseGame(await request(`game-info?game=${encodeURIComponent(game.id)}`, job.signal));
            if (!active(job)) return;
            if (!fresh || fresh.id !== game.id || !matches(fresh, selected, started) || (selected.differentMap && fresh.map === map)) continue;
            await navigateTo(fresh, job);
            return true;
        }
        return false;
    }
    function quickSwitch() {
        if (busy === 'quick') { cancel(); render(); return; }
        if (navigating || busy) return;
        if (opened) close();
        refresh(true);
    }
    async function join(id) {
        if (navigating || busy || !opened || !validId(id)) return;
        let selected;
        try { selected = filters(); } catch (error) { setStatus(error.message, true); return; }
        const job = start('join');
        render();
        setStatus('Checking this lobby’s current map, player count, and time…');
        const started = Date.now();
        try {
            const payload = await request(`game-info?game=${encodeURIComponent(id)}`, job.signal);
            if (!active(job)) return;
            const game = parseGame(payload);
            if (!game || game.id !== id) throw new Error('This lobby disappeared or returned unreadable data. Refresh to find another.');
            // Update this row even when the final check fails.
            games = games.map(old => old.id === id ? { ...game, seconds: game.seconds === null ? null : game.seconds + (started - fetchedAt) / 1000 } : old);
            if (!matches(game, selected, started)) throw new Error('Lobby is full, locked, or no longer matches your filters. Refresh or choose another.');
            setStatus('Checked. Joining…');
            await navigateTo(game, job);
        } catch (error) {
            if (active(job)) setStatus(error.message || 'Could not verify this lobby. Refresh to try again.', true);
        } finally { finish(job); }
    }
    function show(search = true) {
        if (document.pointerLockElement) {
            // F2 during gameplay only leaves pointer lock; it never joins another game.
            try { document.exitPointerLock(); } catch { /* the user can use Esc */ }
        }
        previousFocus = document.activeElement;
        opened = true;
        syncToolbar();
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        render();
        controls.close.focus();
        clearInterval(timer);
        // No background polling or per-frame work.
        timer = setInterval(() => {
            if (!busy && !root.activeElement?.matches('button[aria-label^="Join "]')) render();
        }, 1000);
        if (search) refresh();
    }
    function close() {
        opened = false;
        syncToolbar();
        root.querySelector('#settingsPopup').hidden = true;
        panel.querySelector('.window').inert = false;
        cancel();
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        clearInterval(timer);
        for (const key of Object.keys(defaults)) controls[key].disabled = false;
        controls.refresh.disabled = false;
        recordingKey = false;
        syncShortcut();
        previousFocus?.focus?.();
    }
    function validShortcut(shortcut) {
        if (!/^(?:(?:Ctrl|Alt|Shift)\+)*(?:Key[A-Z]|Digit[0-9]|F\d{1,2})$/.test(shortcut)) return false;
        const code = shortcut.split('+').at(-1);
        if (['F2', 'F4', 'F5', 'F6', 'F11', 'F12'].includes(code)) return false;
        return /^F(?:[1-9]|10)$/.test(code) || /(?:Ctrl|Alt)\+/.test(shortcut);
    }
    function shortcutFromEvent(event) {
        if (event.metaKey) return '';
        // Function-key identity remains usable when a client supplies no physical code.
        const code = /^F\d{1,2}$/.test(event.key) ? event.key : event.code || (/^[a-z]$/i.test(event.key) ? `Key${event.key.toUpperCase()}` : /^\d$/.test(event.key) ? `Digit${event.key}` : '');
        return `${event.ctrlKey ? 'Ctrl+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${code}`;
    }
    function syncShortcut() {
        const label = controls.switchKey.value.replace(/Key|Digit/g, '') || 'Off';
        controls.bind.textContent = recordingKey ? 'Press a shortcut…' : label;
        controls.quick.textContent = `${busy === 'quick' ? 'Cancel search' : 'Search lobbies'}${label === 'Off' ? '' : ` · ${label}`}`;
    }
    function syncSliders() {
        for (const slider of root.querySelectorAll('input[type="range"]')) {
            const value = Number(controls[slider.dataset.for].value) || 0;
            slider.max = Math.max(Number(slider.dataset.max), value);
            slider.value = value;
        }
    }

    function init() {
        if (!document.body || document.getElementById('glorp-matchmaker-host')) return;
        host = document.createElement('div');
        host.id = 'glorp-matchmaker-host';
        // Isolate the UI from the game's styles and inherited display font.
        host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
        root = host.attachShadow({ mode: 'open' });
        root.innerHTML = `
        <style>
          :host { color-scheme:dark; color:#ececf2; text-align:left; }
          * { box-sizing:border-box; font-family:inherit; letter-spacing:normal; } [hidden] { display:none !important; }
          .window,#trigger { font:12px/1.5 gamefont,GameFont,sans-serif; }
          button,input,select { font:inherit; } button { cursor:pointer; border:1px solid #383844; border-radius:8px; padding:8px 12px; color:#e5e5ee; background:#ffffff07; }
          button:hover { background:#ffffff12; border-color:#646075; } button:disabled { opacity:.45; cursor:wait; }
          button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible { outline:2px solid #b6a7df; outline-offset:2px; }
          #trigger { position:fixed; right:16px; top:78px; pointer-events:auto; background:linear-gradient(140deg,#24222e,#111117); border-color:#676072; box-shadow:0 4px 18px #0008; }
          #notice { position:fixed; top:var(--notice-top,132px); right:16px; max-width:min(440px,calc(100vw - 32px)); pointer-events:none; text-align:right; color:#b8b8b8; font:16px/1.3 gamefont,GameFont,sans-serif; text-shadow:1px 2px 3px #000,-1px -1px 2px #000; }
          #notice strong { display:block; font:inherit; overflow-wrap:anywhere; } #notice[data-success="true"] { color:#6dff89; } #notice[data-error="true"] { color:#ff5959; }
          #panel { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; padding:16px; background:#0009; pointer-events:auto; }
          .window { width:800px; max-width:100%; max-height:92vh; display:flex; flex-direction:column; background:linear-gradient(145deg,#20212b 0%,#13141c 50%,#0c0d12 100%); border:1px solid #42414d; border-radius:16px; box-shadow:0 18px 80px #000c; overflow:hidden; }
          header { padding:18px 22px; display:flex; justify-content:space-between; align-items:center; gap:16px; border-bottom:1px solid #ffffff10; }
          h2 { font-size:20px; font-weight:650; margin:0; } .muted,small { color:#aaaab8; font-size:11px; } header p { margin:3px 0 0; }
          .body { padding:16px 22px; overflow:auto; } form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
          label { display:flex; flex-direction:column; gap:6px; color:#c5c4d1; font-size:12px; }
          input,select { width:100%; min-width:0; padding:8px; border:1px solid #3c3c48; border-radius:7px; color:#e5e5ee; background:#0b0c12; }
          fieldset { min-width:0; margin:0; padding:0; border:0; grid-column:1/-1; } legend { width:100%; padding:0; margin-bottom:7px; font-size:12px; color:#c5c4d1; } legend span { float:right; color:#9693a7; font-size:11px; }
          .choices { display:flex; flex-wrap:wrap; align-content:flex-start; gap:6px; max-height:100px; overflow:auto; padding:2px; scrollbar-width:thin; }
          #maps { max-height:140px; } .choice { padding:6px 10px; font-size:12px; overflow-wrap:anywhere; max-width:100%; }
          .choice[aria-pressed="true"] { border-color:#9a87c2; background:#b29bd624; color:#e4d8fc; }
          details { grid-column:1/-1; border-top:1px solid #ffffff12; padding-top:10px; } summary { cursor:pointer; color:#aaa7b9; font-size:12px; } .limits { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:12px; }
          .slider { display:flex; align-items:center; gap:10px; } .slider input[type="range"] { min-width:0; flex:1; padding:0; accent-color:#b19bd6; } .slider input[type="number"] { width:72px; }
          .wide { grid-column:1/-1; } .check { display:flex; flex-direction:row; align-items:center; } input[type="checkbox"] { width:auto; accent-color:#b19bd6; } #bind { min-width:110px; } .binding { display:flex; gap:8px; align-items:center; }
          .actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:15px 0 10px; } #quick { background:#cfbce9; color:#16101e; border-color:#cfbce9; font-weight:650; }
          #status { margin:0; color:#c6c2d3; font-size:12px; } #status[data-error="true"] { color:#ffb9af; } #summary { padding:9px 0; color:#9693a7; font-size:11px; }
          .lobby { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:10px; align-items:center; padding:11px 0; border-top:1px solid #ffffff10; }
          .lobby strong { display:block; overflow-wrap:anywhere; font-size:14px; font-weight:600; } .lobby .muted { overflow-wrap:anywhere; } .counts { color:#b7cbbd; white-space:nowrap; font-size:12px; }
          footer { padding:10px 22px; border-top:1px solid #ffffff10; color:#9693a7; font-size:11px; } .empty { color:#c0bdca; margin:12px 0; }
          button,input,select,.window { border-radius:0; }
          button { border:2px solid #111; background:linear-gradient(#494949,#303030); color:#fff; box-shadow:inset 0 2px #ffffff18,0 4px #151515; text-shadow:1px 2px #0008; }
          button:hover { background:linear-gradient(#606060,#414141); border-color:#111; }
          button:active { transform:translateY(2px); box-shadow:inset 0 2px #ffffff18,0 2px #151515; }
          #trigger { background:linear-gradient(#414141,#242424); border:3px solid #111; box-shadow:0 5px #111; text-transform:uppercase; }
          .window { background:linear-gradient(180deg,#303030,#222 45%,#161616); border:4px solid #111; box-shadow:0 8px #080808,0 18px 60px #000b; }
          header { background:linear-gradient(#454545,#303030); border-bottom:4px solid #151515; padding:16px 20px; }
          h2 { text-transform:uppercase; font-weight:normal; text-shadow:2px 3px #111; }
          input,select { border:2px solid #111; background:linear-gradient(#171717,#242424); color:#eee; box-shadow:inset 0 2px #0005; }
          label,legend,summary { color:#d2d2d2; } .muted,small,legend span,#summary { color:#aaa; }
          .choice[aria-pressed="true"] { background:linear-gradient(#e7a43b,#b67416); border-color:#17120a; color:#fff; }
          #quick { background:linear-gradient(#e7a43b,#b67416); border:2px solid #17120a; color:#fff; font-weight:normal; }
          .slider input[type="range"],input[type="checkbox"] { accent-color:#e5a239; }
          button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible { outline-color:#f4b64c; }
          .lobby { border-top:2px solid #111; } .counts { color:#d0d0d0; }
          header { flex-shrink:0; flex-wrap:wrap; } h2 { min-width:0; overflow-wrap:anywhere; }
          .header-actions { display:flex; gap:12px; flex-wrap:wrap; }
          .window { width:920px; max-height:calc(100dvh - 40px); }
          .body { min-height:0; padding:22px 26px; }
          .selectors { display:grid; gap:16px; }
          .selector { padding:0; border:2px solid #111; background:#19191980; min-width:0; }
          .selector > summary { padding:12px 16px; background:linear-gradient(#3b3b3b,#2b2b2b); font-size:14px; }
          .selector > summary span { float:right; font-size:11px; color:#bbb; margin-left:12px; }
          .choices,#maps { max-height:210px; padding:14px 16px 20px; gap:12px; scrollbar-gutter:stable; }
          .choice { padding:10px 14px; line-height:1.6; min-height:40px; }
          #settingsPopup { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; padding:20px; background:#000b; pointer-events:auto; }
          .settings-window { width:760px; } form.limits { margin:0; gap:22px 24px; }
          .limits label { min-width:0; overflow-wrap:anywhere; line-height:1.7; }
          .slider { min-width:0; gap:14px; } .slider input[type="number"] { width:88px; flex-shrink:0; }
          .binding { flex-wrap:wrap; padding-bottom:4px; }
          #toolbar { position:fixed; top:62px; right:0; padding:16px; min-width:240px; min-height:76px; display:flex; flex-direction:column; align-items:flex-end; gap:12px; pointer-events:auto; }
          #toolbar #trigger { position:static; }
          #toolbar > * { opacity:1; transform:translateY(0); transition:opacity .22s ease,transform .22s ease; }
          #toolbar[data-hidden="true"]:not(:hover):not(:focus-within) #trigger { opacity:0; transform:translateY(-5px); }
          #toolbar:hover > *,#toolbar:focus-within > * { opacity:1; transform:translateY(0); }
          #updateAvailable { color:#ff9a24; background:linear-gradient(#3f3020,#251b13); border:2px solid #bc6e19; padding:8px 12px; text-decoration:none; font:12px/1.5 gamefont,GameFont,sans-serif; cursor:pointer; }
          .breakdown-row { display:flex; justify-content:space-between; gap:20px; padding:5px 0; border-bottom:1px solid #ffffff12; }
          #showMore { margin:12px 0 8px; }
          #updatedNotice { position:fixed; top:24px; right:16px; color:#ff9a24; font:14px/1.5 gamefont,GameFont,sans-serif; text-shadow:1px 2px #000; pointer-events:none; }
          @media(prefers-reduced-motion:reduce) { #toolbar > * { transition:none; } }
          select { color-scheme:dark; background-color:#242424; }
          select option,optgroup { color:#eee; background-color:#242424; }
          select:open { color:#eee; background-color:#242424; }
          .actions { margin-top:22px; gap:12px; padding-bottom:6px; }
          .lobby { grid-template-columns:minmax(0,1fr) auto auto; } .counts { white-space:normal; }
          @media(max-width:580px) { .body {padding:14px;} .lobby {gap:7px;} .counts {font-size:10px;} .limits {grid-template-columns:1fr;} }
        </style>
        <div id="toolbar"><button id="trigger" type="button" aria-label="Open Glorp Matchmaker" aria-expanded="false">Matchmaker · F2</button><a id="updateAvailable" hidden target="_blank" rel="noopener noreferrer">Update available</a></div>
        <div id="updatedNotice" hidden role="status" aria-live="polite"></div>
        <div id="notice" hidden role="status" aria-live="polite"><strong></strong></div>
        <div id="panel" hidden>
          <section class="window" role="dialog" aria-modal="true" aria-labelledby="title" tabindex="-1">
            <header><h2 id="title">Matchmaker</h2><div class="header-actions"><button id="settingsOpen" type="button">Settings</button><button id="close" type="button" aria-label="Close matchmaker">Close ×</button></div></header>
            <div class="body">
              <div class="selectors"><details class="selector" id="mapsSection" open><summary>Maps <span id="mapsCount">Any</span></summary><div id="maps" class="choices" aria-label="maps"></div></details>
<details class="selector" id="modesSection" open><summary>Modes <span id="modesCount">Any</span></summary><div id="modes" class="choices" aria-label="modes"></div></details>
<details class="selector" id="regionsSection" open><summary>Regions <span id="regionsCount">Any</span></summary><div id="regions" class="choices" aria-label="regions"></div></details></div>
              <div class="actions"><button id="quick" type="button">Search lobbies · F8</button><button id="refresh" type="button">Refresh</button><button id="clearFilters" type="button">Clear filters</button><button id="reset" type="button">Reset</button></div>
              <p id="status" role="status" aria-live="polite">Ready.</p><div id="summary"></div><div id="list"></div><button id="showMore" type="button" hidden>Show more</button>
            </div>
          </section>
          <div id="settingsPopup" hidden><section class="window settings-window" role="dialog" aria-modal="true" aria-labelledby="settingsTitle" tabindex="-1"><header><h2 id="settingsTitle">Settings</h2><button id="settingsClose" type="button" aria-label="Close settings">Done</button></header><div class="body"><form class="limits"><details class="wide"><summary>Match breakdown</summary><div id="filterBreakdown"></div></details><label class="wide">Lobby type<select id="kind"><option value="public">Public matches</option><option value="custom">Custom games</option><option value="all">Public + custom</option></select></label>
                  <label>Minimum players<div class="slider"><input type="range" data-for="minPlayers" data-max="32" min="0" max="32" step="1" aria-label="Minimum players slider"><input id="minPlayers" aria-label="Minimum players" type="number" min="0" max="100000" step="1"></div></label>
                  <label>Maximum players (0 on slider = any)<div class="slider"><input type="range" data-for="maxPlayers" data-max="32" min="0" max="32" step="1" aria-label="Maximum players slider"><input id="maxPlayers" aria-label="Maximum players" type="number" min="0" max="100000" step="1" placeholder="Any"></div></label>
                  <label>Minimum seconds left<div class="slider"><input type="range" data-for="minTime" data-max="300" min="0" max="300" step="1" aria-label="Minimum time slider"><input id="minTime" aria-label="Minimum seconds left" type="number" min="0" max="100000" step="1"></div></label>
                  <label>Max region ping estimate · ms (0 = off)<div class="slider"><input type="range" data-for="maxPing" data-max="300" min="0" max="300" step="1" aria-label="Maximum ping slider"><input id="maxPing" aria-label="Maximum region ping estimate" type="number" min="0" max="100000" step="1"></div></label>
                  <small id="pingNote" class="wide"></small>
                  <label>Switch lobby shortcut<div class="binding"><input id="switchKey" type="hidden"><button id="bind" type="button">F8</button><button id="clearBind" type="button">Off</button></div></label>
                  <label class="check wide"><input id="hideButton" type="checkbox">Hide Matchmaker button until hovered</label>
                  <label class="check"><input id="differentMap" type="checkbox">Different map only for quick switch</label>
                  <label>Search duration · sec<div class="slider"><input type="range" data-for="searchDuration" data-max="30" min="1" max="30" step="1" aria-label="Search duration slider"><input id="searchDuration" type="number" min="1" max="30" step="1" aria-label="Search duration"></div></label>
                  <label>Message size · px<div class="slider"><input type="range" data-for="messageSize" data-max="40" min="10" max="40" step="1" aria-label="Message size slider"><input id="messageSize" type="number" min="10" max="40" step="1" aria-label="Message size"></div></label>
                  <label>Message duration · sec<div class="slider"><input type="range" data-for="messageDuration" data-max="30" min="1" max="30" step="1" aria-label="Message duration slider"><input id="messageDuration" type="number" min="1" max="30" step="1" aria-label="Message duration"></div></label>
</form></div></section></div>
        </div>`;
        document.body.append(host);
        panel = root.querySelector('#panel'); trigger = root.querySelector('#trigger');
        notice = root.querySelector('#notice');
        try {
            const prior = JSON.parse(sessionStorage.getItem('glorp_matchmaker_notice_v1') || 'null');
            sessionStorage.removeItem('glorp_matchmaker_notice_v1');
            if (prior && prior.id === currentId() && prior.until > Date.now() && typeof prior.info === 'string') {
                const until = Math.min(prior.until, Date.now() + noticeDuration());
                showNotice(`SWITCHING — ${prior.info}`, false, until - Date.now(), true);
                confirmationTimer = setInterval(() => {
                    if (currentId() !== prior.id || Date.now() >= until) { clearInterval(confirmationTimer); return; }
                    const instructions = document.querySelector('#instructions');
                    if (instructions && instructions.getClientRects().length && /(?:game|lobby|server).{0,20}full|disconnected|connection.{0,20}(?:failed|error)|game.{0,20}not found/i.test(instructions.textContent || '')) {
                        clearInterval(confirmationTimer); showNotice('NO LOBBY AVAILABLE', true, Math.max(1, until - Date.now())); return;
                    }
                    try {
                        const activity = typeof window.getGameActivity === 'function' ? window.getGameActivity() : null;
                        if (activity?.id === prior.id && activity.map && activity.mode != null) {
                            clearInterval(confirmationTimer); // Already green; keep the original expiry.
                        }
                    } catch { /* remain pending until the client confirms */ }
                }, 250);
            }
        } catch { /* notice persistence is optional */ }
        status = root.querySelector('#status'); list = root.querySelector('#list'); summary = root.querySelector('#summary'); form = root.querySelector('form');
        for (const key of [...Object.keys(defaults), 'refresh', 'close', 'reset', 'quick', 'bind', 'clearBind', 'showMore', 'clearFilters']) controls[key] = root.querySelector(`#${key}`);
        function apply(values) {
            for (const key of Object.keys(defaults)) {
                if (typeof defaults[key] === 'boolean') controls[key].checked = values[key];
                else controls[key].value = values[key];
            }
            syncSliders(); syncShortcut();
            notice.style.fontSize = `${Number(values.messageSize) || 16}px`;
            syncToolbar();
        }
        const popup = root.querySelector('#settingsPopup');
        const mainWindow = panel.querySelector('.window');
        const settingsButton = root.querySelector('#settingsOpen');
        function closeSettings() { popup.hidden = true; mainWindow.inert = false; recordingKey = false; syncShortcut(); settingsButton.focus(); }
        settingsButton.addEventListener('click', () => { popup.hidden = false; mainWindow.inert = true; root.querySelector('#settingsClose').focus(); });
        root.querySelector('#settingsClose').addEventListener('click', closeSettings);
        popup.addEventListener('click', event => { if (event.target === popup) closeSettings(); });
        apply(settings);
        drawChoices();
        trigger.addEventListener('click', () => { if (opened) close(); else show(); });
        controls.close.addEventListener('click', close);
        controls.refresh.addEventListener('click', () => refresh());
        controls.quick.addEventListener('click', quickSwitch);
        controls.bind.addEventListener('click', () => { recordingKey = true; syncShortcut(); setStatus('Press a function key or Ctrl/Alt + a key. Esc cancels key capture.'); });
        controls.clearBind.addEventListener('click', () => { if (busy) return; controls.switchKey.value = ''; recordingKey = false; syncShortcut(); save(); });
        controls.showMore.addEventListener('click', () => { if (busy) return; visibleLimit += LIMIT; render(); });
        controls.clearFilters.addEventListener('click', () => {
            if (busy === 'join' || busy === 'quick' || navigating) return;
            cancel(); selections.maps = []; selections.modes = []; selections.regions = [];
            apply({ ...settings, kind: 'all', minPlayers: 0, maxPlayers: '', minTime: 0, maxPing: 0 });
            save(); drawChoices(); visibleLimit = LIMIT; render();
        });
        controls.reset.addEventListener('click', () => { if (busy === 'join' || busy === 'quick') return; cancel(); selections.maps = []; selections.modes = []; selections.regions = []; apply(defaults); drawChoices(); save(); render(); setStatus('Filters reset. All maps and modes included.'); });
        form.addEventListener('submit', event => { event.preventDefault(); refresh(); });
        form.addEventListener('input', event => {
            if (event.target.matches('input[type="range"]')) controls[event.target.dataset.for].value = event.target.dataset.for === 'maxPlayers' && event.target.value === '0' ? '' : event.target.value;
            if (busy === 'search') cancel();
            syncSliders();
            if (event.target === controls.kind) drawChoices();
            try { filters(); save(); syncToolbar(); notice.style.fontSize = `${Number(settings.messageSize)}px`; setStatus('Filters updated. Displaying matching lobbies from this list.'); }
            catch (error) { setStatus(error.message, true); }
            render();
        });
        panel.addEventListener('click', event => { if (event.target === panel) close(); });
        // Suppress game keyboard handlers only while interacting with our dialog.
        root.addEventListener('keydown', event => {
            if (!opened) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!popup.hidden) closeSettings(); else close(); return; }
            if (event.key === 'Tab') {
                const focusable = [...(popup.hidden ? mainWindow : popup).querySelectorAll('button,input,select,summary')].filter(el => !el.disabled && el.type !== 'hidden' && el.getClientRects().length);
                const first = focusable[0], last = focusable.at(-1);
                if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first.focus(); }
            }
            event.stopPropagation();
        });
        root.addEventListener('keyup', event => { if (opened) event.stopPropagation(); });
        root.addEventListener('pointerdown', event => event.stopPropagation());
        document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement && opened) close(); syncToolbar(); });
        window.addEventListener('keydown', event => {
            if (event.repeat) return;
            if (busy === 'quick' && event.key === 'Escape') {
                event.preventDefault(); event.stopImmediatePropagation(); cancel(); hideNotice(); render(); return;
            }
            if (recordingKey) {
                event.preventDefault(); event.stopImmediatePropagation();
                if (event.key === 'Escape') { recordingKey = false; syncShortcut(); return; }
                const key = shortcutFromEvent(event);
                if (!validShortcut(key)) { setStatus('Choose an unreserved function key or Ctrl/Alt + a key.', true); return; }
                controls.switchKey.value = key; recordingKey = false; syncShortcut(); save(); setStatus('Switch shortcut saved.'); return;
            }
            if (controls.switchKey.value && shortcutFromEvent(event) === controls.switchKey.value) {
                event.preventDefault(); event.stopImmediatePropagation(); quickSwitch();
            }
        }, true);
        window.addEventListener('pagehide', () => { opened = false; cancel(); clearInterval(timer); clearTimeout(noticeTimer); clearInterval(confirmationTimer); clearTimeout(updateTimer); });
        ready = true;
        syncToolbar();
        announceLocalUpdate();
        checkUpdates();
        if (!document.body.hasAttribute('tabindex')) document.body.tabIndex = -1;
        focusGameDocument();
        window.addEventListener('pageshow', focusGameDocument);
        window.addEventListener('load', focusGameDocument, { once: true });
        if (pendingMenuToggle) { pendingMenuToggle = false; show(); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
