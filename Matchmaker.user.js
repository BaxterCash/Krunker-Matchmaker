// ==UserScript==
// @name Glorp Matchmaker
// @namespace local.glorp.matchmaker
// @version 1.2.0
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

    const VERSION = '1.1.3';
    const UPDATE_REPO = 'BaxterCash/Krunker-Matchmaker';
    const API = 'https://matchmaker.krunker.io/';
    const KEY = 'glorp_matchmaker_v1';
    const REQUEST_TIMEOUT = 8000;
    const SEARCH_COOLDOWN = 500;
    const NOTICE_DURATION = 3000;
    const LIMIT = 24;
    const HUD_LABELS = [["auto","Auto Switch",12,270,15],["search","Searching",14,265,22],["success","Switching",12,265,22],["failure","No lobby available",14,265,22],["ping","Ping warning",11,18,220],["updated","Updated",14,16,52],["button","Menu button",16,16,78]];
    // Calibrated exponential segments: 25%=2, 50%=5, 75%=8.
    let serverPlayerCap = 40;
    function playerFromSlider(position) {
        const anchors=[[0,0],[25,2],[50,5],[75,8],[100,serverPlayerCap]];
        const p=Math.max(0,Math.min(100,Number(position)));
        for(let i=1;i<anchors.length;i++) if(p<=anchors[i][0]) {
            const [x,a]=anchors[i-1], [y,b]=anchors[i];
            return Math.round(Math.expm1(Math.log1p(a)+(Math.log1p(b)-Math.log1p(a))*(p-x)/(y-x)));
        }
        return serverPlayerCap;
    }
    function playerToSlider(value) {
        let best=0;
        for(let i=1;i<=100;i++) if(Math.abs(playerFromSlider(i)-value)<Math.abs(playerFromSlider(best)-value)) best=i;
        return best;
    }
    const defaults = { kind: 'public', minPlayers: 1, maxPlayers: '', minTime: 0, switchKey: 'F8', menuKey: 'F2', autoKey: 'F7', autoSwitch: false, autoColor: '#2EC0FF', searchColor: '#2EC0FF', autoOpacity: 100, searchOpacity: 100, maxPing: 0, allowPingFallback: false, differentMap: true, messageSize: 16, messageDuration: 3, searchDuration: 5, minSearchTime: 1, hideButton: false, ...Object.fromEntries(HUD_LABELS.flatMap(([id,,size,x,y])=>[[id+'Size',size],[id+'X',x],[id+'Y',y]])) };
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
    let settings = { ...defaults };
    let legacyNoticeTiming = true;
    let storageOK = true;
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (saved && [1, 2, 3, 4].includes(saved.version) && saved.filters && typeof saved.filters === 'object') {
            legacyNoticeTiming = saved.filters.noticeTimingVersion !== 2;
            for (const key of Object.keys(defaults)) {
                if (['string', 'number', 'boolean'].includes(typeof saved.filters[key])) settings[key] = saved.filters[key];
            }
            if(saved.filters.appearanceDefaultsVersion!==1) {
                for(const [id,old] of [['auto',[16,18,28]],['search',[16,16,180]],['success',[16,16,180]],['failure',[16,16,180]]]) {
                    if(['Size','X','Y'].every((suffix,i)=>Number(saved.filters[id+suffix])===old[i]))
                        for(const suffix of ['Size','X','Y']) settings[id+suffix]=defaults[id+suffix];
                }
                for(const [key,old] of [['autoColor','#00FFFF'],['searchColor','#FFFFFF']])
                    if(String(settings[key]).toUpperCase()===old) settings[key]=defaults[key];
            }
            for (const id of ['search','success','failure']) if (saved.filters[id+'Size'] == null && Number(settings.messageSize)!==16) settings[id+'Size']=Number(settings.messageSize);
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
    for (const key of ['menuKey', 'switchKey', 'autoKey']) {
        if (typeof settings[key] !== 'string' || (settings[key] && !validShortcut(settings[key]))) settings[key] = defaults[key];
    }
    const usedKeys = new Set();
    for (const key of ['menuKey', 'switchKey', 'autoKey']) {
        if (settings[key] && usedKeys.has(settings[key])) settings[key] = usedKeys.has(defaults[key]) ? '' : defaults[key];
        if (settings[key]) usedKeys.add(settings[key]);
    }
    for (const key of ['autoSwitch', 'allowPingFallback']) settings[key] = settings[key] === true || settings[key] === 'true';
    // Auto Switch is opt-in for this page only, never armed by saved settings.
    settings.autoSwitch = false;
    for (const key of ['autoColor', 'searchColor']) if (!/^#[0-9a-f]{6}$/i.test(settings[key])) settings[key] = defaults[key];
    for (const key of ['minPlayers', 'maxPlayers', 'minTime', 'maxPing']) {
        if (key === 'maxPlayers' && settings[key] === '') continue;
        if (!/^\d+$/.test(String(settings[key])) || Number(settings[key]) > 100000) settings[key] = defaults[key];
    }
    if (settings.maxPlayers !== '' && Number(settings.maxPlayers) < Number(settings.minPlayers)) settings.maxPlayers = '';
    for (const [key, min, max] of [['messageSize', 10, 40], ['messageDuration', 1, 30], ['searchDuration', 1, 30], ['minSearchTime', 0, 10], ['autoOpacity', 0, 100], ['searchOpacity', 0, 100]]) {
        if (!Number.isInteger(Number(settings[key])) || Number(settings[key]) < min || Number(settings[key]) > max) settings[key] = defaults[key];
    }


    settings.minTime = Math.min(240, Number(settings.minTime));
    for (const [id,,size,x,y] of HUD_LABELS) for (const [suffix,fallback,min,max] of [['Size',size,10,64],['X',x,0,3840],['Y',y,0,2160]]) {
        const key=id+suffix;
        if (!Number.isInteger(Number(settings[key])) || Number(settings[key])<min || Number(settings[key])>max) settings[key]=fallback;
    }
    settings.minSearchTime = Math.min(Number(settings.minSearchTime), Math.max(0, Number(settings.searchDuration) - 1));

    let root, host, panel, trigger, status, list, summary, form, timer, previousFocus, notice, noticeTimer;
    let opened = false, operation = null, generation = 0, busy = '', games = [], fetchedAt = 0, lastSearch = -Infinity;
    let searchAnimation, searchDeadlineTimer;
    let visibleLimit = LIMIT;
    let navigating = false, confirmationTimer, updateTimer, ready = false, pendingMenuToggle = false;
    let invalidRows = 0, recordingKey = false, pendingModifier = null;
    const controls = {};
    let activeJob = null, autoPollTimer;
    let autoRound = {lobby:null, positive:false, lastPositive:0, dueAt:0, fired:false};

    const latency = new Map(), regionLatency = new Map();
    let officialPingObject=null;
    const officialPingValues=new Map(), probeAttempts=new Map();
    let pingPass=null, pingMaintenance=null, lastMaintenanceAttempt=-Infinity;
    const PING_TTL=60000;
    const freshPing=sample=>sample && sample.ms>0 && sample.ms<=10000 && Date.now()>=sample.at && Date.now()-sample.at<=PING_TTL;
    function importOfficialPings() {
        const data=window.windows?.[1]?.pingData;
        if (!data || typeof data!=='object') return;
        const replaced=data!==officialPingObject;
        officialPingObject=data;
        for(const [region,ms] of Object.entries(data).slice(0,100)) if (catalog.regions.has(region) && number(ms) && ms>0 && ms<=10000) {
            // Krunker may update pingData in place. Import changed values, but do
            // not keep renewing the timestamp of an unchanged stale snapshot.
            if(replaced || officialPingValues.get(region)!==ms) regionLatency.set(region,{ms,at:Date.now(),source:'region HTTPS'});
            officialPingValues.set(region,ms);
        }
    }
    function persistRegionPings() {
        try {sessionStorage.setItem('glorp_matchmaker_region_ping_v1',JSON.stringify([...regionLatency]));}catch{}
    }
    function pingSample(game) {
        const exact=latency.get(game.id);
        if(freshPing(exact)) return {...exact,source:'ICMP'};
        const regional=regionLatency.get(game.region);
        return freshPing(regional)?regional:null;
    }
    async function ensureRegionPings(candidates,job) {
        importOfficialPings();
        const regions=[...new Set(candidates.filter(game=>{
            const sample=pingSample(game);
            return !sample || (job.pingOnly && sample.source==='region HTTPS' && Date.now()-sample.at>=45000);
        }).map(game=>game.region))]
            .filter(region=>Date.now()-(probeAttempts.get(region)??-Infinity)>=15000);
        if(!regions.length || !active(job) || pingPass) return;
        pingPass=job;
        const controller=new AbortController(), abort=()=>controller.abort();
        job.signal.addEventListener('abort',abort,{once:true});
        const maxBudget=job.pingOnly?6000:2200;
        const budget=Math.max(1,Math.min(maxBudget,(job.deadline||Date.now()+maxBudget+100)-Date.now()-100));
        const timeout=setTimeout(abort,budget);
        let lastBeat=performance.now(), lastStall=-Infinity;
        const heartbeat=setInterval(()=>{const now=performance.now();if(now-lastBeat>250)lastStall=now;lastBeat=now;},50);
        try {
            const response=await fetch(API+'ping-list?hostname=krunker.io',{signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
            if(!response.ok) return;
            const endpoints=await response.json();
            if(!endpoints || typeof endpoints!=='object' || Array.isArray(endpoints)) return;
            const targets=new Map();
            for(const region of regions) {
                try {
                    const raw=endpoints[region];
                    if(typeof raw!=='string') continue;
                    const url=new URL(raw.includes('://')?raw:'https://'+raw);
                    if(!/^lobby-[a-z0-9-]+\.[a-z0-9-]+\.krunker\.io$/i.test(url.hostname) || url.username || url.password || (url.port && url.port!=='3000')) continue;
                    targets.set(region,'https://'+url.hostname+'/ping');
                }catch{}
            }
            // First sample every region before warming any one region. A slow
            // endpoint must not monopolize the entire pass or suppress retries
            // for another region that was never attempted.
            for(let pass=0;pass<2 && !controller.signal.aborted;pass++) {
              const queue=[...targets.keys()];
              await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{
                while(queue.length && !controller.signal.aborted) {
                    const region=queue.shift();
                    probeAttempts.set(region,Date.now());
                    const probe=new AbortController(), stopProbe=()=>probe.abort();
                    controller.signal.addEventListener('abort',stopProbe,{once:true});
                    // The menu maintenance pass permits cold DNS/TLS connections
                    // more time without extending a Quick Switch deadline.
                    const probeTimeout=setTimeout(stopProbe,job.pingOnly?1800:700);
                        try {
                            const started=performance.now();
                            const reply=await fetch(targets.get(region),{signal:probe.signal,credentials:'omit',cache:'no-store',mode:'cors',referrerPolicy:'no-referrer'});
                            const elapsed=performance.now()-started;
                            // Latency ends when response headers arrive, not after body transfer.
                            // Do not wait for body completion to time a response.
                            reply.body?.cancel().catch(()=>{});
                            const responsive=performance.now()-lastBeat<=250 && lastStall<started;
                            if(reply.ok && !probe.signal.aborted && !job.signal.aborted && responsive && elapsed>0 && elapsed<=10000) {
                                const previous=regionLatency.get(region);
                                const ms=Math.max(1,Math.round(elapsed));
                                regionLatency.set(region,{ms:pass && freshPing(previous)?Math.min(previous.ms,ms):ms,at:Date.now(),source:'region HTTPS'});
                            }
                        } catch { /* unknown; a timeout is never a ping value */ }
                        finally {clearTimeout(probeTimeout);controller.signal.removeEventListener('abort',stopProbe);}
                }
              }));
            }
            if(active(job)) persistRegionPings();
        } catch { /* unavailable is unknown, never zero or an exclusion by itself */ }
        finally {clearTimeout(timeout);clearInterval(heartbeat);job.signal.removeEventListener('abort',abort);if(pingPass===job)pingPass=null;}
    }
    async function maintainPings() {
        if(!opened || busy || pingPass || pingMaintenance || !fetchedAt || Date.now()-lastMaintenanceAttempt<5000) return;
        let selected;
        try {selected=filters();}catch{return;}
        const candidates=games.filter(game=>matches(game,selected,fetchedAt));
        if(!candidates.some(game=>{
            const sample=pingSample(game);
            return (!sample || (sample.source==='region HTTPS' && Date.now()-sample.at>=45000)) &&
                Date.now()-(probeAttempts.get(game.region)??-Infinity)>=15000;
        })) return;
        lastMaintenanceAttempt=Date.now();
        const controller=new AbortController();
        pingMaintenance=controller;
        const job={token:generation,signal:controller.signal,background:false,pingOnly:true};
        try {
            await ensureRegionPings(candidates,job);
            if(active(job) && !busy && !root.activeElement?.matches('button[aria-label^="Join "]')) render();
        } finally {if(pingMaintenance===controller)pingMaintenance=null;}
    }
    let stablePingLobby = null, stablePingSince = 0;

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

    function typingTarget(event) {
        const target = event.composedPath?.()[0] || event.target;
        return !!target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]');
    }
    // Capture all configured bindings at document start, before game handlers.
    window.addEventListener('keydown', event => {
        if (event.repeat || event.isComposing) return;
        const key = shortcutFromEvent(event);
        if (recordingKey && ready) {
            if (/^(?:Control|Alt|Shift|Meta)(?:Left|Right)?$/.test(event.code || event.key)) { pendingModifier = key; event.preventDefault(); event.stopImmediatePropagation(); return; }
            pendingModifier = null;
            event.preventDefault(); event.stopImmediatePropagation();
            if (!validShortcut(key)) return;
            if (['menuKey', 'switchKey', 'autoKey'].some(other => other !== recordingKey && controls[other].value === key)) {
                root.querySelector('#bindError').textContent = 'That key is already assigned.'; return;
            }
            controls[recordingKey].value = key; recordingKey = false;
            root.querySelector('#bindError').textContent = ''; syncShortcut(); save(); return;
        }
        const menu = ready ? controls.menuKey.value : settings.menuKey;
        if (typingTarget(event) && !(key === menu && /^F\d+$/.test(key))) return;
        if (menu && key === menu) {
            event.preventDefault(); event.stopImmediatePropagation();
            if (!ready) { pendingMenuToggle = !pendingMenuToggle; return; }
            if (busy === 'quick') { cancel(); hideNotice(); }
            if (opened) close(); else show(); return;
        }
        if (!ready) return;
        if (controls.autoKey.value && key === controls.autoKey.value) {
            event.preventDefault(); event.stopImmediatePropagation();
            controls.autoSwitch.checked = !controls.autoSwitch.checked; save(); syncHUD(); configureAutoSwitch(); return;
        }
        if (controls.switchKey.value && key === controls.switchKey.value) {
            event.preventDefault(); event.stopImmediatePropagation(); quickSwitch(); return;
        }
        if (busy === 'quick' && event.key === 'Escape') {
            event.preventDefault(); event.stopImmediatePropagation(); cancel(); render();
        }
    }, true);
    window.addEventListener('keyup', event => {
        if (!ready || !recordingKey || !pendingModifier || !/^(?:Control|Alt|Shift|Meta)(?:Left|Right)?$/.test(event.code || event.key)) return;
        event.preventDefault(); event.stopImmediatePropagation();
        const key = pendingModifier; pendingModifier = null;
        if (['menuKey', 'switchKey', 'autoKey'].some(other => other !== recordingKey && controls[other].value === key)) { root.querySelector('#bindError').textContent = 'That key is already assigned.'; return; }
        controls[recordingKey].value = key; recordingKey = false; root.querySelector('#bindError').textContent = ''; syncShortcut(); save();
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
    function measuredPing(game) {
        return pingSample(game)?.ms ?? null;
    }
    function pingPolicy(candidates, selected) {
        if (!selected.maxPing) return { candidates, fallback: false, unavailable: false };
        const strict = candidates.filter(game => measuredPing(game) !== null && measuredPing(game) <= selected.maxPing);
        return strict.length ? { candidates: strict, fallback: false, unavailable: false } : { candidates, fallback: candidates.length > 0, unavailable: candidates.every(game => measuredPing(game) === null) };
    }
    function showPingWarning(policy, selected) {
        let message = '';
        if (selected.maxPing && policy.fallback) message = policy.unavailable ? 'Ping data unavailable for these lobbies. Showing matches without ping limit.' : 'No lobbies under ' + selected.maxPing + ' ms. Showing matches without ping limit.';
        root.querySelector('#pingWarning').textContent = message;
        root.querySelector('#pingHUD').textContent = message;
        root.querySelector('#pingHUD').hidden = opened || !message;
        root.querySelector('#maxPing').title='0 = off. ~ means a measured region HTTPS estimate, not game-server RTT. Unknown data uses warned fallback; Auto Switch requires explicit fallback opt-in.';
    }
    function receiveMeasuredPing(event) {
        const value = event?.data?.pingInfo, activity = currentActivity(), id = currentId();
        if (!number(value) || value <= 0 || value > 10000 || !validId(id) || activity?.id !== id || !activity.map || navigating) return;
        if (stablePingLobby !== id) { stablePingLobby = id; stablePingSince = Date.now(); return; }
        if (Date.now() - stablePingSince < 2000) return;
        latency.set(id, { ms: value, at: Date.now() });
        try { sessionStorage.setItem('glorp_matchmaker_latency_v1', JSON.stringify([...latency].slice(-100))); } catch { /* optional measurements */ }
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

        if (!notice.hidden && notice.querySelector('strong').textContent === title && notice.dataset.error === String(error) && notice.dataset.success === String(success)) return;
        notice.querySelector('strong').textContent = title;
        notice.dataset.error = String(error);
        notice.dataset.success = String(success);
        notice.hidden = false;
        syncHUD();
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => { notice.hidden = true; }, duration);
    }
    function hideNotice() { clearTimeout(noticeTimer); notice.hidden = true; syncHUD(); }
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
        try { location.assign(destination.href); } catch (error) { navigating = false; syncHUD(); throw error; }
    }
    function filters() {
        const result = {};
        for (const key of Object.keys(defaults)) result[key] = typeof defaults[key] === 'boolean' ? controls[key].checked : controls[key].value.trim();
        result.minTime = parseTime(result.minTime);
        for (const [id] of HUD_LABELS) for (const [suffix,min,max] of [['Size',10,64],['X',0,3840],['Y',0,2160]]) {
            const value=Number(result[id+suffix]);
            if (!Number.isInteger(value)||value<min||value>max) throw new Error('HUD size or position is out of range.');
        }
        result.regions = [...selections.regions];
        result.maps = [...selections.maps];
        result.modes = [...selections.modes];
        for (const key of ['minPlayers', 'maxPlayers', 'minTime', 'maxPing']) {
            if (key === 'maxPlayers' && result[key] === '') { result[key] = Infinity; continue; }
            if (!/^\d+$/.test(String(result[key])) || Number(result[key]) > 100000) throw new Error('Player, time and ping limits must be whole, nonnegative numbers.');
            result[key] = Number(result[key]);
        }
        if (result.minPlayers > result.maxPlayers) throw new Error('Min players cannot exceed maximum players.');
        for (const [key, min, max] of [['messageSize', 10, 40], ['messageDuration', 1, 30], ['searchDuration', 1, 30], ['minSearchTime', 0, 10], ['autoOpacity', 0, 100], ['searchOpacity', 0, 100]]) {
            result[key] = Number(result[key]);
            if (!Number.isInteger(result[key]) || result[key] < min || result[key] > max) throw new Error(`${({messageSize:'Message size',messageDuration:'Message duration',searchDuration:'Search duration',minSearchTime:'Min search time',autoOpacity:'Auto Switch opacity',searchOpacity:'Searching opacity'})[key]} must be ${min}–${max}.`);
        }
        if (result.minSearchTime >= result.searchDuration) throw new Error('Min search time must be shorter than search duration.');
        return result;
    }
    function parseTime(value) {
        if (!/^\d{1,2}:[0-5]\d$/.test(value)) throw new Error('Time left must be m:ss, up to 4:00.');
        const [minutes,seconds]=value.split(':').map(Number), total=minutes*60+seconds;
        if (total>240) throw new Error('Time left cannot exceed 4:00.');
        return total;
    }
    function save() {
        settings = Object.fromEntries(Object.keys(defaults).map(key => [key, typeof defaults[key] === 'boolean' ? controls[key].checked : controls[key].value.trim()]));
        settings.minTime = parseTime(controls.minTime.value);
        try { localStorage.setItem(KEY, JSON.stringify({ version: 4, filters: { ...settings, noticeTimingVersion: 2, appearanceDefaultsVersion: 1, maps: selections.maps, modes: selections.modes, regions: selections.regions } })); storageOK = true; }
        catch { storageOK = false; }
        syncHUD();
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
        job.readyAt = Date.now() + Number(settings.minSearchTime) * 1000;
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
        pingMaintenance?.abort(); pingMaintenance=null;
        if (busy === 'quick') { lastSearch = Date.now(); hideNotice(); }
        stopSearchUI();
        clearInterval(confirmationTimer);
        generation++;
        operation?.abort();
        operation = null; activeJob = null;
        busy = '';
        syncHUD();
        panel.removeAttribute('aria-busy');
    }
    function start(kind) {
        cancel();
        operation = new AbortController();
        busy = kind;
        panel.setAttribute('aria-busy', 'true');
        activeJob = { token: generation, signal: operation.signal, background: kind === 'quick', automatic: false };
        return activeJob;
    }
    function active(job) { return (opened || job.background) && generation === job.token && !job.signal.aborted; }
    function finish(job) {
        if (!active(job)) return;
        stopSearchUI();
        operation = null; activeJob = null;
        busy = '';
        syncHUD();
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
        importOfficialPings();
        const policy = pingPolicy(games.filter(g => matches(g, selected, fetchedAt)), selected);
        showPingWarning(policy, selected);
        const pingDetails=root.querySelector('#pingDiagnostics');
        if(pingDetails) {
            const eligible=games.filter(g=>matches(g,selected,fetchedAt)), measured=eligible.filter(g=>measuredPing(g)!==null);
            pingDetails.textContent=`${measured.length}/${eligible.length} eligible lobbies have fresh measurements. `+
                'Region HTTPS is an estimate, not game-server RTT. Unknown is never zero. '+
                [...new Set(eligible.map(g=>g.region))].map(region=>{
                    const sample=regionLatency.get(region);
                    return `${region}: ${freshPing(sample)?'~'+sample.ms+' ms ('+Math.floor((Date.now()-sample.at)/1000)+'s old)':'unknown'}`;
                }).join(' · ');
        }
        const candidates = policy.candidates
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
            count.textContent = `${game.players}/${game.capacity} · ${formatTime(remaining(game, fetchedAt))}${measuredPing(game) === null ? ' · Ping unknown' : ' · ' + (pingSample(game).source==='region HTTPS'?'~':'') + Math.round(measuredPing(game)) + ' ms'}`;
            count.title=pingSample(game)?.source || 'Ping measurement unavailable';
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
    async function refresh(quick = false, automatic = false) {
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
        job.automatic = automatic;
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
            // Future larger custom servers extend the endpoint without altering saved numeric filters.
            serverPlayerCap=Math.max(40,...games.map(game=>game.capacity));
            syncSliders();
            let current = games.find(game => game.id === currentId());
            const activity = currentActivity();
            if (!current?.map && activity?.id === currentId() && typeof activity.map === 'string' && activity.map) {
                current = { id: activity.id, map: activity.map };
            }
            // The cached list can omit the connected lobby. Recover its metadata
            // directly rather than guessing its map or weakening the restriction.
            if ((!current || !current.map) && quick && selected.differentMap && validId(currentId())) {
                const id = currentId();
                const detail = parseGame(await request(`game-info?game=${encodeURIComponent(id)}`, job.signal));
                if (!active(job)) return;
                current = detail?.id === id ? detail : null;
            }
            updateChoices();
            render(); // Keep the list visible while bounded regional probes run.
            await ensureRegionPings(games.filter(game=>matches(game,selected,fetchedAt)),job);
            if(!active(job)) return;
            render();
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
        const policy = pingPolicy(games.filter(game => !job.checkedIds.has(game.id) && matches(game, selected, fetchedAt) && (!selected.differentMap || game.map !== map)), selected);
        showPingWarning(policy, selected);
        if (policy.fallback && job.automatic && !selected.allowPingFallback) return false;
        const candidates = policy.candidates
            .sort((a, b) => (b.capacity - b.players) - (a.capacity - a.players) || b.players - a.players);
        if (!candidates.length) return false;
        if (Date.now() < job.readyAt) await searchWait(job.readyAt - Date.now(), job.signal);
        if (!active(job)) return false;
        for (const game of candidates.slice(0, 3)) {
            if (!active(job)) return;
            job.checkedIds.add(game.id);
            const started = Date.now();
            const fresh = parseGame(await request(`game-info?game=${encodeURIComponent(game.id)}`, job.signal));
            if (!active(job)) return;
            if (!fresh || fresh.id !== game.id || !matches(fresh, selected, started) || (selected.differentMap && fresh.map === map)) continue;
            if (selected.maxPing && (measuredPing(fresh) === null || measuredPing(fresh) > selected.maxPing) && (!policy.fallback || (job.automatic && !selected.allowPingFallback))) continue;
            await navigateTo(fresh, job);
            return true;
        }
        return false;
    }
    function quickSwitch(automatic = false) {
        if (busy === 'quick') { cancel(); render(); return; }
        if (navigating || busy) return;
        if (opened) close();
        refresh(true, automatic === true);
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
            const currentPolicy = pingPolicy(games.filter(g => matches(g, selected, started)), selected);
            const pingAllowed = !selected.maxPing || (measuredPing(game) !== null && measuredPing(game) <= selected.maxPing) || (currentPolicy.fallback && currentPolicy.candidates.some(g => g.id === game.id));
            if (!matches(game, selected, started) || !pingAllowed) throw new Error('Lobby is full, locked, or no longer matches your filters. Refresh or choose another.');
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
        root.querySelector('#pingHUD').hidden = true;
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        render();
        controls.close.focus();
        clearInterval(timer);
        // Refresh latency while the menu is open, before cached samples expire.
        // This never refreshes the lobby list, starts a search, or navigates.
        timer = setInterval(() => {
            if (!busy && !root.activeElement?.matches('button[aria-label^="Join "]')) render();
            maintainPings();
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
        root.querySelector('#pingHUD').hidden = !root.querySelector('#pingHUD').textContent;
        trigger.setAttribute('aria-expanded', 'false');
        clearInterval(timer);
        for (const key of Object.keys(defaults)) controls[key].disabled = false;
        controls.refresh.disabled = false;
        recordingKey = false;
        syncShortcut();
        previousFocus?.focus?.();
    }
    function validShortcut(shortcut) {
        return typeof shortcut === 'string' && shortcut.length < 90 && /^(?:(?:Ctrl|Alt|Shift|Meta)\+)*[A-Za-z][A-Za-z0-9]{0,31}$/.test(shortcut) && !shortcut.endsWith('Unidentified');
    }
    function shortcutFromEvent(event) {
        const fallback = event.key === ' ' ? 'Space' : /^[a-z]$/i.test(event.key) ? 'Key' + event.key.toUpperCase() : /^\d$/.test(event.key) ? 'Digit' + event.key : event.key;
        const code = event.code || fallback || '';
        return (event.ctrlKey && !/^Control/.test(code) ? 'Ctrl+' : '') + (event.altKey && !/^Alt/.test(code) ? 'Alt+' : '') + (event.shiftKey && !/^Shift/.test(code) ? 'Shift+' : '') + (event.metaKey && !/^Meta/.test(code) ? 'Meta+' : '') + code;
    }
    const keyLabel = value => value.replace(/Key|Digit/g, '') || 'Off';
    function syncShortcut() {
        for (const [key, id] of [['menuKey', 'bindMenu'], ['switchKey', 'bind'], ['autoKey', 'bindAuto']]) {
            controls[id].textContent = recordingKey === key ? 'Press a key…' : keyLabel(controls[key].value);
        }
        const label = keyLabel(controls.switchKey.value);
        root.querySelector('#autoAction').textContent='Enable Auto Switch 1 second after EoM'+(controls.autoKey.value?' ('+keyLabel(controls.autoKey.value)+')':'');
        controls.close.textContent='Close'+(controls.menuKey.value?' ('+keyLabel(controls.menuKey.value)+')':'')+' ×';
        controls.quick.textContent = (busy === 'quick' ? 'Cancel search' : 'Search lobbies') + (label === 'Off' ? '' : ' (' + label + ')');
        trigger.textContent = 'Matchmaker' + (controls.menuKey.value ? ' (' + keyLabel(controls.menuKey.value) + ')' : '');
    }
    function syncHUD() {
        if (!root) return;
        for (const [name, value] of [['--auto-color', settings.autoColor], ['--search-color', settings.searchColor], ['--auto-opacity', Number(settings.autoOpacity) / 100], ['--search-opacity', Number(settings.searchOpacity) / 100]]) host.style.setProperty(name, value);
        const place=(element,id)=>{
            element.style.fontSize=Number(settings[id+'Size'])+'px';
            element.style.right='min('+Number(settings[id+'X'])+'px, calc(100vw - 40px))';
            element.style.top='min('+Number(settings[id+'Y'])+'px, calc(100vh - 40px))';
        };
        for (const [selector,id] of [['#autoHUD','auto'],['#pingHUD','ping'],['#updatedNotice','updated'],['#trigger','button']]) place(root.querySelector(selector),id);
        root.querySelector('#toolbar').style.cssText='top:0;right:0;min-width:0;min-height:0;padding:0;';
        trigger.style.position='fixed';
        place(notice,notice.dataset.success==='true'?'success':notice.dataset.error==='true'?'failure':'search');
        root.querySelector('#autoHUD').hidden = !settings.autoSwitch || navigating || busy === 'quick';

    }
    function configureAutoSwitch() {
        clearInterval(autoPollTimer);
        autoRound={lobby:currentId(),positive:false,lastPositive:0,dueAt:0,fired:false};
        if (!settings.autoSwitch && activeJob?.automatic) { cancel(); render(); }
        if (settings.autoSwitch) autoPollTimer=setInterval(checkAutoTimer,100);
    }
    function readMatchTimer() {
        // Verified current Krunker HUD element; never read endTimer or scoreboard text.
        const node=document.getElementById('timerVal');
        if (!node) return null;
        const match=node.textContent.trim().match(/^(\d{1,3}):([0-5]\d)$/);
        return match ? {seconds:Number(match[1])*60+Number(match[2]),visible:node.getClientRects().length>0 && getComputedStyle(node).visibility!=='hidden'} : null;
    }
    function checkAutoTimer() {
        if (!settings.autoSwitch || navigating) return;
        const lobby=currentId(), now=Date.now(), timer=readMatchTimer();
        if (!lobby || lobby!==autoRound.lobby) {autoRound={lobby,positive:false,lastPositive:0,dueAt:0,fired:false};return;}
        if (timer?.seconds>0 && timer.visible) {
            // A new positive countdown rearms after a completed round.
            if(autoRound.dueAt || autoRound.fired) autoRound={lobby,positive:false,lastPositive:0,dueAt:0,fired:false};
            autoRound.positive=true;autoRound.lastPositive=now;return;
        }
        if (timer?.seconds===0 && autoRound.positive && !autoRound.dueAt && !autoRound.fired && now-autoRound.lastPositive<=2500) autoRound.dueAt=now+1000;
        if (!autoRound.dueAt || autoRound.fired || now<autoRound.dueAt) return;
        autoRound.fired=true; // Never defer a round-end trigger into a later game/search.
        if (timer?.seconds>0 || busy || Date.now()-lastSearch<SEARCH_COOLDOWN) return;
        quickSwitch(true);
    }
    function syncSliders() {
        for (const slider of root.querySelectorAll('input[type="range"]')) {
            const key=slider.dataset.for;
            const value = key==='minTime' ? (()=>{try{return parseTime(controls.minTime.value)}catch{return 0}})() : Number(controls[key].value) || 0;
            if (key==='maxPlayers') { slider.max=100; slider.value=value>=serverPlayerCap?100:playerToSlider(value); continue; }
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
          #notice { position:fixed; top:var(--notice-top,132px); right:16px; max-width:min(440px,calc(100vw - 32px)); pointer-events:none; text-align:right; color:var(--search-color,#FFFFFF); opacity:var(--search-opacity,1); font:16px/1.3 gamefont,GameFont,sans-serif; text-shadow:1px 2px 3px #000,-1px -1px 2px #000; }
          #notice strong { display:block; font:inherit; overflow-wrap:anywhere; } #notice[data-success="true"] { color:#6dff89; opacity:1; } #notice[data-error="true"] { color:#ff5959; opacity:1; }
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
          .settings-window { width:920px; } form.limits { margin:0; gap:22px 24px; }
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
          .section-title { margin:0; padding:10px 12px; background:linear-gradient(#3e3e3e,#282828); color:#fff; font-size:15px; font-weight:normal; text-transform:uppercase; border-bottom:2px solid #111; }
          .match-settings,.settings-section { border:2px solid #111; background:#19191980; }
          .match-settings { margin-top:16px; } .main-filters { padding:14px; display:grid; grid-template-columns:1fr 1.15fr .85fr; gap:16px; }
          .main-filters label { min-width:0; } .main-filters .slider { gap:8px; } .main-filters input[type="number"] { width:65px; }
          .main-filters input[type="range"] { min-width:24px; }
          .keybind-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; padding:14px; }
          .keybind-grid .binding { gap:8px; } .keybind-grid button { min-width:0; max-width:100%; overflow-wrap:anywhere; }
          .settings-section > .check,.settings-section > small { margin:12px; } #autoStatus { display:block; color:#ffad45; }
          #settingsError,#bindError { color:#ff5959; margin:8px 14px; } .hud-row { padding:14px; display:grid; grid-template-columns:1fr 70px 1.4fr 1.3fr; gap:12px; align-items:center; border-top:2px solid #111; }
          .hud-row input[type="color"] { height:34px; padding:2px; } .hud-row input[type="number"] { width:60px; }
          .hud-preview { font:16px/1.6 gamefont,GameFont,sans-serif; background:none; border:0; box-shadow:none; overflow-wrap:anywhere; }
          #autoPreview,#autoHUD { color:var(--auto-color,#00FFFF); opacity:var(--auto-opacity,1); } #searchPreview { color:var(--search-color,#FFFFFF); opacity:var(--search-opacity,1); }
          #autoHUD { position:fixed; right:18px; top:28px; font:16px/1.5 gamefont,GameFont,sans-serif; pointer-events:none; text-shadow:1px 2px #000; }
          #updatedNotice { top:52px; }
          #pingWarning { margin:0 14px 12px; } #pingWarning:empty { display:none; } #pingWarning,#pingHUD { color:#ffa326; font:11px/1.6 gamefont,GameFont,sans-serif; }
          #pingHUD { position:fixed; top:220px; right:18px; max-width:440px; text-align:right; pointer-events:none; text-shadow:1px 2px #000; }
          .selectors { gap:10px; } .choices,#maps { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); max-height:190px; gap:10px; padding:12px 14px 18px; }
          .choice { padding:8px 10px; min-height:44px; line-height:1.6; } #modes { grid-template-columns:repeat(auto-fill,minmax(165px,1fr)); }
          .selector > summary { padding:10px 14px; }
          @media(max-width:650px) { .main-filters { grid-template-columns:1fr; } .keybind-grid { grid-template-columns:1fr; } .hud-row { grid-template-columns:1fr 1fr; } .choices,#maps,#modes { grid-template-columns:repeat(2,minmax(0,1fr)); } }
          .body,.selectors,.selector { overflow-anchor:none; scroll-behavior:auto; }
          .hud-placement { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; padding:14px 0; }
          .hud-placement input { width:100%; box-sizing:border-box; }
          .author-credit { display:flex; justify-content:flex-end; align-items:baseline; gap:6px; padding:10px 16px; color:#8b8b8b; background:linear-gradient(#262626,#1b1b1b); border-top:2px solid #101010; flex-shrink:0; }
          .author-credit small { font-size:9px; } .author-credit span { font-size:13px; }
          #minTime { width:65px; text-align:center; }
          #toolbar[data-hidden="true"]:not(:hover):not(:focus-within) { pointer-events:auto; }
          #trigger { pointer-events:auto; }
          @media(prefers-reduced-motion:reduce) { #toolbar > * { transition:none; } }
          select { color-scheme:dark; background-color:#242424; }
          select option,optgroup { color:#eee; background-color:#242424; }
          select:open { color:#eee; background-color:#242424; }
          .actions { margin-top:22px; gap:12px; padding-bottom:6px; }
          .lobby { grid-template-columns:minmax(0,1fr) auto auto; } .counts { white-space:normal; }
          @media(max-width:580px) { .body {padding:14px;} .lobby {gap:7px;} .counts {font-size:10px;} .limits {grid-template-columns:1fr;} }
        </style>
        <div id="toolbar"><button id="trigger" type="button" aria-label="Open Glorp Matchmaker" aria-expanded="false">Matchmaker · F2</button><a id="updateAvailable" hidden target="_blank" rel="noopener noreferrer">Update available</a></div>
        <div id="autoHUD" hidden>AUTO-SWITCH</div><div id="pingHUD" hidden role="status"></div>
        <div id="updatedNotice" hidden role="status" aria-live="polite"></div>
        <div id="notice" hidden role="status" aria-live="polite"><strong></strong></div>
        <div id="panel" hidden>
          <section class="window" role="dialog" aria-modal="true" aria-labelledby="title" tabindex="-1">
            <header><h2 id="title">Matchmaker <small>v${VERSION}</small></h2><div class="header-actions"><button id="settingsOpen" type="button">Settings</button><button id="close" type="button" aria-label="Close matchmaker">Close ×</button></div></header>
            <div class="body">
              <div class="selectors"><details class="selector" id="mapsSection"><summary>Maps <span id="mapsCount">Any</span></summary><div id="maps" class="choices" aria-label="maps"></div></details>
<details class="selector" id="modesSection"><summary>Modes <span id="modesCount">Any</span></summary><div id="modes" class="choices" aria-label="modes"></div></details>
<details class="selector" id="regionsSection"><summary>Regions <span id="regionsCount">Any</span></summary><div id="regions" class="choices" aria-label="regions"></div></details></div>
              <section class="match-settings"><h3 class="section-title">Match Settings</h3><form id="mainFilters" class="main-filters"><label>Min Players<div class="slider"><input type="range" data-for="minPlayers" data-max="32" min="0" max="32" step="1" aria-label="Min players slider"><input id="minPlayers" aria-label="Min players" type="number" min="0" max="100000" step="1"></div></label><label>Min Time Left (m:ss)<div class="slider"><input type="range" data-for="minTime" data-max="240" min="0" max="240" step="1" aria-label="Min time slider"><input id="minTime" aria-label="Min time left" type="text" inputmode="numeric" pattern="[0-4]:[0-5][0-9]" maxlength="4" title="m:ss, up to 4:00"></div></label><label>Max Ping (ms)<div class="slider"><input type="range" data-for="maxPing" data-max="300" min="0" max="300" step="1" aria-label="Max Ping slider"><input id="maxPing" type="number" min="0" max="100000" step="1" aria-label="Max Ping" title="0 = off"></div></label></form><p id="pingWarning" role="status"></p></section>
              <div class="actions"><button id="quick" type="button">Search lobbies · F8</button><button id="refresh" type="button">Refresh</button><button id="clearFilters" type="button">Clear filters</button><button id="reset" type="button">Reset</button></div>
              <p id="status" role="status" aria-live="polite">Ready.</p><div id="summary"></div><div id="list"></div><button id="showMore" type="button" hidden>Show more</button>
            </div>
          <footer class="author-credit"><small>AUTHOR:</small><span>BAXTERCASH</span></footer></section>
          <div id="settingsPopup" hidden><section class="window settings-window" role="dialog" aria-modal="true" aria-labelledby="settingsTitle" tabindex="-1"><header><h2 id="settingsTitle">Settings</h2><button id="settingsClose" type="button" aria-label="Close settings">Done</button></header><div class="body"><form class="limits"><details class="wide"><summary>Match breakdown</summary><div id="filterBreakdown"></div></details><label class="wide">Lobby type<select id="kind"><option value="public">Public matches</option><option value="custom">Custom games</option><option value="all">Public + custom</option></select></label>
                  <label>Max players (0 = any)<div class="slider"><input type="range" data-for="maxPlayers" data-max="100" min="0" max="100" step="1" aria-label="Max players slider"><input id="maxPlayers" aria-label="Max players" type="number" min="0" max="100000" step="1" placeholder="Any"></div></label>
<section class="wide settings-section"><h3 class="section-title">Auto Switch</h3><label class="check"><input id="autoSwitch" type="checkbox"><span id="autoAction"></span></label><label class="check"><input id="allowPingFallback" type="checkbox">Allow Auto Switch without ping limit</label></section><section class="wide settings-section"><h3 class="section-title">Keybinds</h3><div class="keybind-grid"><label>Menu<div class="binding"><input id="menuKey" type="hidden"><button id="bindMenu" type="button" aria-label="Bind Menu"></button><button id="clearMenu" type="button" aria-label="Disable Menu shortcut">Off</button></div></label><label>Quick Switch<div class="binding"><input id="switchKey" type="hidden"><button id="bind" type="button" aria-label="Bind Quick Switch"></button><button id="clearBind" type="button" aria-label="Disable Quick Switch shortcut">Off</button></div></label><label>Auto Switch<div class="binding"><input id="autoKey" type="hidden"><button id="bindAuto" type="button" aria-label="Bind Auto Switch"></button><button id="clearAuto" type="button" aria-label="Disable Auto Switch shortcut">Off</button></div></label></div><p id="bindError" role="alert"></p><small>Some Windows or Glorp shortcuts may be intercepted by the client.</small></section>
                  <label class="check wide"><input id="hideButton" type="checkbox">Hide Matchmaker button until hovered</label>
                  <label class="check"><input id="differentMap" type="checkbox">Different map only for quick switch</label>
                  <label>Search duration · sec<div class="slider"><input type="range" data-for="searchDuration" data-max="30" min="1" max="30" step="1" aria-label="Search duration slider"><input id="searchDuration" type="number" min="1" max="30" step="1" aria-label="Search duration"></div></label>
                  <label>Min search time · sec<div class="slider"><input type="range" data-for="minSearchTime" data-max="10" min="0" max="10" step="1" aria-label="Min search time slider"><input id="minSearchTime" type="number" min="0" max="10" step="1" aria-label="Min search time"></div></label>
                  <label>Message size · px<div class="slider"><input type="range" data-for="messageSize" data-max="40" min="10" max="40" step="1" aria-label="Message size slider"><input id="messageSize" type="number" min="10" max="40" step="1" aria-label="Message size"></div></label>
                  <label>Message duration · sec<div class="slider"><input type="range" data-for="messageDuration" data-max="30" min="1" max="30" step="1" aria-label="Message duration slider"><input id="messageDuration" type="number" min="1" max="30" step="1" aria-label="Message duration"></div></label>
<details class="wide text-layout"><summary>Text Size &amp; Position</summary><details class="wide hud-position"><summary>Auto Switch · Size / Position</summary><div class="hud-placement"><label>Size (px)<input id="autoSize" aria-label="Auto Switch Size (px)" type="number" min="10" max="64" step="1"></label><label>Right (px)<input id="autoX" aria-label="Auto Switch Right (px)" type="number" min="0" max="3840" step="1"></label><label>Top (px)<input id="autoY" aria-label="Auto Switch Top (px)" type="number" min="0" max="2160" step="1"></label></div></details><details class="wide hud-position"><summary>Searching · Size / Position</summary><div class="hud-placement"><label>Size (px)<input id="searchSize" aria-label="Searching Size (px)" type="number" min="10" max="64" step="1"></label><label>Right (px)<input id="searchX" aria-label="Searching Right (px)" type="number" min="0" max="3840" step="1"></label><label>Top (px)<input id="searchY" aria-label="Searching Top (px)" type="number" min="0" max="2160" step="1"></label></div></details><details class="wide hud-position"><summary>Switching · Size / Position</summary><div class="hud-placement"><label>Size (px)<input id="successSize" aria-label="Switching Size (px)" type="number" min="10" max="64" step="1"></label><label>Right (px)<input id="successX" aria-label="Switching Right (px)" type="number" min="0" max="3840" step="1"></label><label>Top (px)<input id="successY" aria-label="Switching Top (px)" type="number" min="0" max="2160" step="1"></label></div></details><details class="wide hud-position"><summary>No lobby available · Size / Position</summary><div class="hud-placement"><label>Size (px)<input id="failureSize" aria-label="No lobby available Size (px)" type="number" min="10" max="64" step="1"></label><label>Right (px)<input id="failureX" aria-label="No lobby available Right (px)" type="number" min="0" max="3840" step="1"></label><label>Top (px)<input id="failureY" aria-label="No lobby available Top (px)" type="number" min="0" max="2160" step="1"></label></div></details><details class="wide hud-position"><summary>Ping warning · Size / Position</summary><div class="hud-placement"><label>Size (px)<input id="pingSize" aria-label="Ping warning Size (px)" type="number" min="10" max="64" step="1"></label><label>Right (px)<input id="pingX" aria-label="Ping warning Right (px)" type="number" min="0" max="3840" step="1"></label><label>Top (px)<input id="pingY" aria-label="Ping warning Top (px)" type="number" min="0" max="2160" step="1"></label></div></details><details class="wide hud-position"><summary>Updated · Size / Position</summary><div class="hud-placement"><label>Size (px)<input id="updatedSize" aria-label="Updated Size (px)" type="number" min="10" max="64" step="1"></label><label>Right (px)<input id="updatedX" aria-label="Updated Right (px)" type="number" min="0" max="3840" step="1"></label><label>Top (px)<input id="updatedY" aria-label="Updated Top (px)" type="number" min="0" max="2160" step="1"></label></div></details><details class="wide hud-position"><summary>Menu button · Size / Position</summary><div class="hud-placement"><label>Size (px)<input id="buttonSize" aria-label="Menu button Size (px)" type="number" min="10" max="64" step="1"></label><label>Right (px)<input id="buttonX" aria-label="Menu button Right (px)" type="number" min="0" max="3840" step="1"></label><label>Top (px)<input id="buttonY" aria-label="Menu button Top (px)" type="number" min="0" max="2160" step="1"></label></div></details></details><details class="wide text-layout"><summary>Ping diagnostics</summary><p id="pingDiagnostics" style="line-height:1.8;overflow-wrap:anywhere"></p></details><p id="settingsError" class="wide" role="alert"></p><section class="wide settings-section"><h3 class="section-title">HUD Appearance</h3><div class="hud-row"><strong>AUTO-SWITCH TEXT</strong><label>Text Color<input id="autoColor" type="color" aria-label="Auto Switch text color"></label><label>Opacity<div class="slider"><input type="range" data-for="autoOpacity" data-max="100" min="0" max="100" step="1" aria-label="auto text opacity slider"><input id="autoOpacity" type="number" min="0" max="100" step="1" aria-label="auto text opacity"><span>%</span></div></label><label>Preview<span id="autoPreview" class="hud-preview">AUTO-SWITCH</span></label></div><div class="hud-row"><strong>SEARCHING... TEXT</strong><label>Text Color<input id="searchColor" type="color" aria-label="Searching text color"></label><label>Opacity<div class="slider"><input type="range" data-for="searchOpacity" data-max="100" min="0" max="100" step="1" aria-label="search text opacity slider"><input id="searchOpacity" type="number" min="0" max="100" step="1" aria-label="search text opacity"><span>%</span></div></label><label>Preview<span id="searchPreview" class="hud-preview">SEARCHING...</span></label></div></section></form></div></section></div>
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
        for (const key of [...Object.keys(defaults), 'refresh', 'close', 'reset', 'quick', 'bind', 'clearBind', 'showMore', 'clearFilters', 'bindMenu', 'bindAuto', 'clearMenu', 'clearAuto']) controls[key] = root.querySelector(`#${key}`);
        function apply(values) {
            for (const key of Object.keys(defaults)) {
                if (typeof defaults[key] === 'boolean') controls[key].checked = values[key];
                else controls[key].value = key==='minTime' ? formatTime(Number(values[key])) : values[key];
            }
            syncSliders(); syncShortcut();

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
        syncHUD();
        try {
            const regional=JSON.parse(sessionStorage.getItem('glorp_matchmaker_region_ping_v1')||'[]');
            if(Array.isArray(regional)) for(const [region,sample] of regional.slice(0,100)) if(regionNames.has(region) && number(sample?.ms) && number(sample?.at) && freshPing(sample)) regionLatency.set(region,{ms:sample.ms,at:sample.at,source:'region HTTPS'});
            const samples = JSON.parse(sessionStorage.getItem('glorp_matchmaker_latency_v1') || '[]');
            if (Array.isArray(samples)) for (const entry of samples.slice(-100)) if (Array.isArray(entry) && validId(entry[0]) && number(entry[1]?.ms) && number(entry[1]?.at) && entry[1].ms > 0 && entry[1].ms <= 10000) latency.set(entry[0], entry[1]);

        } catch { /* optional local caches */ }
        if (window.chrome?.webview?.addEventListener) window.chrome.webview.addEventListener('message', receiveMeasuredPing);
        // Change sections synchronously. Queued native toggle events can otherwise
        // close a newly opened section while processing an older section's event.
        for (const details of root.querySelectorAll('.selector')) details.querySelector('summary').addEventListener('click', event => {
            event.preventDefault();
            const opening=!details.open;
            const body=details.closest('.body'), top=body.scrollTop;
            for (const other of root.querySelectorAll('.selector')) other.open=false;
            details.open=opening;
            body.scrollTop=Math.min(top,body.scrollHeight-body.clientHeight);
        });
        drawChoices();
        trigger.addEventListener('click', () => { if (opened) close(); else show(); });
        controls.close.addEventListener('click', close);
        controls.refresh.addEventListener('click', () => refresh());
        controls.quick.addEventListener('click', quickSwitch);
        for (const [key, bind, clear] of [['menuKey', 'bindMenu', 'clearMenu'], ['switchKey', 'bind', 'clearBind'], ['autoKey', 'bindAuto', 'clearAuto']]) {
            controls[bind].addEventListener('click', () => { if (busy) return; recordingKey = recordingKey === key ? false : key; pendingModifier = null; root.querySelector('#bindError').textContent = ''; syncShortcut(); });
            controls[clear].addEventListener('click', () => { if (busy) return; controls[key].value = ''; recordingKey = false; syncShortcut(); save(); });
        }
        controls.showMore.addEventListener('click', () => { if (busy) return; visibleLimit += LIMIT; render(); });
        controls.clearFilters.addEventListener('click', () => {
            if (busy === 'join' || busy === 'quick' || navigating) return;
            cancel(); selections.maps = []; selections.modes = []; selections.regions = [];
            apply({ ...settings, kind: 'all', minPlayers: 0, maxPlayers: '', minTime: 0, maxPing: 0 });
            save(); drawChoices(); visibleLimit = LIMIT; render();
        });
        controls.reset.addEventListener('click', () => { if (busy === 'join' || busy === 'quick') return; cancel(); selections.maps = []; selections.modes = []; selections.regions = []; apply(defaults); drawChoices(); save(); configureAutoSwitch(); render(); setStatus('Filters reset. All maps and modes included.'); });
        root.addEventListener('submit', event => { event.preventDefault(); if (event.target.id === 'mainFilters') refresh(); });
        root.addEventListener('input', event => {
            if (event.target.matches('input[type="range"]')) {
                const key=event.target.dataset.for, n=Number(event.target.value);
                controls[key].value=key==='maxPlayers' ? (playerFromSlider(n)||'') : key==='minTime' ? formatTime(n) : event.target.value;
            }
            if (event.target===controls.messageSize) for (const id of ['search','success','failure']) controls[id+'Size'].value=controls.messageSize.value;
            if (busy === 'search') cancel();
            syncSliders();
            if (event.target === controls.kind) drawChoices();
            try { filters(); root.querySelector('#settingsError').textContent = ''; save(); if (event.target === controls.autoSwitch) configureAutoSwitch(); syncToolbar(); setStatus('Filters updated. Displaying matching lobbies from this list.'); }
            catch (error) { root.querySelector('#settingsError').textContent = error.message; setStatus(error.message, true); }
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
        window.addEventListener('pagehide', () => { opened = false; cancel(); clearInterval(timer); clearTimeout(noticeTimer); clearInterval(confirmationTimer); clearTimeout(updateTimer); clearInterval(autoPollTimer); });
        ready = true;
        configureAutoSwitch();
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

