// ==UserScript==
// @name         Travian – Farmlist last-sent
// @namespace    stepanek
// @version      10.31.1
// @description  Side panel: farm list timers, what one click sends and loots, and which targets paid best.
// @match        *://*.travian.com/*
// @match        *://*.traviangames.com/*
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/MoulaCZ/travian-panel
// @supportURL   https://github.com/MoulaCZ/travian-panel/issues
// @downloadURL  https://raw.githubusercontent.com/MoulaCZ/travian-panel/main/travian-farmlist-timer.user.js
// @updateURL    https://raw.githubusercontent.com/MoulaCZ/travian-panel/main/travian-farmlist-timer.user.js
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @connect      travcotools.com
// ==/UserScript==

(function () {
    'use strict';

    console.log('[flTimer] script loaded on ' + location.host);

    // ---------- constants ----------
    const REFRESH_MS  = 60 * 1000;
    const TICK_MS     = 5 * 1000;
    const LS_SETTINGS = 'flTimer.settings.v3';
    const LS_CACHE    = 'flTimer.cache.v7';
    const LS_TOTALS   = 'flTimer.totals.v1';
    const LS_RUNS     = 'flTimer.runs.v1';
    const LS_LOOT     = 'flTimer.loot.v1';
    const LS_SPEEDS   = 'flTimer.speeds.v1';
    const LS_TRAIN    = 'flTimer.training.v2';
    const LS_VCOORDS  = 'flTimer.vcoords.v1';
    const LS_PROD     = 'flTimer.production.v1';
    const LS_UPKEEP   = 'flTimer.upkeep.v1';
    const LS_AFK      = 'flTimer.inactive.v1';
    const AFK_COOLDOWN = 60;             // seconds between searches - it is their server

    // Their server numbering, taken from the search form. Without it every player would
    // have to look up an id by hand before the panel worked once.
    const TRAVCO_SERVERS = {
        'cw.x2.international': 1442, 'cw.x5.international': 1444, 'czsk.x1.czsk': 1380,
        'eterni.x3.italy': 1456, 'garuda.x3.indonesia': 1465, 'lusobr.x2.lusobrasileiro': 1451,
        'nys.x1.asia': 1291, 'nys.x1.europe': 1256, 'rog.x1.america': 1467,
        'rog.x1.arabics': 1469, 'rog.x1.asia': 1466, 'rog.x1.europe': 1471,
        'rog.x2.international': 1468, 'schild.x3.netherlands': 1440, 'ts100.x10.international': 1457,
        'ts10.x1.europe': 1298, 'ts10.x1.international': 1349, 'ts11.x1.europe': 1452,
        'ts11.x1.international': 1460, 'ts12.x1.europe': 1462, 'ts1.x1.america': 1445,
        'ts1.x1.arabics': 1448, 'ts1.x1.asia': 1376, 'ts1.x1.europe': 1308,
        'ts1.x1.international': 1357, 'ts20.x2.europe': 1433, 'ts20.x2.international': 1450,
        'ts21.x2.arabics': 1454, 'ts2.x1.arabics': 1464, 'ts2.x1.asia': 1425,
        'ts2.x1.europe': 1353, 'ts2.x1.international': 1374, 'ts30.x3.arabics': 1470,
        'ts31.x3.america': 1449, 'ts31.x3.asia': 1458, 'ts31.x3.europe': 1443,
        'ts31.x3.international': 1439, 'ts32.x3.international': 1463, 'ts3.x1.asia': 1438,
        'ts3.x1.europe': 1366, 'ts3.x1.international': 1423, 'ts4.x1.america': 1302,
        'ts4.x1.europe': 1382, 'ts4.x1.international': 1435, 'ts50.x5.america': 1455,
        'ts5.x1.america': 1347, 'ts5.x1.arabics': 1307, 'ts5.x1.asia': 1306,
        'ts5.x1.europe': 1431, 'ts5.x1.international': 1447, 'ts6.x1.america': 1367,
        'ts6.x1.arabics': 1356, 'ts6.x1.asia': 1354, 'ts6.x1.europe': 1441,
        'ts7.x1.america': 1384, 'ts7.x1.arabics': 1370, 'ts7.x1.asia': 1453,
        'ts8.x1.america': 1432, 'ts8.x1.arabics': 1386, 'ts8.x1.international': 1300,
        'ts9.x1.america': 1461, 'ts9.x1.arabics': 1434, 'ts9.x1.international': 1346,
        'ttq.x2.america': 1427, 'ttq.x2.arabics': 1428, 'ttq.x2.asia': 1426,
        'ttq.x2.europe': 1429, 'united.x1.balkans': 1385
    };
    const TOTALS_TTL  = 300;             // seconds before the troop totals are re-read
    const RUN_TTL     = 300;             // after this the movement reading is called stale

    const UNITS = {
        1: ['Legionnaire', 'Praetorian', 'Imperian', 'Equites Legati', 'Equites Imperatoris',
            'Equites Caesaris', 'Battering Ram', 'Fire Catapult', 'Senator', 'Settler'],
        2: ['Clubswinger', 'Spearman', 'Axeman', 'Scout', 'Paladin',
            'Teutonic Knight', 'Ram', 'Catapult', 'Chief', 'Settler'],
        3: ['Phalanx', 'Swordsman', 'Pathfinder', 'Theutates Thunder', 'Druidrider',
            'Haeduan', 'Ram', 'Trebuchet', 'Chieftain', 'Settler'],
        6: ['Slave Militia', 'Ash Warden', 'Khopesh Warrior', 'Sopdu Explorer', 'Anhur Guard',
            'Resheph Chariot', 'Ram', 'Stone Catapult', 'Nomarch', 'Settler'],
        7: ['Mercenary', 'Bowman', 'Spotter', 'Steppe Rider', 'Marksman',
            'Marauder', 'Ram', 'Catapult', 'Logades', 'Settler']
    };
    const unitName = (tribe, n) => (UNITS[tribe] && UNITS[tribe][n - 1]) || ('t' + n);

    // ---------- storage ----------
    const load = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
    const save = (k, v)   => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

    const settings = Object.assign({
        hidden: [], hiddenVillages: [], perList: {},
        win: {}, help: {}, trainWarn: 30, flyUnits: null, flyTo: '',
        travcoServer: '', travcoLearned: '', travcoFixed: 0, afkDays: 1, afkPages: 10, afkDist: 20, afkPop: '', afkKnown: false,
        tsPct: {},
        afkNatars: true, afkCapital: '',
        warnMin: 20, alertMin: 30,
        notify: false, sound: false, notified: [], tabAlert: true
    }, load(LS_SETTINGS, {}));
    const persist = () => save(LS_SETTINGS, settings);

    // Which list has its "?" open. Kept in settings so a page reload does not close it.
    let openInfo = settings.openInfo || 0;

    // Total troops owned per village. The farm list page only reports troops at home,
    // so the interval needs this second page — read lazily when a "?" is opened.
    let totals = load(LS_TOTALS, null);
    let loadingTotals = false;

    // Troop movements for the active village, read on demand (and right after a list is
    // sent). Kept in memory only — they go stale within minutes.
    // Biggest hauls, read from the report list on demand. One GET, never on a timer.
    let loot = load(LS_LOOT, null);   // { at, rows: [{name, best, bestAt, last, lastGot, raids, href, capped}] }
    let loadingLoot = false;
    let lootError = null;

    // Unit speeds are game constants, so they are learned once and kept. Recomputing
    // them from whatever happens to be in flight made every derived number jitter.
    let speedStore = load(LS_SPEEDS, {});   // tribe -> unit id -> fields per hour

    // Training queues for every village at once, read on demand.
    let vcoords = load(LS_VCOORDS, null);  // village id -> { name, x, y }
    let training = load(LS_TRAIN, null);   // { at, rows: [...] }
    let loadingTrain = false;
    let trainError = null;

    // Production per village, and what the troops of a village eat. The second one cannot
    // be read for every village at once - the game only states it for the village you have
    // open - so it is picked up quietly from whatever page the player is already on.
    let prod = load(LS_PROD, null);        // { at, villages: [{ id, name, r: [w,c,i,crop] }] }
    let loadingProd = false;
    let prodError = null;
    let upkeep = load(LS_UPKEEP, {});      // village id -> { crop, at }

    // Inactive players, read from travcotools.com. Their pages are the only thing here
    // that is not the game itself, so it happens on a button press and never on a timer.
    let afk = load(LS_AFK, null);          // { at, rows: [...] }
    let loadingAfk = false;
    let afkError = null;
    let afkPage = 0;

    let runs = load(LS_RUNS, {});   // villageId -> { at, events: [{at, troop}], seen, skipped, declared, trained }
    let loadingRun = false;

    // ---------- helpers ----------
    const addTroop = (dst, src, mult) => {
        for (let n = 1; n <= 10; n++) {
            const k = 't' + n;
            const v = (src && src[k]) || 0;
            if (v) dst[k] = (dst[k] || 0) + v * (mult || 1);
        }
        return dst;
    };

    function fmtElapsed(sec) {
        if (sec < 0) sec = 0;
        const d = Math.floor(sec / 86400);
        const h = Math.floor((sec % 86400) / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        if (d) return d + 'd ' + h + 'h ' + m + 'm';
        if (h) return h + 'h ' + m + 'm';
        if (m) return m + 'm ' + s + 's';
        return s + 's';
    }

    const fmtDur = sec => {
        const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
        return h ? h + 'h ' + m + 'm' : Math.max(1, m) + 'm';
    };
    // Queue times read as a clock, not as prose: 2:31 instead of 2h 31m.
    const fmtHM = sec => {
        let m = Math.round(Math.max(0, sec) / 60);
        const h = Math.floor(m / 60);
        return h + ':' + (m - h * 60 < 10 ? '0' : '') + (m - h * 60);
    };
    const num = v => Number(plain(v).replace(/\u2212/g, '-').replace(/[^\d-]/g, '')) || 0;
    const clockAt = ts => new Date(ts * 1000)
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const fmtNum = n => Math.round(n).toLocaleString();
    // A day's worth of resources does not fit a 224 px panel in full.
    const fmtShort = n => {
        const a = Math.abs(n);
        if (a < 10000) return fmtNum(n);
        if (a < 1000000) return (n / 1000).toFixed(a < 100000 ? 1 : 0) + 'k';
        return (n / 1000000).toFixed(1) + 'M';
    };
    const fmtAbs = ts => ts ? new Date(ts * 1000).toLocaleString() : 'never';
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // ---------- page parsing ----------
    function sliceBalanced(text, startIdx) {
        const open = text[startIdx];
        const close = open === '[' ? ']' : '}';
        let depth = 0, inStr = false, esc2 = false;
        for (let i = startIdx; i < text.length; i++) {
            const c = text[i];
            if (inStr) {
                if (esc2) esc2 = false;
                else if (c === '\\') esc2 = true;
                else if (c === '"') inStr = false;
                continue;
            }
            if (c === '"') { inStr = true; continue; }
            if (c === open) depth++;
            else if (c === close) { depth--; if (depth === 0) return text.slice(startIdx, i + 1); }
        }
        return null;
    }

    function parseGame(text) {
        const fi = text.indexOf('"farmLists":[');
        if (fi === -1) return null;

        const raw = sliceBalanced(text, text.indexOf('[', fi));
        if (!raw) return null;

        let lists;
        try { lists = JSON.parse(raw); } catch { return null; }

        const villages = {};
        const vi = text.lastIndexOf('"villages":[', fi);
        if (vi !== -1) {
            try {
                (JSON.parse(sliceBalanced(text, text.indexOf('[', vi))) || [])
                    .forEach(v => { villages[v.id] = { name: v.name, tribe: v.tribeId }; });
            } catch {}
        }

        const m = text.match(/Travian\.Game\.timestamp\s*=\s*(\d+)/);
        const serverTime = m ? Number(m[1]) : Math.floor(Date.now() / 1000);

        const avs = text.slice(0, fi).match(/"village":\{"id":(\d+)/g);
        const activeVillage = avs ? Number(avs[avs.length - 1].replace(/\D/g, '')) : 0;

        return {
            serverTime,
            activeVillage,
            localTime: Math.floor(Date.now() / 1000),
            lists: lists.map(l => {
                const vid = l.ownerVillage && l.ownerVillage.id;
                const v = villages[vid] || {};
                const states = l.slotsStates || [];
                const slots = l.slots || [];
                const started = l.lastStartedTime || 0;

                const need = {};
                const slotsInfo = [];
                const targets = [];
                let exact = false;

                if (slots.length) {
                    exact = true;
                    for (const s of slots) {
                        if (!s.isActive) continue;
                        const troop = addTroop({}, s.troop, 1);
                        addTroop(need, troop, 1);
                        if (!Object.keys(troop).length) continue;
                        const tg = s.target;
                        if (tg && tg.mapId) targets.push({ mapId: tg.mapId, x: tg.x, y: tg.y, dist: s.distance || 0 });
                        const tb = s.totalBooty || {};
                        slotsInfo.push({
                            troop,
                            name: (tg && tg.name) || '',
                            dist: s.distance || 0,
                            // A slot in the air pins its own flight time exactly: it left at
                            // lastStartedTime and lands at nextAttackAt.
                            fly: (s.isRunning && s.nextAttackAt && started && s.nextAttackAt > started)
                                ? s.nextAttackAt - started : 0,
                            // Average haul this target has actually produced.
                            avg: (tb.raids > 0) ? tb.booty / tb.raids : null,
                            // The game does split the booty - not in the total, but in the
                            // last raid of every target. That is where the per resource
                            // share comes from.
                            split: (s.lastRaid && s.lastRaid.raidedResources)
                                ? [s.lastRaid.raidedResources.lumber || 0,
                                   s.lastRaid.raidedResources.clay || 0,
                                   s.lastRaid.raidedResources.iron || 0,
                                   s.lastRaid.raidedResources.crop || 0]
                                : null
                        });
                    }
                } else {
                    const active = states.filter(s => s.isActive).length || (l.slotsAmount || 0);
                    addTroop(need, l.defaultTroop, active);
                }

                return {
                    id: l.id,
                    name: l.name,
                    last: started,
                    running: l.runningRaidsAmount || 0,
                    slots: l.slotsAmount || 0,
                    activeSlots: states.filter(s => s.isActive).length || (l.slotsAmount || 0),
                    villageId: vid,
                    village: v.name || '',
                    tribe: v.tribe || 0,
                    need, exact, slotsInfo, targets,
                    home: (l.ownerVillage && l.ownerVillage.troops &&
                           l.ownerVillage.troops.ownTroopsAtTown &&
                           l.ownerVillage.troops.ownTroopsAtTown.units) || {}
                };
            })
        };
    }

    // Coordinates ride along on any page that renders the village list, so they are
    // picked up wherever they appear rather than fetched for their own sake.
    function learnCoords(text) {
        const c = parseVillageCoords(text);
        if (c) { vcoords = c; save(LS_VCOORDS, vcoords); }
    }

    async function fetchData() {
        const res = await fetch('/build.php?gid=16&tt=99', { credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        learnCoords(text);
        const data = parseGame(text);
        if (!data) throw new Error('farmLists not found');
        return data;
    }

    // Every list of villages in the panels goes through this, so they all read in the
    // order the player sees in the game.
    function villagesInOrder() {
        if (!vcoords) return [];
        return Object.keys(vcoords).map(id => ({
            id: Number(id), name: vcoords[id].name, x: vcoords[id].x, y: vcoords[id].y,
            i: vcoords[id].i == null ? 1e9 : vcoords[id].i
        })).sort((a, b) => (a.i - b.i) || String(a.name).localeCompare(String(b.name)));
    }

    const villageRank = id => {
        const v = vcoords && vcoords[id];
        return v && v.i != null ? v.i : 1e9;
    };

    // ---------- village coordinates ----------
    // Every page renders the village list with x/y, which is the only place the game
    // states where the player's own villages are. Kept so travel time works anywhere.
    function parseVillageCoords(text) {
        const i = text.indexOf('"villageList":[');
        if (i === -1) return null;
        const raw = sliceBalanced(text, text.indexOf('[', i));
        if (!raw) return null;
        let arr;
        try { arr = JSON.parse(raw); } catch { return null; }
        const out = {};
        // The order matters: the game lists villages by group and by its own sorting, while
        // an object keyed by village id would come back out sorted by number. So each
        // village remembers where it stood in the game's own list.
        let n = 0;
        const walk = xs => {
            for (const v of xs || []) {
                if (v && v.villages) walk(v.villages);
                else if (v && v.id && typeof v.x === 'number') {
                    out[v.id] = { name: v.name, x: v.x, y: v.y, i: n++ };
                }
            }
        };
        walk(arr);
        return Object.keys(out).length ? out : null;
    }

    // ---------- total troops owned ----------
    // /village/statistics/troops/own is one table for every village: a td.villageName
    // followed by 11 cells (t1..t10 plus the hero). The header uses th and the totals
    // row uses td.vil, so both fall out on their own. Villages are matched by name —
    // the table carries no village id.
    function parseTotals(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const by = {};
        for (const tr of doc.querySelectorAll('tr')) {
            const nameCell = tr.querySelector('td.villageName');
            if (!nameCell) continue;
            const name = nameCell.textContent.trim();
            const cells = Array.prototype.slice.call(tr.children, 1);
            const units = {};
            for (let i = 0; i < 10 && i < cells.length; i++) {
                const v = parseInt(cells[i].textContent.replace(/\D/g, ''), 10) || 0;
                if (v) units['t' + (i + 1)] = v;
            }
            if (name && Object.keys(units).length) by[name] = units;
        }
        return by;
    }

    async function ensureTotals() {
        if (loadingTotals) return;
        const now = Math.floor(Date.now() / 1000);
        if (totals && now - totals.fetchedAt < TOTALS_TTL) return;
        loadingTotals = true;
        try {
            const res = await fetch('/village/statistics/troops/own', { credentials: 'same-origin' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const by = parseTotals(await res.text());
            if (Object.keys(by).length) {
                totals = { fetchedAt: now, by };
                save(LS_TOTALS, totals);
                console.log('[flTimer] troop totals read for ' + Object.keys(by).length + ' village(s)');
            }
        } catch (e) {
            console.error('[flTimer] reading troop totals failed:', e);
        }
        loadingTotals = false;
        render();
    }

    const totalsFor = name => (totals && totals.by && totals.by[name]) || null;

    // ---------- map geometry ----------
    // Targets are only identified by a karte.php map id, so coordinates have to come
    // from it. The map width is derived from the farm list's own (mapId, x, y) triples
    // rather than assumed, and the result is checked against the distances the game
    // itself reports. The map wraps around, so 136 and -196 are 69 fields apart, not 332.
    function deriveMap(lists) {
        const pts = [];
        for (const l of lists) for (const t of l.targets) pts.push(t);
        for (let i = 0; i < pts.length && i < 40; i++) {
            for (let j = i + 1; j < pts.length && j < 40; j++) {
                if (pts[i].y === pts[j].y) continue;
                const w = (pts[i].mapId - pts[j].mapId - pts[i].x + pts[j].x) / (pts[j].y - pts[i].y);
                if (!Number.isInteger(w) || w < 51 || w > 2001 || w % 2 === 0) continue;
                const off = (w - 1) / 2;
                const ok = pts.every(t => ((t.mapId - 1) % w) - off === t.x &&
                                          off - Math.floor((t.mapId - 1) / w) === t.y);
                if (ok) return { w, off };
            }
        }
        return null;
    }

    const coordsOf = (mapId, m) => ({ x: ((mapId - 1) % m.w) - m.off, y: m.off - Math.floor((mapId - 1) / m.w) });

    function mapDist(a, b, m) {
        let dx = Math.abs(a.x - b.x); dx = Math.min(dx, m.w - dx);
        let dy = Math.abs(a.y - b.y); dy = Math.min(dy, m.w - dy);
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Every return table carries a one-way travel time per unit type in its icon
    // tooltips ("Ash Warden: 1:48:10"). With the route length that gives fields/hour for
    // all ten units at once, including ones never seen flying from a farm list.
    function speedsFromReturns(html, m) {
        const sp = {};
        if (!m) return sp;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        for (const tbl of doc.querySelectorAll('table.troop_details')) {
            if (String(tbl.className).indexOf('inReturn') === -1) continue;
            const src = mapIdFrom(tbl.querySelector('.role'));
            const dst = mapIdFrom(tbl.querySelector('.troopHeadline'));
            if (!src || !dst) continue;
            const dist = mapDist(coordsOf(src, m), coordsOf(dst, m), m);
            if (!dist) continue;
            for (const img of tbl.querySelectorAll('img.unit[title]')) {
                const um = String(img.className).match(/\bu(\d+)\b/);
                // Close targets are written mm:ss, distant ones h:mm:ss.
                const tm = img.getAttribute('title').match(/(\d{1,3}(?::\d{2}){1,2})\s*$/);
                if (!um || !tm) continue;
                const parts = tm[1].split(':').map(Number);
                const sec = parts.length === 3
                    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
                    : parts[0] * 60 + parts[1];
                if (!sec || dist > TS_MIN) continue;      // bonus would inflate the speed
                sp[((Number(um[1]) - 1) % 10) + 1] = dist * 3600 / sec;
            }
            if (Object.keys(sp).length >= 10) break;
        }
        return sp;
    }

    // ---------- raid reports ----------
    // The report list is the only place that says how much a raid actually brought home.
    // Row times render in the PLAYER's time zone, which need not be the server's (here the
    // sidebar reads UTC+1 while the rows are written in UTC+2), so the epoch and the offset
    // are both taken from the very page the rows came from.
    function reportClock(html) {
        const ts = html.match(/Travian\.Game\.timestamp\s*=\s*(\d+)/);
        if (!ts) return null;
        const tz = html.match(/Travian\.Game\.timezoneOffsetToUTC\s*=\s*(-?\d+)/);
        const now = Number(ts[1]);
        const shifted = now - Number(tz ? tz[1] : 0);
        const d = new Date(shifted * 1000);
        return {
            now,
            midnight: now - (((shifted % 86400) + 86400) % 86400),
            todayUTC: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
        };
    }

    const CTRL = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
    const plain = v => String(v == null ? '' : v).replace(CTRL, '').replace(/\s+/g, ' ').trim();

    // "today, 15:40" or "03.09.26, 23:58" -> epoch. Whole days only: an hour of DST drift
    // on a report days old changes nothing anyone would act on.
    function rowTime(txt, clock) {
        const s = plain(txt);
        const hm = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/);
        if (!hm) return null;
        const sec = Number(hm[1]) * 3600 + Number(hm[2]) * 60 + Number(hm[3] || 0);
        const dm = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
        if (dm) {
            const y = Number(dm[3]) < 100 ? 2000 + Number(dm[3]) : Number(dm[3]);
            const day = Date.UTC(y, Number(dm[2]) - 1, Number(dm[1]));
            return clock.midnight - Math.round((clock.todayUTC - day) / 86400000) * 86400 + sec;
        }
        const t = clock.midnight + sec;
        return t > clock.now + 300 ? t - 86400 : t;   // an unrecognised "yesterday"
    }

    // "0. Main raids Someone`s village" -> "Someone`s village". Falls back to stripping a
    // known own-village prefix, so a village actually named ":D :D :D :D :D" survives.
    const VERB = /\s(?:raid(?:s|ed)?|attack(?:s|ed)?|scout(?:s|ed)?)\s+(?:an?\s+)?/i;
    function targetOf(subject, mine) {
        const s = plain(subject);
        const m = s.match(VERB);
        if (m) return s.slice(m.index + m[0].length);
        for (const v of mine) if (v && s.indexOf(v + ' ') === 0) return s.slice(v.length + 1);
        return s;
    }

    function parseReports(html, mine) {
        const clock = reportClock(html);
        if (!clock) throw new Error('no server clock on the report page');
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const by = new Map();

        let sum = 0, n = 0, first = 0, last = 0;

        for (const tr of doc.querySelectorAll('table.row_table_data tbody tr')) {
            // No carry icon means nothing came home: a scouting run, a loss, an empty oasis.
            const carry = tr.querySelector('img.carry[title]');
            // The subject sits in its own div; the bare anchors in td.sub are the
            // read/unread toggle and the booty icon, whose href also carries an id.
            const link = tr.querySelector('td.sub div a[href]');
            const dat = tr.querySelector('td.dat');
            if (!carry || !link || !dat) continue;
            const cm = plain(carry.getAttribute('title')).match(/^(\d+)\s*\/\s*(\d+)$/);
            const when = rowTime(dat.textContent, clock);
            if (!cm || when == null) continue;
            const got = Number(cm[1]);
            if (!got) continue;

            const name = targetOf(link.textContent, mine);
            const e = by.get(name) ||
                { name, best: 0, bestAt: 0, last: 0, lastGot: 0, raids: 0, href: '', capped: false };
            e.raids++;
            if (got > e.best) {
                e.best = got;
                e.bestAt = when;
                // A full bar means the troops hit their carry limit, so more was left behind.
                e.capped = /(^|\s)full(\s|$)/.test(carry.className);
                e.href = link.getAttribute('href') || '';
            }
            if (when > e.last) { e.last = when; e.lastGot = got; }
            by.set(name, e);

            // The same rows also say how much came in and over what stretch of time, which
            // is the only measured raid income there is - the farm list only shows totals
            // since it was created.
            sum += got;
            n++;
            if (!first || when < first) first = when;
            if (when > last) last = when;
        }

        return { at: clock.now, sum, n, from: first, to: last, mid: clock.midnight,
                 rows: Array.from(by.values()).sort((a, b) => b.best - a.best) };
    }

    async function loadLoot() {
        if (loadingLoot) return;
        loadingLoot = true;
        lootError = null;
        render();
        try {
            const r = await fetch('/report/offensive?page=1', { credentials: 'same-origin' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const mine = cache
                ? Array.from(new Set(cache.lists.map(l => l.village).filter(Boolean)))
                : [];
            loot = parseReports(await r.text(), mine);
            save(LS_LOOT, loot);
            console.log('[flTimer] reports: ' + loot.rows.length + ' target(s) with booty');
        } catch (e) {
            lootError = e.message;
            console.error('[flTimer] reading reports failed:', e);
        }
        loadingLoot = false;
        render();
    }

    // ---------- troop movements ----------
    // Same table shape as the rally point overview: a modifier class says the direction,
    // the counts sit in the LAST units row as positional td.unit cells, and the arrival
    // countdown is a .timer[value] in seconds.
    const mapIdFrom = el => {
        const a = el && el.querySelector('a[href*="karte.php?d="]');
        const m = a && a.getAttribute('href').match(/d=(\d+)/);
        return m ? Number(m[1]) : 0;
    };

    // Walks the page in document order so each movement is attributed to the heading it
    // sits under. That heading's number is the true total for that section even when the
    // page renders only the first N, so "read 99 of 2000" stays honest no matter which
    // sections a filtered page happens to include.
    function parseMovements(html, want) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const root = doc.querySelector('.rallyPointOverviewContainer') || doc.querySelector('#content') || doc.body;
        const items = [];
        let declared = 0, rendered = 0;
        let sectionTotal = 0, sectionTables = 0, sectionUsed = false;

        for (const el of root.querySelectorAll('h4, table.troop_details')) {
            if (el.tagName === 'H4') {
                if (sectionUsed) { declared += sectionTotal; rendered += sectionTables; }
                const c = el.textContent.match(/\((\d+)\)/);
                sectionTotal = c ? Number(c[1]) : 0;
                sectionTables = 0;
                sectionUsed = false;
                continue;
            }
            sectionTables++;

            // Only troops that actually come home. Reinforcements sent to another
            // village stay there, and settlers never return, so neither may be counted
            // as a future arrival.
            const cls = ' ' + String(el.className || '').trim() + ' ';
            const dir = cls.indexOf(' inReturn ') !== -1 ? 'back'
                      : (cls.indexOf(' outRaid ') !== -1 || cls.indexOf(' outAttack ') !== -1) ? 'out'
                      : null;
            if (dir !== want) continue;

            const row = el.querySelector('tbody.units.last tr');
            const timer = el.querySelector('.timer[value]');
            if (!row || !timer) continue;
            const sec = Number(timer.getAttribute('value'));
            if (!isFinite(sec)) continue;

            const cells = row.querySelectorAll('td.unit');
            const troop = {};
            for (let i = 0; i < 10 && i < cells.length; i++) {
                const v = parseInt(cells[i].textContent.replace(/\D/g, ''), 10) || 0;
                if (v) troop['t' + (i + 1)] = v;
            }
            if (!Object.keys(troop).length) continue;

            items.push({
                sec, troop,
                src: mapIdFrom(el.querySelector('.role')),
                dst: mapIdFrom(el.querySelector('.troopHeadline'))
            });
            sectionUsed = true;
        }
        if (sectionUsed) { declared += sectionTotal; rendered += sectionTables; }
        // declared counts every movement in the section, including other players'
        // attacks; rendered is what the page actually printed. Only a gap between those
        // two means the page truncated anything.
        return { items, declared, rendered };
    }

    // ---------- speeds & per-click maths ----------
    // Unit speed is measured from the player's own raids in flight, never assumed:
    // a running slot gives distance and flight time, so fields/hour falls out.
    // A slot still in the air from an EARLIER wave reports its arrival against the newest
    // lastStartedTime, so the implied flight is too short and the implied speed too high.
    // Every error is one-sided, which makes the slowest reading the trustworthy one — and
    // it is kept, so a unit that happens to have nothing in flight right now does not
    // silently drop out of the maths.
    function learnSpeed(tribe, unit, v, authoritative) {
        if (!(v > 0) || !isFinite(v)) return false;
        // Unit speeds are whole fields per hour; a measurement lands just off one only
        // because the game rounds arrival to the second. Snapping removes a drift that
        // would otherwise grow to minutes on a long flight, and can never move the value
        // by more than the 2% it was already uncertain by.
        const whole = Math.round(v);
        if (whole > 0 && Math.abs(v - whole) / whole < 0.02) v = whole;
        const t = String(tribe || 0);
        const box = speedStore[t] || (speedStore[t] = {});
        const cur = box[unit];
        if (authoritative || cur == null || v < cur) { box[unit] = v; return true; }
        return false;
    }

    function learnFromLists(lists) {
        let changed = false;
        for (const l of lists) {
            for (const sl of l.slotsInfo) {
                // Past twenty fields the flight carries the Tournament Square bonus, so it
                // no longer says what the unit itself does. Such a flight teaches nothing.
                if (!sl.fly || !sl.dist || sl.dist > TS_MIN) continue;
                const keys = Object.keys(sl.troop);
                if (keys.length !== 1) continue;      // a mixed slot moves at its slowest unit
                if (learnSpeed(l.tribe, Number(keys[0].slice(1)), sl.dist * 3600 / sl.fly, false)) {
                    changed = true;
                }
            }
        }
        if (changed) save(LS_SPEEDS, speedStore);
    }

    // Fields per hour, straight from the game's own unit tables, in the order the game
    // numbers them (t1..t10). These are constants of the game, unlike a flight time, which
    // is one measurement of one wave and can be thrown off by a wave that left earlier.
    const UNIT_SPEED = {
        1: [6, 5, 7, 16, 14, 10, 4, 3, 4, 5],       // Romans
        2: [7, 7, 6, 9, 10, 9, 4, 3, 4, 5],         // Teutons
        3: [7, 6, 17, 19, 16, 13, 4, 3, 5, 5],      // Gauls
        6: [7, 6, 7, 16, 15, 10, 4, 3, 4, 5],       // Egyptians
        7: [7, 6, 19, 16, 15, 14, 4, 3, 5, 5]       // Huns
    };

    // A speed world multiplies troop speed by its own factor, and the factor is in the
    // address of the world: ts11.x1.international -> 1, cw.x5.international -> 5.
    const worldSpeed = () => {
        const m = String(location.host).match(/\.x(\d+)\./);
        const n = m ? Number(m[1]) : 1;
        return n > 0 && n <= 100 ? n : 1;
    };

    function baseSpeed(tribe, unit) {
        const row = UNIT_SPEED[Number(tribe)];
        return row && row[unit - 1] ? row[unit - 1] * worldSpeed() : 0;
    }

    // The table decides. A measured flight only wins when it is FASTER, because that is
    // something the game can really do (an item or an artefact), while a slower reading is
    // always an artefact of the measurement itself.
    function speedsFor(tribe) {
        const meas = speedStore[String(tribe || 0)] || {};
        const out = {};
        for (let u = 1; u <= 10; u++) {
            const table = baseSpeed(tribe, u);
            const m = meas[u];
            if (table && m > table * 1.05) out[u] = m;
            else if (table) out[u] = table;
            else if (m) out[u] = m;
        }
        return out;
    }

    // Where a measurement and the table disagree, so the panel can say so instead of
    // quietly preferring one of them.
    function speedNotes(tribe) {
        const meas = speedStore[String(tribe || 0)] || {};
        const out = [];
        for (let u = 1; u <= 10; u++) {
            const table = baseSpeed(tribe, u), m = meas[u];
            if (!table || !m) continue;
            if (Math.abs(m - table) / table > 0.05) {
                out.push(unitName(tribe, u) + ' measured ' + m.toFixed(1) + ' vs ' + table +
                         ' in the table');
            }
        }
        return out;
    }

    // A Tournament Square speeds troops up, but only for the part of the journey past
    // twenty fields. The game prints the resulting percentage on the building, so that
    // number is what the settings ask for - no per level table to get wrong.
    const TS_MIN = 20;

    function flyTime(dist, speed, pct) {
        if (!speed) return null;
        const p = Number(pct) || 100;
        if (!(dist > TS_MIN) || p <= 100) return dist * 3600 / speed;
        return TS_MIN * 3600 / speed + (dist - TS_MIN) * 3600 / (speed * p / 100);
    }

    const tsPct = vid => Number((settings.tsPct || {})[vid]) || 100;

    function oneWay(s, speeds, pct) {
        if (s.fly) return s.fly;
        if (!s.dist) return null;
        let slowest = Infinity;
        for (const k of Object.keys(s.troop)) {
            const v = speeds[Number(k.slice(1))];
            if (!v) return null;
            if (v < slowest) slowest = v;
        }
        return isFinite(slowest) ? flyTime(s.dist, slowest, pct) : null;
    }

    // What one press of "start" sends, brings, and ties up.
    // cost[t] is unit-seconds: troops multiplied by how long they are away. Divided by
    // the units owned it gives the shortest interval that still fills every wave.
    function listStats(l, speeds) {
        const pct = tsPct(l.villageId);
        const cost = {};
        const loot4 = [0, 0, 0, 0];
        let loot = 0, lootKnown = 0, lootPlain = 0, maxRt = 0, noSpeed = 0;
        for (const s of l.slotsInfo) {
            if (s.avg != null) {
                loot += s.avg;
                lootKnown++;
                // Size of the haul comes from the long run average, the split from the last
                // raid: one raid is a poor measure of how much, but a fine measure of what.
                const r = s.split;
                const t = r ? r[0] + r[1] + r[2] + r[3] : 0;
                if (t > 0) for (let i = 0; i < 4; i++) loot4[i] += s.avg * r[i] / t;
                else lootPlain += s.avg;
            }
            const ow = oneWay(s, speeds, pct);
            if (ow == null) { noSpeed++; continue; }
            const rt = 2 * ow;
            if (rt > maxRt) maxRt = rt;
            for (const k of Object.keys(s.troop)) cost[k] = (cost[k] || 0) + s.troop[k] * rt;
        }
        return { cost, loot, loot4, lootPlain, lootKnown, maxRt, noSpeed, slots: l.slotsInfo.length };
    }

    // Shortest interval that still fills every wave, given how many units are owned.
    // null while the total is unknown — the farm list only reports troops at home.
    function interval(stats, total) {
        if (!total) return null;
        let worst = 0, limit = null;
        for (const k of Object.keys(stats.cost)) {
            const n = total[k] || 0;
            if (!n) return { missing: k };
            const sec = stats.cost[k] / n;
            if (sec > worst) { worst = sec; limit = k; }
        }
        return worst ? { sec: worst, limit } : null;
    }

    // Lists of one village draw on the same troops, so their costs add up: this is the
    // interval that actually matters when a village runs more than one list.
    function villageCost(villageId, speeds) {
        const cost = {};
        let lists = 0, collapsed = 0;
        for (const l of cache.lists) {
            if (l.villageId !== villageId || !visible(l)) continue;
            lists++;
            // A collapsed list exposes no slots, so it would contribute nothing and make
            // the combined figure look better than it is.
            if (!l.exact) { collapsed++; continue; }
            const st = listStats(l, speeds);
            for (const k of Object.keys(st.cost)) cost[k] = (cost[k] || 0) + st.cost[k];
        }
        return { cost, lists, collapsed };
    }

    // ---------- training queues ----------
    // /village/statistics/overview lists what every village is training in one request,
    // with no village switching. It gives counts and unit types but no finishing times —
    // those live on each village's own barracks page.
    const TRAIN_BUILDING = { 19: 'Barracks', 20: 'Stable', 21: 'Workshop',
                             29: 'Great barracks', 30: 'Great stable' };

    function parseTrainingOverview(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const table = doc.querySelector('table.under_progress');
        if (!table) return null;

        // The header says which building each column belongs to; the class carries the id
        // and the title the name, so neither has to be guessed from the order.
        const cols = [];
        for (const i of table.querySelectorAll('thead th.unit i')) {
            const m = String(i.className).match(/type(\d+)/);
            cols.push({ gid: m ? Number(m[1]) : 0, name: plain(i.getAttribute('title')) });
        }
        if (!cols.length) return null;

        const villages = [];
        for (const tr of table.querySelectorAll('tbody tr')) {
            const link = tr.querySelector('td.villageName a[href*="newdid="]');
            if (!link) continue;
            const vm = link.getAttribute('href').match(/newdid=(\d+)/);
            if (!vm) continue;

            const q = {};
            const cells = Array.prototype.slice.call(tr.children, 1);
            for (let i = 0; i < cells.length && i < cols.length; i++) {
                const dur = cells[i].querySelector('span.duration');
                if (dur) {
                    const parts = plain(dur.textContent).split(':').map(Number);
                    if (parts.length === 3) q[cols[i].gid] = parts[0] * 3600 + parts[1] * 60 + parts[2];
                    else if (parts.length === 2) q[cols[i].gid] = parts[0] * 60 + parts[1];
                } else if (cells[i].querySelector('span.dot')) {
                    q[cols[i].gid] = 0;                  // building there, queue empty
                }                                        // nothing at all: not built
            }
            villages.push({ id: Number(vm[1]), name: plain(link.textContent), q });
        }
        return villages.length ? { cols, villages } : null;
    }

    // The number the game prints for crop in this table is production less the upkeep of
    // the buildings - NOT less what the troops eat. That part is only ever stated for the
    // village currently open, which is why learnCrop() exists.
    function parseProduction(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const table = doc.querySelector('table#production');
        if (!table) return null;

        const villages = [];
        for (const tr of table.querySelectorAll('tbody tr')) {
            const a = tr.querySelector('td.vil a[href*="newdid="]');
            if (!a) continue;                       // the sum row has no link
            const m = a.getAttribute('href').match(/newdid=(\d+)/);
            if (!m) continue;
            const cell = c => {
                const td = tr.querySelector('td.' + c);
                return td ? num(td.textContent) : 0;
            };
            villages.push({ id: Number(m[1]), name: plain(a.textContent),
                            r: [cell('lum'), cell('clay'), cell('iron'), cell('crop')] });
        }
        return villages.length ? villages : null;
    }

    async function loadProduction() {
        if (loadingProd) return;
        loadingProd = true;
        prodError = null;
        render();
        try {
            const r = await fetch('/village/statistics/resources/production', { credentials: 'same-origin' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const villages = parseProduction(await r.text());
            if (!villages) throw new Error('production table not found');
            prod = { at: serverNow(), villages };
            save(LS_PROD, prod);
            console.log('[flTimer] production: ' + villages.length + ' village(s)');
        } catch (e) {
            prodError = e.message;
            console.error('[flTimer] reading production failed:', e);
        }
        loadingProd = false;
        render();
    }

    // Every game page carries both crop numbers for the village that is open: the stock bar
    // title says production less buildings, and the inline resources block says what the
    // granary actually gains. The difference is what the troops of that village eat, and it
    // is the one figure no page states for all villages at once. So it is read from the page
    // the player opened anyway - no request, no village switching.
    function learnCrop() {
        const active = document.querySelector('.listEntry.village.active');
        const vid = active && Number(active.dataset.did);
        if (!vid) return;

        const m = document.documentElement.innerHTML
            .match(/var\s+resources\s*=\s*\{\s*production:\s*(\{[^}]*\})/);
        if (!m) return;
        let net;
        try { net = JSON.parse(m[1]).l4; } catch { return; }
        if (typeof net !== 'number') return;

        const bar = document.querySelector('.stockBarButton.resource4');
        const title = bar && bar.getAttribute('title');
        // "Crop||<whatever the language calls it>: 2337<br />..." - the label is not read,
        // only the first number after it, so this survives a different language.
        const g = title && plain(title).match(/\|\|[^:]*:\s*(-?[\d.,\u2212]+)/);
        if (!g) return;

        upkeep[vid] = { crop: num(g[1]) - net, at: serverNow() };
        save(LS_UPKEEP, upkeep);
    }

    // Tampermonkey is what makes a request to another site possible at all; a plain fetch
    // would be refused by the browser.
    function gmGet(url) {
        return new Promise((res, rej) => {
            const fn = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest
                     : (typeof GM !== 'undefined' && GM && GM.xmlHttpRequest) ? GM.xmlHttpRequest : null;
            if (!fn) { rej(new Error('Tampermonkey did not grant GM_xmlhttpRequest - reinstall the script')); return; }
            fn({
                method: 'GET', url, timeout: 25000,
                onload: r => (r.status >= 200 && r.status < 300)
                    ? res(r.responseText) : rej(new Error('HTTP ' + r.status)),
                onerror: () => rej(new Error('network error')),
                ontimeout: () => rej(new Error('timed out'))
            });
        });
    }

    function parseInactive(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const rows = [];
        for (const tr of doc.querySelectorAll('tr[id^="village-row-"]')) {
            const link = tr.querySelector('a.js-travian_village_url');
            if (!link) continue;
            const cells = tr.children;
            const vcell = link.parentElement;
            const coords = plain(vcell.textContent).match(/\[\s*(-?\d+)\s*\|\s*(-?\d+)\s*\]/);
            if (!coords) continue;
            const m = (link.getAttribute('href') || '').match(/[?&]d=(\d+)/);
            const player = tr.querySelector('a.detail-button');
            // The village cell prints the village population after the coordinates.
            const after = plain(vcell.textContent).split(']').pop();
            // In the raw page the full name sits in title=; data-original-title only appears
            // once their tooltip script has run, which it never does here. The link text is
            // the last resort and is cut short with an ellipsis, so the coordinates and the
            // ellipsis have to come off it.
            const full = plain(link.getAttribute('title') ||
                               link.getAttribute('data-original-title') || '');
            const short = plain(link.textContent).replace(/\[[^\]]*$/, '')
                               .replace(/\[[^\]]*\]/g, '').replace(/[\u2026.]+$/, '').trim();
            rows.push({
                mapId: m ? Number(m[1]) : 0,
                x: Number(coords[1]), y: Number(coords[2]),
                village: full || short,
                player: plain(player ? player.textContent : ''),
                pop: num(after),
                theirDist: parseFloat(plain(cells[1] ? cells[1].textContent : '')) || 0
            });
        }
        return rows;
    }

    // Their rows link to the world the answer belongs to, which is the only way to tell that
    // a search really is about the game being played.
    const inactiveHost = html => {
        const m = String(html).match(/href="https?:\/\/([a-z0-9.-]*travian\.com)\/karte\.php/i);
        return m ? m[1] : '';
    };

    // travian.com hosts every world on its own name, so the world is simply the host with
    // the domain cut off - and that is the key their table uses.
    const travcoAuto = () => TRAVCO_SERVERS[String(location.host).replace(/\.travian\.com$/, '')] || 0;
    const travcoId = () => Math.round(Number(settings.travcoServer)) || travcoAuto() ||
                           Math.round(Number(settings.travcoLearned)) || 0;

    // The built-in table ages the moment Travian opens a new world, so a world it does not
    // know is looked up in their own search form, which lists every world with its id.
    async function travcoLookup() {
        const doc = new DOMParser().parseFromString(
            await gmGet('https://travcotools.com/en/inactive-search/'), 'text/html');
        for (const o of doc.querySelectorAll('select[name="travian_server"] option')) {
            if (plain(o.textContent) === String(location.host)) return Number(o.value) || 0;
        }
        return 0;
    }

    async function loadInactive() {
        if (loadingAfk) return;
        const now = serverNow();
        if (afk && now - afk.at < AFK_COOLDOWN) return;      // their server, not ours

        const from = flyOrigin();
        if (!from) { afkError = 'No village coordinates yet - open any game page once.'; render(); return; }

        if (!travcoId()) {
            loadingAfk = true;
            render();
            try {
                const found = await travcoLookup();
                if (found) { settings.travcoLearned = found; persist(); }
            } catch (e) {
                afkError = 'Could not reach travcotools.com: ' + e.message;
            }
            loadingAfk = false;
            if (!travcoId()) {
                afkError = afkError || 'travcotools.com does not list this world (' +
                    location.host + ') - if it should, put its id in Settings.';
                render();
                return;
            }
        }

        loadingAfk = true;
        afkError = null;
        afkPage = 0;
        render();
        try {
            // Empty fields are left out of the query, which is what their form does for
            // "no limit" - sending village_pop_max=0 would ask for nothing at all.
            const q = {
                travian_server: travcoId(),
                x: from.x, y: from.y,
                days: Math.round(Number(settings.afkDays) || 1),
                distance_max: Math.round(Number(settings.afkDist) || 20),
                max_pop_increase: 0,
                order_by: 'distance',
                page_size: 50,
                // 2 = both. Their own farm list filter is a setting of THEIR account and would
                // quietly narrow the answer for a logged in player; the script checks the farm
                // lists itself, from the game, so it always asks for everything.
                is_in_farmlist: 2
            };
            const pop = String(settings.afkPop == null ? '' : settings.afkPop).trim();
            if (pop !== '' && Number(pop) > 0) q.village_pop_max = Math.round(Number(pop));
            if (settings.afkNatars !== false) q.include_natars = 'on';
            // '' any, '0' only capitals, '1' only non-capitals - their numbering, not mine.
            const cap = String(settings.afkCapital == null ? '' : settings.afkCapital);
            if (cap === '0' || cap === '1') q.village_is_capital = cap;
            const base = 'https://travcotools.com/en/inactive-search/?' +
                Object.keys(q).map(k => k + '=' + encodeURIComponent(q[k])).join('&');

            // Their pages hold fifty villages each, so anything but the closest handful is on
            // page two and beyond. Pages are read until one comes back short or empty, with a
            // breath between them - it is their server, and nothing here is on a timer.
            const maxPages = Math.min(40, Math.max(1, Math.round(Number(settings.afkPages) || 10)));
            const seen = new Set();
            const rows = [];
            let host = '', pages = 0;
            for (let page = 1; page <= maxPages; page++) {
                if (page > 1) await new Promise(r => setTimeout(r, 400));
                let html;
                try {
                    html = await gmGet(base + '&page=' + page);
                } catch (e) {
                    // Their site answers a page past the last one with 404, so that is the end
                    // of the list, not a failure - unless it happens on the very first page.
                    if (page === 1) throw e;
                    break;
                }
                const batch = parseInactive(html);
                pages = page;
                if (!host) host = inactiveHost(html);
                let added = 0;
                for (const r of batch) {
                    if (seen.has(r.mapId)) continue;
                    seen.add(r.mapId);
                    rows.push(r);
                    added++;
                }
                afkPage = page;
                render();
                if (batch.length < 50 || !added) break;      // last page, or the same one again
            }
            if (!rows.length) throw new Error('no rows - check the server id in Settings');
            afk = { at: now, from: { id: from.id, name: from.name, x: from.x, y: from.y }, rows,
                    host, pages };
            save(LS_AFK, afk);
            console.log('[flTimer] inactive: ' + rows.length + ' village(s)');
        } catch (e) {
            afkError = e.message;
            console.error('[flTimer] inactive search failed:', e);
        }
        loadingAfk = false;
        render();
    }

    async function loadTraining() {
        if (loadingTrain) return;
        loadingTrain = true;
        trainError = null;
        render();
        try {
            // The training tab states how long each queue still runs, which beats a count
            // of units: forty units can be an hour or eight, depending what they are.
            const r = await fetch('/village/statistics/troops/training', { credentials: 'same-origin' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const parsed = parseTrainingOverview(await r.text());
            if (!parsed) throw new Error('training table not found');
            training = { at: serverNow(), cols: parsed.cols, villages: parsed.villages };
            save(LS_TRAIN, training);
            console.log('[flTimer] training: ' + training.villages.length + ' village(s)');
        } catch (e) {
            trainError = e.message;
            console.error('[flTimer] reading training failed:', e);
        }
        loadingTrain = false;
        render();
    }

    // ---------- slot economics ----------
    // What a slot actually earns per hour of a soldier's time. A distant slot with four
    // units can tie up as much army as a near one with twenty, which the game never says.
    function slotYield(l, speeds) {
        const out = [];
        for (const s of l.slotsInfo) {
            if (s.avg == null) continue;
            const ow = oneWay(s, speeds, tsPct(l.villageId));
            if (!ow) continue;
            let units = 0;
            for (const k of Object.keys(s.troop)) units += s.troop[k];
            if (!units) continue;
            out.push({
                name: s.name || '?', list: l.name, tribe: l.tribe, troop: s.troop,
                villageId: l.villageId,
                dist: s.dist, units, rt: 2 * ow, avg: s.avg,
                rate: s.avg / (units * 2 * ow / 3600)
            });
        }
        return out;
    }

    function allSlotYields() {
        let all = [];
        for (const l of cache.lists) if (visible(l)) all = all.concat(slotYield(l, speedsFor(l.tribe)));
        return all;
    }

    const median = xs => {
        if (!xs.length) return 0;
        const a = xs.slice().sort((x, y) => x - y);
        const h = a.length >> 1;
        return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
    };

    // ---------- spendable troops ----------
    // Not "how many sit at home" but "how many may leave, and for how long". A trip
    // longer than the gap between sends eats into the next click even if the barracks
    // looks full right now.
    //
    // Simulated rather than summed: every scheduled send takes its troops and hands them
    // back one round trip later, so recycling is counted once instead of over-reserved.
    // The pool only ever drops at a send, so the low point of each horizon is the pool
    // straight after the last send inside it.
    const HORIZONS = [1800, 3600, 10800, 28800];
    const HORIZON_LABELS = ['30m', '1h', '3h', '8h'];

    function spare(villageId, now) {
        const all = cache.lists.filter(l => l.villageId === villageId && visible(l));
        const ls = all.filter(l => l.exact);
        // A list collapsed in the game sends no slots, so there are no round trips to
        // simulate. Saying so beats dropping the whole village without a word.
        if (!ls.length) {
            return all.length
                ? { collapsed: true, village: all[0].village || ('#' + villageId) }
                : null;
        }

        const speeds = speedsFor(ls[0].tribe);
        const pool = addTroop({}, ls[0].home, 1);   // troops at home are per village
        const units = {};
        for (const l of ls) for (const k of Object.keys(l.need)) units[k] = true;
        const keys = Object.keys(units).sort();
        if (!keys.length) return null;

        // Real movements come first; they are only as fresh as the last manual read, so
        // without one this understates what comes back — which errs the safe way.
        const run = runs[villageId];
        let pending = run ? run.events.filter(e => e.at > now).map(e => ({ at: e.at, troop: e.troop })) : [];
        pending.sort((a, b) => a.at - b.at);

        const last = now + HORIZONS[HORIZONS.length - 1];
        const free = {};
        for (const k of keys) free[k] = HORIZONS.map(() => pool[k] || 0);

        // Sends are assumed to happen at the red threshold, the cadence already configured.
        const due = ls.map(l => ({ l, at: Math.max((l.last || now) + thresholds(l.id).alert, now),
                                   cad: thresholds(l.id).alert }))
                      .filter(d => d.cad > 0);

        let sends = 0, blind = 0;

        for (let guard = 0; guard < 500; guard++) {
            let d = null;
            for (const x of due) if (x.at <= last && (!d || x.at < d.at)) d = x;
            if (!d) break;

            while (pending.length && pending[0].at <= d.at) addTroop(pool, pending.shift().troop, 1);

            // The moment a list falls due, its troops are committed whether or not they are
            // home yet. Booking the reservation here — not only on a successful send — is
            // what stops a starving list from looking like spare capacity.
            for (let i = 0; i < HORIZONS.length; i++) {
                if (d.at > now + HORIZONS[i]) continue;
                for (const k of keys) {
                    free[k][i] = Math.min(free[k][i], (pool[k] || 0) - (d.l.need[k] || 0));
                }
            }

            let ok = true;
            for (const k of Object.keys(d.l.need)) if ((pool[k] || 0) < d.l.need[k]) ok = false;

            // A farm list goes out whole or not at all, so a send it cannot cover slides
            // forward until enough troops are home, which is what actually happens.
            if (!ok) {
                d.slipped = true;
                if (!pending.length) { d.at = last + 1; continue; }
                d.at = pending[0].at;          // wait for the next return, then retry
                continue;
            }

            sends++;
            addTroop(pool, d.l.need, -1);
            let added = false;
            for (const slot of d.l.slotsInfo) {
                const ow = oneWay(slot, speeds, tsPct(villageId));
                // Without a measured speed the slot's troops can never be booked back in,
                // so the pool only falls and the long horizons read far too low. Counted
                // and reported rather than passed off as a real number.
                if (!ow) { blind++; continue; }
                pending.push({ at: d.at + 2 * ow, troop: slot.troop });
                added = true;
            }
            if (added) pending.sort((a, b) => a.at - b.at);
            d.at += d.cad;
        }

        for (const k of keys) free[k] = free[k].map(v => Math.max(0, v));
        // Which lists slipped, not just how many: a count alone says nothing about what
        // to do, and the two reasons for slipping need different answers.
        const late = due.filter(d => d.slipped).map(d => {
            const iv = interval(listStats(d.l, speeds), totalsFor(d.l.village));
            return { name: d.l.name, cad: d.cad, need: (iv && iv.sec) || 0 };
        });
        return { keys, free, late, sends, blind, tribe: ls[0].tribe, village: ls[0].village,
                 hasRun: !!run, runAge: run ? now - run.at : null };
    }

    // ---------- training queue ----------
    // Barracks/stable queue: one row per order, td.desc holds "<n> <unit>" plus an
    // img.unit.uNN identifying the unit, td.dur the countdown to that order finishing.
    // Consecutive rows give the per-unit pace, so a batch of 16 is spread out instead of
    // landing in one lump (verified: 2204/2, 3306/3 and 17632/16 all give 1102 s/unit).
    function parseTraining(html, now) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const out = [];
        for (const tbl of doc.querySelectorAll('table.under_progress')) {
            const orders = [];
            for (const tr of tbl.querySelectorAll('tbody tr')) {
                const desc = tr.querySelector('td.desc');
                const timer = tr.querySelector('td.dur .timer[value]');
                if (!desc || !timer) continue;        // the "next soldier" row has neither
                const img = desc.querySelector('img[class]');
                const um = img && String(img.className).match(/\bu(\d+)\b/);
                if (!um) continue;
                const nm = desc.textContent.match(/\d[\d.,\s ]*/);
                const n = nm ? parseInt(nm[0].replace(/\D/g, ''), 10) : 0;
                const sec = Number(timer.getAttribute('value'));
                if (!n || !isFinite(sec)) continue;
                orders.push({ t: 't' + (((Number(um[1]) - 1) % 10) + 1), n, at: now + sec });
            }
            let prev = null;
            for (const o of orders) {
                const rate = (prev !== null && o.n > 0) ? (o.at - prev) / o.n : 0;
                if (rate > 0 && o.n <= 50) {
                    for (let i = 0; i < o.n; i++) {
                        const troop = {}; troop[o.t] = 1;
                        out.push({ at: o.at - rate * (o.n - 1 - i), troop });
                    }
                } else {
                    const troop = {}; troop[o.t] = o.n;
                    out.push({ at: o.at, troop });    // no pace known: count them when the order ends
                }
                prev = o.at;
            }
        }
        return out;
    }

    // Extra seconds a raid needs after it lands before it is home again. The distance
    // comes from the farm list's own figure when the target is one of its slots, and
    // falls back to map geometry for anything else.
    function returnLeg(mv, m, speeds) {
        let dist = 0;
        for (const l of cache.lists) {
            for (const t of l.targets) if (t.mapId === mv.dst && t.dist) { dist = t.dist; break; }
            if (dist) break;
        }
        if (!dist) {
            if (!m) return { why: 'no map' };
            if (!mv.src || !mv.dst) return { why: 'no target' };
            dist = mapDist(coordsOf(mv.src, m), coordsOf(mv.dst, m), m);
        }
        if (!dist) return { why: 'no distance' };

        let slowest = Infinity;
        for (const k of Object.keys(mv.troop)) {
            const v = speeds[Number(k.slice(1))];
            if (!v) return { why: 'no speed for ' + k };
            if (v < slowest) slowest = v;
        }
        return isFinite(slowest) ? { sec: dist * 3600 / slowest } : { why: 'no speed' };
    }

    // Reads the village the game currently has open: what is coming home, what is still
    // heading out (which comes home one leg later), and what is being trained.
    // Deliberately never passes newdid — switching villages is a change to the account,
    // not a read, and doing it in bursts is exactly what looks like automation.
    async function readVillage(now) {
        const q = suffix => fetch('/build.php?' + suffix, { credentials: 'same-origin' })
            .then(r => r.ok ? r.text() : '').catch(() => '');
        const [hIn, hOut, hBar, hSta] = await Promise.all([
            q('gid=16&tt=1&filter=1'), q('gid=16&tt=1&filter=2'), q('gid=19'), q('gid=20')
        ]);
        if (!hIn && !hOut) throw new Error('rally point unreadable');

        const m = deriveMap(cache.lists);
        // Return-table tooltips give the exact flight time, so they overrule anything
        // inferred from a slot that may have launched in an earlier wave.
        const tribe = (cache.lists.find(l => l.villageId === cache.activeVillage) || {}).tribe;
        const tips = speedsFromReturns(hIn, m);
        for (const u of Object.keys(tips)) learnSpeed(tribe, Number(u), tips[u], true);
        save(LS_SPEEDS, speedStore);
        const speeds = speedsFor(tribe);
        const events = [];
        let seen = 0, skipped = 0, trained = 0;

        // Incoming also lists enemy attacks, so only troops of ours coming home count.
        const back = parseMovements(hIn, 'back');
        for (const mv of back.items) {
            seen++;
            events.push({ at: now + mv.sec, troop: mv.troop });
        }
        const outb = parseMovements(hOut, 'out');
        const why = {};
        for (const mv of outb.items) {
            seen++;
            const leg = returnLeg(mv, m, speeds);
            if (leg.why) { skipped++; why[leg.why] = (why[leg.why] || 0) + 1; continue; }
            events.push({ at: now + mv.sec + leg.sec, troop: mv.troop });
        }
        for (const html of [hBar, hSta]) {
            if (!html) continue;
            for (const ev of parseTraining(html, now)) {
                events.push(ev);
                for (const k of Object.keys(ev.troop)) trained += ev.troop[k];
            }
        }
        events.sort((a, b) => a.at - b.at);
        return { at: now, events, seen, skipped, why, trained,
                 declared: back.declared + outb.declared,
                 rendered: back.rendered + outb.rendered };
    }

    async function loadRun() {
        const vid = cache && cache.activeVillage;
        if (loadingRun || !vid) return;
        loadingRun = true;
        render();
        try {
            runs[vid] = await readVillage(serverNow());
            save(LS_RUNS, runs);
            console.log('[flTimer] village ' + vid + ': ' + runs[vid].seen + ' movement(s), ' +
                        runs[vid].trained + ' in training');
        } catch (e) {
            console.error('[flTimer] reading village failed:', e);
        }
        loadingRun = false;
        render();
    }

    // When this list can next be sent in full, from troops at home plus what is on its
    // way back. Only for the village whose movements were read.
    // When this list can next be sent in full, and which unit is holding it up. That is
    // usually a different unit from the one limiting the long-run interval: the interval
    // asks which unit recycles slowest, this asks which one is short right now.
    function nextRun(l, now) {
        const run = runs[l.villageId];
        if (!run) return null;

        const pool = addTroop({}, l.home, 1);
        const pending = Object.keys(l.need).filter(k => (pool[k] || 0) < l.need[k]);
        if (!pending.length) return { at: now, blocker: null };

        const satisfied = {};
        for (const e of run.events) {
            if (e.at <= now) continue;
            addTroop(pool, e.troop, 1);
            for (let i = pending.length - 1; i >= 0; i--) {
                const k = pending[i];
                if ((pool[k] || 0) >= l.need[k]) { satisfied[k] = e.at; pending.splice(i, 1); }
            }
            if (!pending.length) break;
        }
        if (pending.length) return { at: null, blocker: pending[0] };

        let at = now, blocker = null;
        for (const k of Object.keys(satisfied)) {
            if (satisfied[k] > at) { at = satisfied[k]; blocker = k; }
        }
        return { at, blocker };
    }

    // ---------- thresholds / visibility ----------
    function thresholds(listId) {
        const o = settings.perList[listId] || {};
        return {
            warn:  (o.warn  != null ? o.warn  : settings.warnMin)  * 60,
            alert: (o.alert != null ? o.alert : settings.alertMin) * 60
        };
    }

    // A stable colour per village so a row can say which village it belongs to without
    // spending any width on the name.
    const VCOL = ['#2f7d3a', '#2c6fb5', '#b5762c', '#7a4fb5', '#1f8fa8', '#b53a3a'];
    const villageColour = id => VCOL[Math.abs(Number(id) || 0) % VCOL.length];

    const visible = l => !settings.hidden.includes(l.id) && !settings.hiddenVillages.includes(l.villageId);

    function band(l, sec) {
        const t = thresholds(l.id);
        if (sec >= t.alert) return 'bad';
        if (sec >= t.warn) return 'warn';
        return 'ok';
    }

    // ---------- alerts ----------
    function beep() {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = 'sine'; o.frequency.value = 660;
            g.gain.setValueAtTime(0.0001, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
            o.start(); o.stop(ctx.currentTime + 0.45);
            setTimeout(() => { try { ctx.close(); } catch {} }, 900);
        } catch {}
    }

    function fireAlert(list, sec) {
        const body = list.name + ' — idle for ' + fmtElapsed(sec);
        try {
            if (settings.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification('Farm list due', { body, tag: 'flTimer-' + list.id });
            }
        } catch {}
        if (settings.sound) beep();
        console.log('[flTimer] ALERT: ' + body);
    }

    // Everything that wants attention right now: an overdue list, or a village whose
    // training queue has fallen under the threshold.
    function pending() {
        const now = serverNow();
        let n = 0;
        if (cache) {
            for (const l of cache.lists) {
                if (visible(l) && l.last && (now - l.last) >= thresholds(l.id).alert) n++;
            }
        }
        if (training && training.villages) {
            const warnSec = Math.max(1, Number(settings.trainWarn) || 30) * 60;
            const age = Math.max(0, now - training.at);
            for (const v of training.villages) {
                if (settings.hiddenVillages.indexOf(v.id) !== -1) continue;
                let worst = null;
                for (const gid of TRAIN_MAIN) {
                    if (v.q[gid] === undefined) continue;
                    const t = Math.max(0, v.q[gid] - age);
                    if (worst === null || t < worst) worst = t;
                }
                if (worst !== null && worst < warnSec) n++;
            }
        }
        return n;
    }

    // The browser tab title is the one alert that works with the game in another tab and
    // needs no permission, unlike a desktop notification.
    let baseTitle = document.title, blinkOn = false, blinkTimer = null;

    function tabAlert() {
        const n = settings.tabAlert === false ? 0 : pending();
        if (!n) {
            if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; }
            if (blinkOn) { document.title = baseTitle; blinkOn = false; }
            else baseTitle = document.title;      // the game may have changed it meanwhile
            return;
        }
        if (blinkTimer) return;
        blinkTimer = setInterval(() => {
            blinkOn = !blinkOn;
            document.title = blinkOn ? '(' + pending() + ') ' + baseTitle : baseTitle;
        }, 1000);
    }

    function checkAlerts(silent) {
        if (!cache) return;
        const now = serverNow();
        let changed = false;
        for (const l of cache.lists) {
            if (!visible(l) || !l.last) continue;
            const red = (now - l.last) >= thresholds(l.id).alert;
            const already = settings.notified.includes(l.id);
            if (red && !already) {
                if (!silent) fireAlert(l, now - l.last);
                settings.notified.push(l.id);
                changed = true;
            } else if (!red && already) {
                settings.notified = settings.notified.filter(x => x !== l.id);
                changed = true;
            }
        }
        if (changed) persist();
    }

    // ---------- UI shell ----------
    // Every panel is its own draggable window with its own position and open state, so only
    // what the player actually wants stays on screen and each piece can sit where it does
    // not cover the game. They share one stylesheet and one render pass.
    const CSS = [
        '<style>',
        ':host { all: initial; }',
        '* { box-sizing: border-box; font-family: system-ui, "Segoe UI", Arial, sans-serif; }',
        '.panel { width: 224px; background: #fffdf9; color: #16130f; border: 2px solid #b6a88f;',
        '         border-radius: 8px; box-shadow: 0 8px 22px rgba(40,28,10,.35); font-size: 15px;',
        '         overflow: hidden; }',
        '.grip { display: flex; align-items: center; justify-content: space-between; height: 15px;',
        '        cursor: move; user-select: none; padding: 0 3px 0 6px; }',
        '.grip .gt { color: #fff; font-size: 10px; font-weight: 700; letter-spacing: .06em;',
        '            text-transform: uppercase; overflow: hidden; text-overflow: ellipsis;',
        '            white-space: nowrap; }',
        '.grip button.hot { background: #ffd9a0; box-shadow: 0 0 0 2px #c22a1c inset; }',
        '.grip button { background: rgba(255,255,255,.82); border: 0; border-radius: 3px;',
        '               padding: 0 4px; font-size: 11px; line-height: 13px; cursor: pointer; }',
        '.grip button:hover { background: #fff; }',
        '.grip button.on { background: #fff; box-shadow: 0 0 0 2px rgba(0,0,0,.3) inset; }',
        '.scrollbox { max-height: 260px; overflow-y: auto; scrollbar-width: thin; }',
        '.foot { padding: 5px 9px 6px; font-size: 11.5px; line-height: 1.35; color: #a99e8a;',
        '        border-top: 1px solid #f0e9da; }',
        '.foot button.lnk { color: #7a6e5c; font: inherit; text-decoration: underline; }',
        '.hlp { padding: 8px 9px 10px; font-size: 12.5px; line-height: 1.45; color: #443c30;',
        '       background: #faf6ec; white-space: pre-line; max-height: 60vh;',
        '       overflow-y: auto; }',

        'button { background: #fffdf9; color: #3a3226; border: 1px solid #b6a88f; border-radius: 5px;',
        '         cursor: pointer; font-size: 14px; line-height: 1; padding: 5px 7px; }',
        'button:hover { background: #f2ebdb; }',
        'button.on { background: #d9c9a3; border-color: #8a7a5c; font-weight: 700; }',
        '.body { max-height: 70vh; overflow-y: auto; }',
        '.sec + .sec { border-top: 1px solid #cdc0a8; }',
        '.sech { display: flex; align-items: center; gap: 6px; padding: 4px 8px 3px;',
        '        background: #f6f1e6; cursor: pointer; user-select: none; }',
        '.sech:hover { background: #f1ead9; }',
        '.sech .lbl { font-size: 10px; font-weight: 700; text-transform: uppercase;',
        '             letter-spacing: .08em; color: #7a6e5c; }',
        '.sech .cnt { flex: 1; font-size: 10px; color: #a2977f; }',
        '.sech .arw { font-size: 9px; color: #a2977f; }',
        '.row { display: flex; align-items: baseline; gap: 7px; padding: 5px 9px;',
        '       border-top: 1px solid #f0e9da; }',
        '.row.tight { padding-bottom: 4px; }',
        '.right { display: flex; flex-direction: column; align-items: flex-end; flex: none; }',
        '.vdot { flex: none; width: 7px; height: 7px; border-radius: 50%; align-self: center; }',
        '.dockwrap { position: relative; flex: 1 1 0; min-width: 0; display: flex; }',
        '.dockwrap button { width: 100%; }',
        '.alarm { position: absolute; top: -2px; right: -1px; min-width: 12px; height: 12px;',
        '         border-radius: 6px; background: #c22a1c; color: #fff; font-size: 9px;',
        '         line-height: 12px; text-align: center; font-weight: 700; pointer-events: none; }',
        '@keyframes flpulse { 0%,100% { box-shadow: 0 0 0 0 rgba(194,42,28,.55); }',
        '                     50% { box-shadow: 0 0 0 4px rgba(194,42,28,0); } }',
        '.panel.alert { animation: flpulse 1.6s ease-out infinite; }',
        '.row .ask { flex: none; padding: 2px 7px; font-size: 13px; font-weight: 700; }',
        '.rk { flex: none; width: 14px; color: #a2977f; font-weight: 700; font-size: 14px; }',
        '.nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
        '      font-weight: 600; }',
        '.nm a { color: inherit; text-decoration: none; }',
        '.nm a:hover { text-decoration: underline; }',
        '.vg { display: block; font-size: 13px; font-weight: 400; color: #6b6357; }',
        '.el { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 18px;',
        '      white-space: nowrap; letter-spacing: -.01em; }',
        '.el.sm { font-size: 15px; }',
        '.lnk { background: none; border: 0; padding: 0; margin: 0; font: inherit; color: inherit;',
        '       cursor: pointer; text-align: left; max-width: 100%; overflow: hidden;',
        '       text-overflow: ellipsis; white-space: nowrap; display: block; }',
        '.lnk.wrap { white-space: normal; line-height: 1.15; display: -webkit-box;',
        '            -webkit-line-clamp: 2; -webkit-box-orient: vertical; }',
        '.lnk:hover { text-decoration: underline; background: none; }',
        '.ago { display: block; font-size: 12px; font-weight: 400; color: #7a6e5c; }',
        '.un { font-size: 11px; font-weight: 400; color: #a2977f; padding-left: 3px; }',
        '.cap { display: inline-block; width: 11px; color: #8a5c00; font-size: 11px;',
        '       text-align: left; vertical-align: 1px; }',
        '.ok { color: #1b7a2f; } .warn { color: #8a5c00; } .bad { color: #c22a1c; } .mute { color: #a2977f; }',
        '.run { font-size: 11px; color: #245c99; white-space: nowrap; }',
        '.grid { width: 100%; border-collapse: collapse; font-size: 14px; }',
        '.grid th { font-size: 10px; text-transform: uppercase; letter-spacing: .03em; color: #6b6357;',
        '           font-weight: 700; text-align: right; padding: 5px 4px 3px; }',
        '.grid th:first-child { text-align: left; padding-left: 8px; }',
        '.grid th:last-child, .grid td:last-child { padding-right: 8px; }',
        '.grid td { padding: 5px 3px; text-align: right; font-variant-numeric: tabular-nums;',
        '           white-space: nowrap; border-top: 1px solid #f0e9da; }',
        '.grid td:not(:first-child) { width: 1%; }',
        '.grid td:first-child { text-align: left; padding-left: 8px; font-weight: 600;',
        '                       overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
        '.grid.fix { table-layout: fixed; }',
        '.grid.fix td:not(:first-child), .grid.fix th:not(:first-child) { width: 44px; }',
        '.grid.res td:not(:first-child), .grid.res th:not(:first-child) { width: 54px; }',
        '.grid.res td:first-child { padding-right: 0; }',
        '.grid.afk td:first-child { font-size: 13px; }',
        '.grid.afk td:not(:first-child), .grid.afk th:not(:first-child) { width: 38px; }',
        '.grid td.z { color: #cfc6b4; }',
        '.grid td.few { color: #8a5c00; }',
        '.grid tr.vrow td { background: #f6f1e6; font-size: 11px; font-weight: 700;',
        '                   text-transform: uppercase; letter-spacing: .04em; color: #6b6357;',
        '                   padding-top: 6px; }',
        '.grid tr.sum td { border-top: 2px solid #ded4bf; font-weight: 700; }',
        '.grid tr.dim td { color: #b3a894; font-size: 12px; white-space: normal;',
        '                  line-height: 1.25; }',
        '.info { padding: 7px 9px 9px; background: #faf6ec; border-top: 1px solid #e2d9c6; font-size: 14px; }',
        '.info .big { font-size: 16px; font-weight: 700; padding: 2px 0 6px; }',
        '.info .kv { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }',
        '.info .k { color: #9a9080; flex: none; font-size: 12px; }',
        '.info .v { font-variant-numeric: tabular-nums; text-align: right; font-size: 15px;',
        '           font-weight: 600; }',
        '.info .warnline { color: #8a5c00; padding-top: 6px; font-size: 13px; line-height: 1.4; }',
        '.cfg label { display: flex; align-items: center; gap: 8px; padding: 7px 11px; cursor: pointer; }',
        '.cfg label:hover { background: #f6f1e6; }',
        '.cfg .sect { padding: 10px 11px 5px; font-size: 12px; text-transform: uppercase;',
        '             letter-spacing: .08em; color: #7a6e5c; border-top: 1px solid #e2d9c6; font-weight: 700; }',
        '.cfg .num { display: flex; align-items: center; justify-content: space-between; gap: 8px;',
        '            padding: 5px 11px; }',
        '.cfg input[type=number] { width: 76px; background: #fff; color: #16130f;',
        '                          border: 1px solid #b6a88f; border-radius: 4px; padding: 5px 7px;',
        '                          font-size: 14px; }',
        '.cfg .lrow { display: flex; align-items: center; gap: 6px; padding: 5px 11px;',
        '             border-bottom: 1px solid #f0e9da; }',
        '.cfg .lrow .lname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;',
        '                    white-space: nowrap; }',
        '.cfg .lrow input[type=number] { width: 54px; }',
        '.cfg .thead { display: flex; gap: 6px; padding: 2px 11px 4px; font-size: 11px; color: #7a6e5c; }',
        '.cfg .thead .s1 { flex: 1; }',
        '.cfg .thead .s2 { width: 54px; text-align: center; }',
        '.cfg .bulk { display: flex; gap: 8px; padding: 8px 11px; }',
        '.empty { padding: 12px 9px; color: #6b6357; }',
        '.hidden { display: none; }',
        '.dock { display: flex; gap: 2px; padding: 4px 5px; background: #f6f1e6;',
        '        border-bottom: 1px solid #e2d9c6; }',
        '.dock button { padding: 3px 0 2px; font-size: 13px; line-height: 1.15; flex: 1 1 0;',
        '               min-width: 0; text-align: center; border-bottom-width: 3px; }',
        '.cap2 { display: block; font-size: 12px; color: #6b6357; padding: 5px 8px 0; }',
        '.fly { padding: 6px 8px; display: flex; gap: 5px; align-items: center; }',
        '.fly input { flex: 1; min-width: 0; background: #fff; color: #16130f; border: 1px solid #b6a88f;',
        '             border-radius: 4px; padding: 5px 7px; font-size: 14px; }',
        '.fly select { background: #fff; color: #16130f; border: 1px solid #b6a88f; border-radius: 4px;',
        '              padding: 4px 5px; font-size: 14px; max-width: 110px; }',
        '.item { border-top: 1px solid #f0e9da; }',
        '.item:first-child { border-top: 0; }',
        '.item .row { border-top: 0; }',
        '.bar { height: 4px; width: 72px; margin: 2px 0 0 auto; background: #ded4bf;',
        '       border-radius: 2px; overflow: hidden; box-shadow: 0 0 0 1px #cfc4ac inset; }',
        '.bar i { display: block; height: 100%; background: #1b7a2f; transition: width .3s; }',
        '.bar.warn i { background: #c98a00; }',
        '.bar.bad i { background: #c22a1c; }',
        '.bar.mute i { background: #b8ae9c; }',
        '.vhead td { background: #f6f1e6; font-size: 12px; text-transform: uppercase;',
        '            letter-spacing: .05em; color: #7a6e5c; font-weight: 700; }',
        '</style>',
    ].join('\n');

    // The hub has no body of its own: it is only the strip that opens and closes the
    // rest, so no window has to carry its own close button.
    // No window carries a title any more: the colour of its frame is its name, and the
    // same colour sits under its button in the hub.
    const WINDOWS = [
        { key: 'hub',      title: 'Panels',        icon: '',          col: '#6b6357',
          hint: 'Drag me; the buttons open and close the panels' },
        { key: 'lists',    title: 'Farm lists',    icon: '&#9200;',   col: '#2f7d3a',
          hint: 'How long since each list went' },
        { key: 'spare',    title: 'Free for attacks', icon: '&#9878;', col: '#7a4fb5',
          hint: 'Troops you can send away' },
        { key: 'training', title: 'In training',   icon: '&#9874;',   col: '#b5762c',
          hint: 'Barracks and stable queues', reload: true },
        { key: 'prod',     title: 'Production',    icon: '&#8721;',   col: '#b53a7a',
          hint: 'What the whole account makes per hour', reload: true },
        { key: 'slots',    title: 'Weakest slots', icon: '&#8600;',   col: '#b53a3a',
          hint: 'Worst paying slots' },
        { key: 'loot',     title: 'Biggest hauls', icon: '&#128176;', col: '#a8891f',
          hint: 'Best manual targets', reload: true },
        { key: 'afk',      title: 'Inactive near me', icon: '&#128064;', col: '#5a5f9e',
          hint: 'Villages that stopped growing', reload: true },
        { key: 'fly',      title: 'Travel time',   icon: '&#9992;',   col: '#1f8fa8',
          hint: 'Time to any coordinates' },
        { key: 'detail',   title: 'List detail',   icon: '?',         col: '#2c6fb5',
          hint: 'The list you picked' },
        { key: 'config',   title: 'Settings',      icon: '&#9776;',   col: '#8a8175',
          hint: 'Settings' }
    ];
    const WIN_BY_KEY = {};
    for (const d of WINDOWS) WIN_BY_KEY[d.key] = d;

    function winState(key) {
        const w = settings.win[key] || (settings.win[key] = {});
        if (w.open === undefined) w.open = (key === 'hub' || key === 'lists');
        if (key === 'hub') w.open = true;          // the way back to everything else
        return w;
    }

    const wins = {};        // key -> live window

    function makeWindow(def, index) {
        const host = document.createElement('div');
        host.id = 'flTimerHost_' + def.key;
        host.style.cssText = 'position:fixed;z-index:2147483000;';
        const st = winState(def.key);
        // Docked windows are placed by layout() a moment later; only a window the player
        // dragged away keeps a position of its own.
        host.style.left = ((st.pos && st.pos.left) || Math.max(8, window.innerWidth - 240)) + 'px';
        host.style.top = ((st.pos && st.pos.top) || 12) + 'px';
        document.body.appendChild(host);

        const hub = def.key === 'hub';
        const root = host.attachShadow({ mode: 'open' });
        // The coloured strip is both the handle and the label, so there is no title row.
        root.innerHTML = CSS +
            '<div class="panel" style="border-color:' + def.col + '">' +
            '<div class="grip" style="background:' + def.col + '"><span class="gt"></span>' +
            (hub ? '' : '<button class="why" data-act="why" title="">?</button>') +
            (def.reload ? '<button data-act="reload" title="Read again">&#10227;</button>' : '') +
            (hub ? '<button data-act="tidy" title="Put every panel back in the column">' +
                   '&#8676;</button>' +
                   '<button data-act="refresh" title="Reload lists and movements">&#10227;</button>' : '') +
            '</div>' +
            (hub ? '<div class="dock"></div>' : '<div class="body"></div>') +
            '</div>';

        const q = sel => root.querySelector(sel);
        const win = { def, host, root, head: q('.grip'), grip: q('.grip'), gt: q('.gt'),
                      body: q('.body'), dock: q('.dock'), panel: q('.panel') };
        bindWindow(win);
        return win;
    }

    let dockEl = null, dockEl2 = null;

    let cache = load(LS_CACHE, null);
    let lastError = null;

    function serverNow() {
        if (!cache) return Math.floor(Date.now() / 1000);
        return cache.serverTime + (Math.floor(Date.now() / 1000) - cache.localTime);
    }

    // ---------- views ----------
    function infoPanel(l, speeds, now) {
        const st = listStats(l, speeds);
        const total = totalsFor(l.village);
        const rows = [];
        const notes = [];
        let big;

        const iv = interval(st, total);
        if (iv && iv.sec) {
            big = 'Raid every ' + fmtDur(iv.sec) + (st.noSpeed ? '+' : '') + ' at the fastest';
            rows.push('<div class="kv"><span class="k">Train more</span><span class="v">' +
                      esc(unitName(l.tribe, Number(iv.limit.slice(1)))) + '</span></div>');
            notes.push('The rate spends every soldier on farm lists; a manual attack makes it slower.');
        } else if (loadingTotals) {
            big = 'Reading troop totals...';
        } else if (!total) {
            big = 'Raid every ... - no troop total';
            notes.push('Could not read total troops for "' + l.village + '" from the village overview.');
        } else {
            big = 'Raid every ... - not enough data';
        }

        // Lists of one village share the troops, so their costs add up. That combined
        // number is the one to actually go by.
        const vc = villageCost(l.villageId, speeds);
        if (vc.lists > 1) {
            const viv = interval({ cost: vc.cost }, total);
            if (viv && viv.sec) {
                rows.push('<div class="kv"><span class="k">All ' + vc.lists + ' lists here</span>' +
                          '<span class="v">every ' + fmtDur(viv.sec) +
                          (vc.collapsed ? ' +' : '') + '</span></div>');
                if (vc.collapsed) {
                    notes.push(vc.collapsed + ' list(s) here are collapsed in-game and add nothing to that figure.');
                }
            }
        }

        rows.push('<div class="kv"><span class="k">Loot per click</span><span class="v">' +
            (st.lootKnown ? '&asymp; ' + fmtNum(st.loot) + ' res' : 'no raids yet') + '</span></div>');
        rows.push('<div class="kv"><span class="k">Round trip</span><span class="v">' +
            (st.maxRt ? 'up to ' + esc(fmtDur(st.maxRt)) : 'unknown') + '</span></div>');

        // Exact next-send time. Only the village the game already has open can be read,
        // so other villages fill in as the player visits them; each reading is kept.
        const isOpen = cache.activeVillage && cache.activeVillage === l.villageId;
        const mine = runs[l.villageId];
        let nrv;
        if (loadingRun && isOpen) {
            nrv = 'reading...';
        } else if (!mine) {
            nrv = isOpen ? '<button data-run="1">read movements</button>'
                         : 'open ' + esc(l.village) + ' to read it';
        } else {
            const nr = nextRun(l, now);
            const who = nr && nr.blocker
                ? ' &middot; ' + esc(unitName(l.tribe, Number(nr.blocker.slice(1)))) : '';
            // The rally point only lists so many movements, so the returns that would fill
            // the list may simply not be in what was read. Saying "it cannot go" would be a
            // claim the data does not support; the sustainable interval is the honest floor.
            const guess = (iv && iv.sec && l.last)
                ? 'about ' + fmtDur(Math.max(60, l.last + iv.sec - now)) : 'not in what was read';
            nrv = !nr ? '&mdash;'
                : nr.at === null ? guess + who
                : nr.at <= now ? 'now'
                : esc(fmtDur(nr.at - now)) + who;
            // Only the caveat that makes this very number wrong stays on screen, and only
            // as a word. The rest is on the window title.
            if (now - mine.at > RUN_TTL) nrv += ' <span class="warn">old</span>';
        }
        rows.push('<div class="kv"><span class="k">Next full run</span><span class="v">' + nrv + '</span></div>');

        if (mine) {
            const cut = (mine.declared || 0) - (mine.rendered || 0);
            if (cut > 0) {
                notes.push('The page showed only ' + mine.rendered + ' of ' + mine.declared +
                           ' movements, so the time is a floor. Raise "movements per page" in options.');
            }
            if (mine.skipped) {
                const reasons = Object.keys(mine.why || {}).map(k => mine.why[k] + 'x ' + k).join(', ');
                notes.push(mine.skipped + ' outgoing raid(s) left out (' + (reasons || 'unknown') + ').');
            }
            if (now - mine.at > RUN_TTL) {
                notes.push('Movements were read ' + fmtElapsed(now - mine.at) +
                           ' ago - press the reload button before trusting the time.');
            }
        }
        if (st.noSpeed) {
            notes.push(st.noSpeed + ' of ' + st.slots + ' slot(s) have no measured speed yet.');
        }
        if (!l.exact) {
            notes.push('List is collapsed in-game, so its slots are guessed from the list default.');
        }

        return { html: '<div class="info"><div class="big">' + esc(big) + '</div>' + rows.join('') + '</div>',
                 help: notes.join(' ') };
    }

    // A tile: collapsible section with an uppercase label. Open state is remembered.
    function listRows(now) {
        // Fixed order, not "most overdue first": rows that jump around are hard to find,
        // and the colour plus the bar already say which one needs doing.
        const vorder = [];
        for (const l of cache.lists) if (vorder.indexOf(l.villageId) === -1) vorder.push(l.villageId);
        const shown = cache.lists.filter(visible).sort((a, b) =>
            (vorder.indexOf(a.villageId) - vorder.indexOf(b.villageId)) ||
            String(a.name).localeCompare(String(b.name)));
        if (!shown.length) return '<div class="empty">Nothing selected (&#9776;).</div>';

        // The question this window answers is "is a list due?", so the clock is the only
        // thing at full size. The dot says which village without spending width on its name.
        return shown.map(l => {
            const sec = l.last ? now - l.last : 0;
            const txt = l.last ? fmtElapsed(sec) : 'never';
            const c = l.last ? band(l, sec) : 'mute';
            const t = thresholds(l.id);
            const iv = interval(listStats(l, speedsFor(l.tribe)), totalsFor(l.village));
            const tooFast = iv && iv.sec && iv.sec > t.alert;

            const tip = [
                l.village || '',
                tooFast ? 'set to every ' + fmtDur(t.alert) + ' but can only go every ' + fmtDur(iv.sec)
                        : (iv && iv.sec) ? 'can go every ' + fmtDur(iv.sec) : '',
                l.running ? l.running + ' raid(s) in the air' : '',
                'last started ' + fmtAbs(l.last),
                'yellow ' + (t.warn / 60) + ' min, red ' + (t.alert / 60) + ' min'
            ].filter(Boolean).join('\u000a');

            const pct = l.last ? Math.min(100, Math.round(sec / t.alert * 100)) : 0;
            return '<div class="row tight" title="' + esc(tip) + '">' +
                   '<span class="vdot" style="background:' + villageColour(l.villageId) + '"></span>' +
                   '<span class="nm"><button class="lnk wrap' + (tooFast ? ' warn' : '') +
                   '" data-info="' + l.id + '">' + esc(l.name) + '</button></span>' +
                   '<span class="right"><span class="el ' + c + '">' + txt + '</span>' +
                   '<span class="bar ' + (l.last ? c : 'mute') + '"><i style="width:' + pct +
                   '%"></i></span></span></div>';
        }).join('');
    }

    // How much army may leave, per how long it would be gone.
    function spareRows(now) {
        const vids = [];
        for (const l of cache.lists) if (visible(l) && vids.indexOf(l.villageId) === -1) vids.push(l.villageId);

        const groups = [];
        let stale = false, anyRun = false, blind = 0;
        const late = [];
        for (const vid of vids) {
            const sp = spare(vid, now);
            if (!sp) continue;
            if (sp.collapsed) { groups.push({ village: sp.village, collapsed: true }); continue; }
            if (sp.hasRun) { anyRun = true; if (sp.runAge > RUN_TTL) stale = true; } else stale = true;
            for (const x of sp.late) late.push(x);
            blind += sp.blind;
            groups.push(sp);
        }
        if (!groups.length) return null;

        // One header for the whole panel, villages as groups under it: with two villages the
        // repeated header cost two rows and made the columns look unrelated.
        const many = groups.length > 1;
        let body = '';
        for (const g of groups) {
            if (many) body += '<tr class="vrow"><td colspan="' + (HORIZONS.length + 1) + '">' +
                              esc(g.village) + '</td></tr>';
            if (g.collapsed) {
                body += '<tr class="dim"><td colspan="' + (HORIZONS.length + 1) + '">' +
                        'lists collapsed in game</td></tr>';
                continue;
            }
            for (const k of g.keys) {
                // A unit with nothing free anywhere is one quiet line, not four zeroes.
                const none = g.free[k].every(v => v === 0);
                if (none) {
                    body += '<tr class="dim"><td>' + esc(unitName(g.tribe, Number(k.slice(1)))) +
                            '</td><td colspan="' + HORIZONS.length + '">none free</td></tr>';
                    continue;
                }
                body += '<tr><td>' + esc(unitName(g.tribe, Number(k.slice(1)))) + '</td>' +
                        g.free[k].map(v => '<td class="' + (v === 0 ? 'z' : v < 5 ? 'few' : '') + '">' +
                                           (v === 0 ? '&middot;' : fmtNum(v)) + '</td>').join('') + '</tr>';
            }
        }

        const why = [];
        if (!anyRun) why.push('Troops in the air are not counted yet.');
        else if (stale) why.push('The movement reading is old.');
        for (const x of late) {
            why.push(x.need > x.cad
                ? x.name + ' is set to every ' + fmtDur(x.cad) + ' but can only go every ' + fmtDur(x.need) + '.'
                : x.name + ' is waiting for troops to land.');
        }
        if (blind) why.push('Some slots have no measured speed, so the long columns read low.');

        return {
            html: '<table class="grid"><tr><th>Unit</th>' +
                  HORIZON_LABELS.map(h => '<th>' + h + '</th>').join('') + '</tr>' + body + '</table>',
            why: why.join(' '),
            help: [
                'Troops you can take away for a manual attack without the farm lists running short.',
                '',
                'Each column is how long the troops would be gone in total, there and back. ' +
                'So the 1H column means a target about half an hour away one way.',
                '',
                'So 80 in the 1H column means you can send 80 of that unit away for an hour and ' +
                'every list still leaves on time.',
                '',
                'It assumes you keep sending each list at its red mark, and it reserves what each ' +
                'list needs before counting anything as free.',
                '',
                'A dot means nothing is free for that long.'
            ].join('\u000a')
        };
    }

    // The slots paying least for the army time they occupy.
    function slotRows() {
        const all = allSlotYields();
        if (all.length < 3) return null;
        const med = median(all.map(x => x.rate));
        const worst = all.slice().sort((a, b) => a.rate - b.rate).slice(0, 5);

        // The point is "which slot do I drop", so a row is the target, the rate, and a way
        // to get to the list. That link is an ordinary link the player clicks; the script
        // still never switches village by itself.
        const html = worst.map(x => {
            const url = '/build.php?newdid=' + x.villageId + '&gid=16&tt=99';
            const tip = x.list + '\u000a' + x.dist.toFixed(1) + ' fields, ' +
                        Object.keys(x.troop).sort()
                            .map(k => x.troop[k] + ' ' + unitName(x.tribe, Number(k.slice(1)))).join(' + ') +
                        '\u000aaverage haul ' + fmtNum(x.avg) + ' over ' + fmtDur(x.rt);
            return '<div class="row" title="' + esc(tip) + '">' +
                   '<span class="nm"><a class="lnk" href="' + esc(url) + '">' + esc(x.name) + '</a></span>' +
                   '<span class="el sm ' + (x.rate < med / 3 ? 'bad' : x.rate < med ? 'warn' : '') + '">' +
                   fmtNum(x.rate) + '</span></div>';
        }).join('');

        return { html, med,
                 help: [
                     'What each farm list target pays for the army time it takes up: resources per ' +
                     'hour per soldier.',
                     '',
                     'A far target with four troops can tie up as much army as a near one with ' +
                     'twenty, which is why the raw booty is not the whole story.',
                     '',
                     'Click a row to open that village\u0027s farm list.'
                 ].join('\u000a') };
    }

    // Where a manual attack pays off: the fattest targets, and how long each village has
    // had to refill since it was last hit.
    function viewLoot(now) {
        if (loadingLoot) return '<div class="empty">Reading reports&hellip;</div>';
        if (!loot) {
            return '<div class="empty">' + (lootError ? 'Error: ' + esc(lootError) + '<br>' : '') +
                   '<button data-loot="1">Read reports</button></div>';
        }
        if (!loot.rows.length) return '<div class="empty">No raid in the report list brought anything home.</div>';

        // Worth going back to? That is the haul, and how long the village has had to refill.
        return loot.rows.slice(0, 5).map(e => {
            const url = e.href.charAt(0) === '?' ? '/report' + e.href : e.href;
            const tip = fmtNum(e.best) + ' on ' + fmtAbs(e.bestAt) + '\u000a' +
                        e.raids + ' raid(s), last took ' + fmtNum(e.lastGot) +
                        (e.capped ? '\u000afull load, so more was left' : '');
            return '<div class="row" title="' + esc(tip) + '">' +
                   '<span class="nm"><a class="lnk" href="' + esc(url) + '">' + esc(e.name) + '</a>' +
                   '<span class="ago">' + esc(fmtDur(now - e.last)) + ' ago</span></span>' +
                   '<span class="el sm">' + (e.capped ? '<span class="cap">&#9650;</span>' : '') +
                   fmtNum(e.best) + '</span></div>';
        }).join('');
    }

    // Which units the travel-time window lists. Only ones with a measured speed can
    // be offered, since without one there is no time to show.
    function flyUnitRows() {
        const tribe = (cache && cache.lists.length) ? cache.lists[0].tribe : 0;
        const sp = speedsFor(tribe);
        const us = Object.keys(sp).map(Number).sort((a, b) => a - b);
        if (!us.length) return '<div class="empty">No units known for this tribe yet.</div>';
        return us.map(u =>
            '<label><input type="checkbox" data-unit="' + u + '"' +
            (!settings.flyUnits || settings.flyUnits.indexOf(u) !== -1 ? ' checked' : '') +
            '><span>' + esc(unitName(tribe, u)) + ' &middot; ' + sp[u].toFixed(0) + ' fields/h</span></label>').join('');
    }

    function viewConfig() {
        const perm = (typeof Notification === 'undefined') ? 'unsupported' : Notification.permission;

        const villageRows = [];
        if (cache) {
            const seen = new Map();
            for (const l of cache.lists) if (!seen.has(l.villageId)) seen.set(l.villageId, l.village || ('#' + l.villageId));
            const ordered = Array.from(seen.keys()).sort((a, b) =>
                (villageRank(a) - villageRank(b)) ||
                String(seen.get(a)).localeCompare(String(seen.get(b))));
            for (const vid of ordered) {
                const name = seen.get(vid);
                villageRows.push('<label><input type="checkbox" data-vid="' + vid + '"' +
                    (settings.hiddenVillages.includes(vid) ? '' : ' checked') + '><span>' + esc(name) + '</span></label>');
            }
        }

        const listRows = cache ? cache.lists.map(l => {
            const o = settings.perList[l.id] || {};
            return '<div class="lrow">' +
                '<input type="checkbox" data-id="' + l.id + '"' + (settings.hidden.includes(l.id) ? '' : ' checked') + '>' +
                '<span class="lname" title="' + esc(l.name) + '">' + esc(l.name) + '</span>' +
                '<input type="number" min="0" step="1" data-thr="warn" data-tid="' + l.id + '"' +
                    ' placeholder="' + settings.warnMin + '" value="' + (o.warn != null ? o.warn : '') + '">' +
                '<input type="number" min="0" step="1" data-thr="alert" data-tid="' + l.id + '"' +
                    ' placeholder="' + settings.alertMin + '" value="' + (o.alert != null ? o.alert : '') + '">' +
                '</div>';
        }).join('') : '';

        return '<div class="cfg">' +
            '<div class="sect">Default thresholds (minutes)</div>' +
            '<div class="num"><span>Yellow after</span>' +
              '<input type="number" min="0" step="1" data-set="warnMin" value="' + settings.warnMin + '"></div>' +
            '<div class="num"><span>Red after</span>' +
              '<input type="number" min="0" step="1" data-set="alertMin" value="' + settings.alertMin + '"></div>' +

            '<div class="sect">Alert when a list turns red</div>' +
            '<label><input type="checkbox" data-set="notify"' + (settings.notify ? ' checked' : '') +
              '><span>Desktop notification</span></label>' +
            '<label><input type="checkbox" data-set="sound"' + (settings.sound ? ' checked' : '') +
              '><span>Sound</span></label>' +
            '<label><input type="checkbox" data-set="tabAlert"' +
              (settings.tabAlert === false ? '' : ' checked') +
              '><span>Blink the browser tab</span></label>' +

            '<div class="num"><span class="vg">Permission: ' + perm + '</span>' +
              '<button data-act="perm">Request</button></div>' +

            '<div class="sect">In training</div>' +
            '<div class="num"><span>Warn under (min)</span>' +
              '<input type="number" min="1" step="1" data-set="trainWarn" value="' +
              (settings.trainWarn || 30) + '"></div>' +

            '<div class="sect">Tournament Square &mdash; % the game shows</div>' +
            (vcoords ? villagesInOrder().map(v =>
                '<div class="num"><span>' + esc(v.name) + '</span>' +
                '<input type="number" min="100" max="300" step="10" data-ts="' + v.id +
                '" placeholder="100" value="' +
                esc((settings.tsPct || {})[v.id] || '') + '"></div>').join('')
                     : '<div class="empty">No villages yet.</div>') +

            '<div class="sect">Inactive search (travcotools.com)</div>' +
            '<div class="num"><span>Server id</span>' +
              '<input type="number" min="1" step="1" data-set="travcoServer" data-text="1" ' +
              'placeholder="' + (travcoAuto() || 'unknown') + '" value="' +
              esc(settings.travcoServer || '') + '"></div>' +
            '<div class="num"><span>Days flat</span>' +
              '<input type="number" min="1" max="7" step="1" data-set="afkDays" value="' +
              (settings.afkDays || 1) + '"></div>' +
            '<div class="num"><span>Max fields away</span>' +
              '<input type="number" min="1" step="1" data-set="afkDist" value="' +
              (settings.afkDist || 20) + '"></div>' +
            '<div class="num"><span>Pages to read</span>' +
              '<input type="number" min="1" max="40" step="1" data-set="afkPages" value="' +
              (settings.afkPages || 10) + '"></div>' +
            '<div class="num"><span>Max village pop</span>' +
              '<input type="number" min="0" step="1" data-set="afkPop" data-text="1" ' +
              'placeholder="any" value="' + esc(settings.afkPop == null ? '' : settings.afkPop) +
              '"></div>' +
            '<label><input type="checkbox" data-set="afkNatars"' +
              (settings.afkNatars === false ? '' : ' checked') + '><span>Include Natars</span></label>' +
            '<div class="num"><span>Capital</span>' +
              '<select data-set="afkCapital" data-text="1">' +
              ['', '0', '1'].map((v, i) => '<option value="' + v + '"' +
                  (String(settings.afkCapital || '') === v ? ' selected' : '') + '>' +
                  ['Any', 'Only capitals', 'No capitals'][i] + '</option>').join('') +
              '</select></div>' +

            '<div class="sect">Travel time &mdash; units to list</div>' +
            flyUnitRows() +

            '<div class="sect">Villages</div>' +
            (villageRows.join('') || '<div class="empty">No data.</div>') +

            '<div class="sect">Lists &amp; own thresholds</div>' +
            '<div class="thead"><span class="s1">show</span><span class="s2">yellow</span><span class="s2">red</span></div>' +
            listRows +
            '<div class="bulk"><button data-bulk="all">Show all</button>' +
              '<button data-bulk="none">Hide all</button>' +
              '<button data-bulk="clear">Clear own thresholds</button></div>' +
            '</div>';
    }

    // ---------- training view ----------
    const BARRACKS = [19, 29], STABLE = [20, 30];
    const TRAIN_MAIN = [19, 20];        // the two that must never run dry
    // Chopping the game's own names at six characters gave 'BARRAC' and 'WORKSH'.
    const TRAIN_SHORT = { 19: 'Barr', 20: 'Stable', 21: 'Works', 29: 'G.Barr',
                          30: 'G.Stbl', 46: 'Hosp' };

    function viewTraining(now) {
        if (loadingTrain) return { body: '<div class="empty">Reading&hellip;</div>' };
        if (!training || !training.villages || !training.cols) {
            return { body: '<div class="empty">' + (trainError ? 'Error: ' + esc(trainError) + '<br>' : '') +
                           '<button data-train="1">Read queues</button></div>',
                     help: 'One request, every village at once.' };
        }

        const warnSec = Math.max(1, Number(settings.trainWarn) || 30) * 60;
        const kept = training.villages.filter(v => settings.hiddenVillages.indexOf(v.id) === -1);
        if (!kept.length) return { body: '<div class="empty">No village selected.</div>' };

        // The page prints the times as they were when it was fetched, so they have to be
        // aged by how long ago that was or the panel would show a frozen countdown.
        const age = Math.max(0, now - training.at);
        const left = (v, gid) => (v.q[gid] === undefined ? null : Math.max(0, v.q[gid] - age));

        // Only the two troop pumps drive the warning; a workshop is shown when in use but
        // an idle one is normal and would paint everything red.
        const shown = training.cols.filter(c =>
            TRAIN_MAIN.indexOf(c.gid) !== -1 ||
            kept.some(v => left(v, c.gid) > 0));

        const rows = kept.map(v => {
            let worst = null;
            for (const gid of TRAIN_MAIN) {
                const t = left(v, gid);
                if (t === null) continue;
                if (worst === null || t < worst) worst = t;
            }
            const cls = worst === null ? '' : worst <= 0 ? 'bad' : worst < warnSec ? 'warn' : '';
            const cells = shown.map(c => {
                const t = left(v, c.gid);
                // An empty cell would read the same as a building that is not there, so an
                // idle queue keeps a mark - just a red one instead of a word.
                return '<td>' + (t === null ? ''
                              : t <= 0 ? '<span class="bad">&mdash;</span>'
                              : esc(fmtHM(t))) + '</td>';
            }).join('');
            return '<tr><td class="' + cls + '" title="' + esc(v.name) + '">' +
                   esc(v.name) + '</td>' + cells + '</tr>';
        }).join('');

        const head = shown.map(c =>
            '<th title="' + esc(c.name) + '">' + esc(TRAIN_SHORT[c.gid] || c.name.slice(0, 6)) +
            '</th>').join('');
        return {
            body: '<table class="grid fix"><tr><th>Village</th>' + head + '</tr>' + rows + '</table>',
            help: [
                'How much time is left in each village\u0027s training queues, as hours:minutes.',
                '',
                'Barracks and stable are the two that matter; the other buildings only appear ' +
                'when something is running in them.',
                '',
                'A red dash means that queue is empty. An empty cell means the village does not ' +
                'have that building.',
                '',
                'The village name turns amber when the barracks or stable has under ' +
                Math.round(warnSec / 60) + ' minutes left (Settings), and red when one of them ' +
                'is standing idle.',
                '',
                'Read at ' + clockAt(training.at) + '. Press the arrow to read it again.'
            ].join('\u000a')
        };
    }

    // ---------- travel time ----------
    // Distance uses the same wrap-aware geometry as the raid maths, and the speeds are the
    // ones measured from the player's own flights.
    function parseCoords(txt) {
        const m = plain(txt).match(/(-?\d{1,3})\s*[|,;/ ]\s*(-?\d{1,3})/);
        return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
    }

    // How much of a stretch of time falls inside the hours the player actually raids.
    // Without it a night of sleep drags the average down and the panel understates what
    // an hour of raiding is worth.




    // Crop per unit per hour. Game constants, but constants I cannot read off any page,
    // so every use is checked against the villages where the real figure was measured.
    const UPKEEP = {
        1: [1, 1, 1, 2, 3, 4, 3, 6, 5, 1],      // Romans
        2: [1, 1, 1, 1, 2, 3, 3, 6, 4, 1],      // Teutons
        3: [1, 1, 2, 2, 2, 3, 3, 6, 4, 1],      // Gauls
        6: [1, 1, 1, 2, 2, 3, 3, 6, 4, 1],      // Egyptians
        7: [1, 1, 2, 2, 2, 3, 3, 6, 4, 1]       // Huns
    };

    function countedUpkeep(name) {
        const u = totalsFor(name);
        const tribe = cache && cache.lists.length ? cache.lists[0].tribe : 0;
        const tbl = UPKEEP[tribe];
        if (!u || !tbl) return null;
        let sum = 0;
        for (let i = 1; i <= 10; i++) sum += (u['t' + i] || 0) * tbl[i - 1];
        return sum;
    }

    // What the farm lists would bring if they were sent at their red threshold for the
    // hours the player says they farm. The loot per run is what the targets have actually
    // been paying, so this is a projection of measured hauls, not a guess.
    // What the farm lists bring in an hour, straight out of the list itself: every target
    // reports what it has hauled in total and over how many raids, so its average haul is
    // known, and the red threshold says how often the list goes.
    // What the farm lists bring in an hour, straight out of the list itself: every target
    // reports what it has hauled in total and over how many raids, so its average haul is
    // known, and the red threshold says how often the list goes.
    function raidPerHour() {
        if (!cache) return null;
        const per = [0, 0, 0, 0];
        let perHour = 0, plain = 0, lists = 0, slots = 0, known = 0;
        for (const l of cache.lists) {
            if (!visible(l)) continue;
            const st = listStats(l, speedsFor(l.tribe));
            slots += st.slots;
            known += st.lootKnown;
            const cad = thresholds(l.id).alert;
            if (!st.loot || !cad) continue;
            const runs = 3600 / cad;
            perHour += st.loot * runs;
            plain += st.lootPlain * runs;
            for (let i = 0; i < 4; i++) per[i] += st.loot4[i] * runs;
            lists++;
        }
        if (!lists) return null;

        // Targets that have paid but never reported a split get shared out the same way the
        // rest of the booty came in, rather than being dropped or split evenly on a guess.
        const known4 = per[0] + per[1] + per[2] + per[3];
        if (plain > 0) {
            for (let i = 0; i < 4; i++) per[i] += known4 > 0 ? plain * per[i] / known4 : plain / 4;
        }
        return { perHour, per, lists, slots, known, guessedShare: known4 > 0 ? 0 : 1 };
    }

    function viewProduction(now) {
        if (loadingProd) return { body: '<div class="empty">Reading&hellip;</div>' };
        if (!prod || !prod.villages) {
            return { body: '<div class="empty">' + (prodError ? 'Error: ' + esc(prodError) + '<br>' : '') +
                           '<button data-prod="1">Read production</button></div>',
                     help: 'One request, every village at once.' };
        }

        const kept = prod.villages.filter(v => settings.hiddenVillages.indexOf(v.id) === -1);
        if (!kept.length) return { body: '<div class="empty">No village selected.</div>' };

        const tot = [0, 0, 0, 0];
        for (const v of kept) for (let i = 0; i < 4; i++) tot[i] += v.r[i];

        // A village whose troop upkeep has never been measured can only make the net worse,
        // so the figure is an upper bound until every village has been opened once.
        // The measured figure wins wherever there is one; for the rest the troop overview is
        // counted. "Own troops" lists everything a village owns and feeds, troops in the field
        // included, so the only thing that can be wrong there is my crop-per-unit table - and
        // the check below is what catches that.
        let eaten = 0, guessed = 0, blind = 0;
        let checkName = '', checkMeasured = 0, checkCounted = 0;
        // A measurement taken before the troop count was read is older news than the count
        // itself - troops trained since then would be missing from it.
        const troopsAt = (totals && totals.fetchedAt) || 0;
        for (const v of kept) {
            const u = upkeep[v.id];
            const c = countedUpkeep(v.name);
            if (u && c != null && !checkName) { checkName = v.name; checkMeasured = u.crop; checkCounted = c; }
            if (u && (c == null || u.at >= troopsAt)) {
                eaten += u.crop;
            } else if (c != null) {
                eaten += c;
                guessed++;
            } else {
                blind++;
            }
        }
        const net = tot[3] - eaten;
        const cls = net < 0 ? 'bad' : net < 300 ? 'warn' : '';

        const line = (name, val, c) => '<tr><td>' + name + '</td><td class="' + (c || '') + '">' +
                                       fmtNum(val) + '</td></tr>';
        // The booty is one number, not four: nothing outside a single report says how much
        // of a haul was crop, so the raid figure sits on the sum row only.
        const raid = raidPerHour();
        const perHour = [tot[0], tot[1], tot[2], net];
        const madeAll = perHour[0] + perHour[1] + perHour[2] + perHour[3];
        const income = raid ? raid.perHour : 0;

        const NAMES = ['Wood', 'Clay', 'Iron', 'Crop'];
        let body = '<tr><th></th><th>/h</th><th>Raid</th><th>24h</th></tr>';
        for (let i = 0; i < 4; i++) {
            const mark = i === 3 ? (blind ? '&le;' : guessed ? '~' : '') : '';
            const inc = raid ? raid.per[i] : 0;
            body += '<tr><td>' + NAMES[i] + '</td>' +
                    '<td class="' + (i === 3 ? cls : '') + '">' + mark + fmtNum(perHour[i]) + '</td>' +
                    '<td>' + (raid ? '+' + fmtNum(inc) : '<span class="mute">&middot;</span>') + '</td>' +
                    '<td>' + fmtShort((perHour[i] + inc) * 24) + '</td></tr>';
        }
        body += '<tr class="sum"><td>All</td><td>' + fmtNum(madeAll) + '</td>' +
                '<td>' + (raid ? '+' + fmtShort(income) : '<span class="mute">&middot;</span>') + '</td>' +
                '<td>' + fmtShort((madeAll + income) * 24) + '</td></tr>';

        return {
            body: '<table class="grid fix res">' + body + '</table>',
            help: [
                'Everything the account makes in one hour, and what that adds up to in a day.',
                '',
                'WOOD, CLAY, IRON - the game\u0027s own production numbers, added up over your ' +
                'villages.',
                '',
                'CROP - the same, minus what the troops eat: ' + fmtNum(tot[3]) + ' from the ' +
                'fields, minus ' + fmtNum(eaten) + ' for the army, leaves ' + fmtNum(net) + '. ' +
                'That last number is what actually fills the granaries.',
                '',
                guessed ? 'The game states the exact army upkeep only for the village you have ' +
                          'open. For the other ' + guessed + ' it is added up from Own troops ' +
                          '(which does include troops out in the field) times the crop each unit ' +
                          'eats. The ~ marks that those villages were added up rather than read.'
                        : '',
                guessed ? '' : '',
                (checkName && Math.abs(checkCounted - checkMeasured) > Math.max(20, checkMeasured * 0.03))
                    ? 'Check, in the one village where both numbers exist: ' + checkName +
                      ' adds up to ' + fmtNum(checkCounted) + ' crop from the troop list, while ' +
                      'the game says it really eats ' + fmtNum(checkMeasured) + '. A gap that ' +
                      'size means my crop-per-unit figures are off for some unit, so treat the ' +
                      '~ villages as being out by about as much.' : '',
                (checkName && Math.abs(checkCounted - checkMeasured) > Math.max(20, checkMeasured * 0.03))
                    ? '' : '',
                blind ? blind + ' village(s) have no upkeep figure at all yet, so crop is only an ' +
                        'upper bound - open them once and it becomes exact.' : '',
                blind ? '' : '',
                raid ? 'RAID - what the farm lists bring in an hour. Each target says what it has ' +
                       'hauled in total and over how many raids, so its average haul is known; ' +
                       'those are added up per list and multiplied by how often the list can go ' +
                       'at its red mark. From ' + raid.known + ' of ' + raid.slots + ' targets - ' +
                       'a target that has never raided counts as nothing.'
                     : 'RAID - no target has hauled anything yet, so there is nothing to average.',
                '',
                'Note: this assumes the lists run around the clock. They do not run while you ' +
                'sleep, so the raid figure is a ceiling, not what you will really see in a day.',
                '',
                'The split between the four resources comes from each target\u0027s most recent ' +
                'raid, which the farm list does report per resource. One raid says little about ' +
                'how much a target pays, which is why the size still comes from its average - ' +
                'but it says plenty about what it pays in, and crop is usually the smallest ' +
                'share.',
                '',
                '24H - production plus raids, times 24.',
                '',
                'Read at ' + clockAt(prod.at) + '.'
            ].filter((x, i, a) => x !== '' || (a[i - 1] !== '' && a[i - 1] !== undefined)).join('\u000a')
        };
    }

    // The village the Travel time panel is measuring from, reused so there is not a second
    // village picker to keep in step.
    function flyOrigin() {
        if (!vcoords) return null;
        const list = villagesInOrder();
        return list.find(v => v.id === settings.flyFrom) || list[0] || null;
    }

    function viewInactive(now) {
        // The same village picker as the Travel time panel, and the same setting behind it,
        // so the two can never disagree about where you are measuring from.
        const villages = villagesInOrder();
        const picker = villages.length > 1
            ? '<div class="fly"><select data-fly="from">' + villages.map(v =>
                  '<option value="' + v.id + '"' + (settings.flyFrom === v.id ? ' selected' : '') +
                  '>' + esc(v.name) + '</option>').join('') + '</select></div>'
            : '';

        if (loadingAfk) {
            return { body: picker + '<div class="empty">Searching&hellip;' +
                           (afkPage > 1 ? ' page ' + afkPage : '') + '</div>' };
        }
        if (!afk || !afk.rows) {
            return { body: picker + '<div class="empty">' + (afkError ? esc(afkError) + '<br>' : '') +
                           '<button data-afkgo="1">Search</button></div>',
                     help: 'Asks travcotools.com for villages that have not grown, around your ' +
                           'village. One request, only when you press the button.' };
        }

        // Which of these are already in a farm list is the whole point of the panel, and it
        // is something their page cannot answer unless you register with them. A list the
        // game sent collapsed carries no targets, so it cannot be checked - counted and said
        // out loud rather than passed off as "not in a list".
        const mine = new Set();
        const blindLists = [];
        if (cache) {
            for (const l of cache.lists) {
                if (!l.exact && l.slots > 0) { blindLists.push(l.name); continue; }
                for (const t of (l.targets || [])) mine.add(t.mapId);
            }
        }

        const m = cache ? deriveMap(cache.lists) : null;
        const rows = afk.rows.map(r => Object.assign({}, r, {
            dist: m ? mapDist({ x: afk.from.x, y: afk.from.y }, { x: r.x, y: r.y }, m) : r.theirDist,
            known: mine.has(r.mapId)
        })).sort((a, b) => (a.known - b.known) || (a.dist - b.dist));

        const fresh = rows.filter(r => !r.known);
        const knownCount = rows.length - fresh.length;
        const showKnown = !!settings.afkKnown;
        const shown = (showKnown ? rows : fresh).slice(0, 40);   // the box scrolls
        if (!shown.length && !knownCount) return { body: '<div class="empty">Nothing found.</div>' };

        let body = shown.map(r =>
            '<tr' + (r.known ? ' class="dim"' : '') + '>' +
            '<td title="' + esc(r.village + ' - ' + r.player + ' - [' + r.x + '|' + r.y + ']' +
                               (r.known ? ' - already in a list' : '')) + '">' +
            '<a class="lnk" target="_blank" rel="noopener" href="/karte.php?d=' + r.mapId +
            '" data-afk="' + r.x + '|' + r.y + '">' +
            (r.known ? '&#10003; ' : '') + esc(r.village) + '</a></td>' +
            '<td>' + fmtNum(r.pop) + '</td>' +
            '<td>' + r.dist.toFixed(1) + '</td></tr>').join('');

        // The notes live under the scrolling box, not in it, so they stay in sight.
        let foot = '';
        if (knownCount) {
            foot += '<div class="foot"><button class="lnk" data-afkknown="1">' + knownCount +
                    ' already in a farm list &mdash; ' + (showKnown ? 'hide' : 'show') +
                    '</button></div>';
        }
        if (afk.host && afk.host !== String(location.host)) {
            foot += '<div class="foot"><span class="bad">These results are from ' + esc(afk.host) +
                    ', not from this world.</span> Clear the server id in Settings and press the ' +
                    'arrow &mdash; empty means the world is worked out from the address.</div>';
        }
        if (afk.from.id !== (flyOrigin() || {}).id) {
            foot += '<div class="foot">searched from ' + esc(afk.from.name) +
                    ' &mdash; press the arrow to search from ' +
                    esc((flyOrigin() || {}).name || '') + '</div>';
        }
        if (blindLists.length) {
            foot += '<div class="foot">' + blindLists.length +
                    ' list(s) collapsed in game, so their targets could not be checked: ' +
                    esc(blindLists.join(', ')) + '</div>';
        }

        return {
            body: picker +
                  '<div class="scrollbox"><table class="grid fix afk">' +
                  '<tr><th>Village</th><th>Pop</th><th>Away</th></tr>' + body + '</table></div>' +
                  foot,
            help: [
                'Villages near ' + afk.from.name + ' whose population has not moved - the ones ' +
                'worth farming.',
                '',
                'The list comes from travcotools.com, not from the game: the script asks it for ' +
                'the search you set up in Settings (server, days flat, how far, how big) and ' +
                'reads the answer. It only asks when you press the arrow.',
                '',
                'AWAY is fields from ' + afk.from.name + ', measured the same way the raid maths ' +
                'measures it, not the distance their page prints.',
                '',
                'Every village is checked against your own farm lists. The ones you already ' +
                'farm are hidden and counted at the bottom - press that line to see them, they ' +
                'come with a tick. Your lists are something their page cannot see unless you ' +
                'register with them.',
                '',
                blindLists.length
                    ? 'Careful: ' + blindLists.length + ' of your lists were collapsed when the ' +
                      'game sent them, so the game did not send their targets and those cannot ' +
                      'be checked. Expand them in the farm list and press reload if a village ' +
                      'here looks familiar.'
                    : '',
                blindLists.length ? '' : '',
                'A name is a link: it opens that village on the map in a new tab, and at the ' +
                'same time drops its coordinates into the Travel time panel, which then says ' +
                'how long each of your units would need.',
                '',
                'The village at the top is where the search is centred - the same one the ' +
                'Travel time panel measures from. Change it and press the arrow to search again.',
                '',
                fmtNum(afk.rows.length) + ' villages read from ' + fmtNum(afk.pages || 1) +
                ' page(s), ' + fmtNum(rows.length - fresh.length) + ' of them already in a list. ' +
                'How many pages to read is in Settings. Searched at ' + clockAt(afk.at) + '.'
            ].join('\u000a')
        };
    }

    function viewFly(now) {
        const villages = [];
        if (vcoords) {
            for (const v of villagesInOrder()) villages.push(v);
        }
        const head = '<div class="fly">' +
            '<select data-fly="from">' + villages.map(v =>
                '<option value="' + v.id + '"' + (settings.flyFrom === v.id ? ' selected' : '') + '>' +
                esc(v.name) + '</option>').join('') + '</select>' +
            '<input data-fly="to" placeholder="x|y" value="' + esc(settings.flyTo || '') + '">' +
            '</div>';
        const notes = speedNotes((cache && cache.lists.length) ? cache.lists[0].tribe : 0);
        const help = [
            'Click any target in the game and this follows it, or type the coordinates.',
            '',
            'Speeds are the game\u0027s own unit table for your tribe, multiplied by the speed ' +
            'of this world (x' + worldSpeed() + '). A flight the script measured only overrides ' +
            'the table when it comes out faster - an item or an artefact can do that, while a ' +
            'slower reading only ever means the measurement caught a wave that had left earlier.',
            notes.length ? '' : '',
            notes.length ? 'Measured differently: ' + notes.join('; ') + '.' : '',
            '',
            'Beyond 20 fields the Tournament Square percentage from Settings is applied to the ' +
            'rest of the journey.',
            '',
            'Which units are listed is in Settings.'
        ].filter(Boolean).join('\u000a');

        if (!villages.length) {
            return { body: head + '<div class="empty">No village coordinates yet &mdash; open any game page once.</div>',
                     help, suffix: '' };
        }

        const from = villages.find(v => v.id === settings.flyFrom) || villages[0];
        const to = parseCoords(settings.flyTo || '');
        if (!to) {
            return { body: head + '<div class="empty">Click a village, oasis or report in the game, ' +
                           'or type <b>-196|-33</b>.</div>', help, suffix: '' };
        }

        const m = deriveMap(cache.lists);
        if (!m) return { body: head + '<div class="empty">Map width not known yet.</div>', help, suffix: '' };
        const dist = mapDist({ x: from.x, y: from.y }, to, m);

        const tribe = (cache.lists.find(l => l.villageId === from.id) || cache.lists[0] || {}).tribe;
        const sp = speedsFor(tribe);
        const units = Object.keys(sp).map(Number).sort((a2, b2) => a2 - b2)
            .filter(u => !settings.flyUnits || settings.flyUnits.indexOf(u) !== -1);

        if (!units.length) {
            return { body: head + '<div class="empty">No unit speeds measured yet.</div>', help, suffix: '' };
        }

        const rows = units.map(u => {
            const ow = flyTime(dist, sp[u], tsPct(from.id));
            return '<tr><td>' + esc(unitName(tribe, u)) + '</td>' +
                   '<td>' + esc(fmtDur(ow)) + '</td><td>' + esc(fmtDur(2 * ow)) + '</td></tr>';
        }).join('');

        return {
            body: head + '<span class="cap2">' + dist.toFixed(1) + ' fields from ' +
                  esc(from.name) + '</span>' +
                  '<table class="grid"><tr><th>Unit</th><th>One way</th><th>Return</th></tr>' +
                  rows + '</table>',
            help: help + ' ' + dist.toFixed(2) + ' fields from ' + from.name + '.',
            suffix: ' &middot; ' + dist.toFixed(1) + ' fields'
        };
    }

    function viewDetail(now) {
        const l = cache.lists.find(x => x.id === openInfo);
        if (!l) return { body: '<div class="empty">Click a list name in the green Farm lists panel.</div>', suffix: '' };
        const d = infoPanel(l, speedsFor(l.tribe), now);
        // Without a window title the body has to say which list this is.
        return { body: '<span class="cap2">' + esc(l.name) + '</span>' + d.html, help: d.help };
    }

    // ---------- render ----------
    function windowContent(key, now) {
        if (!cache) {
            return { body: '<div class="empty">' + (lastError ? 'Error: ' + esc(lastError) : 'Loading&hellip;') + '</div>' };
        }
        if (key === 'lists') {
            return { body: listRows(now), suffix: '', help: [
                'How long ago each farm list was last sent.',
                '',
                'Green up to the yellow mark, amber after it, red after the red mark. Both marks ' +
                'are minutes and you set them per list in Settings.',
                '',
                'The bar underneath fills up as the red mark gets closer.',
                '',
                'The coloured dot says which village the list belongs to.',
                '',
                'Click a list name to open its own numbers: how often it can go, what it pays, ' +
                'how long the round trip is.'
            ].join('\u000a') };
        }
        if (key === 'spare') {
            const sp = spareRows(now);
            return sp ? { body: sp.html, help: sp.help + (sp.why ? ' ' + sp.why : '') }
                      : { body: '<div class="empty">No list with slots to plan around.</div>' };
        }
        if (key === 'slots') {
            const sl = slotRows();
            return sl ? { body: sl.html, help: sl.help, suffix: ' &middot; median ' + fmtNum(sl.med) }
                      : { body: '<div class="empty">Not enough raided slots yet.</div>', suffix: '' };
        }
        if (key === 'loot') {
            return { body: viewLoot(now),
                     help: [
                         'The fattest hauls in your newest attack reports - where a manual attack ' +
                         'is worth sending.',
                         '',
                         'The number is what came home from that village.',
                         '',
                         'A mark in front of it means the troops came home full, so there was ' +
                         'more left behind than they could carry.',
                         '',
                         'The small time is how long ago that haul was, so a village hit long ago ' +
                         'has had time to fill up again.'
                     ].join('\u000a') };
        }
        if (key === 'training') return viewTraining(now);
        if (key === 'prod') return viewProduction(now);
        if (key === 'afk') return viewInactive(now);
        if (key === 'fly') return viewFly(now);
        if (key === 'detail') return viewDetail(now);
        if (key === 'config') return { body: viewConfig() };
        return { body: '' };
    }

    function drawWindow(win, now) {
        const key = win.def.key;
        win.gt.textContent = win.def.title;
        const due = cache ? cache.lists.filter(l =>
            visible(l) && l.last && (now - l.last) >= thresholds(l.id).alert).length : 0;

        if (key === 'hub') {
            win.grip.title = win.def.hint;
            const rl = win.root.querySelector('[data-act="refresh"]');
            // Colouring the button says "press me" without a sentence explaining it.
            if (rl) {
                const old = movementsStale();
                rl.classList.toggle('hot', old);
                rl.title = old ? 'Troop movements are old or unread - press to read them'
                               : 'Reload lists and movements';
            }
            // Hue stays the panel's identity in every state. An overdue list is a red badge
            // on the one button it concerns, not a repaint of the strip.
            win.dock.innerHTML = WINDOWS.filter(d => d.key !== 'hub').map(d => {
                const on = winState(d.key).open;
                const badge = (d.key === 'lists' && due) ? '<span class="alarm">' + due + '</span>' : '';
                return '<span class="dockwrap"><button data-open="' + d.key + '" title="' +
                       esc(d.title + ' \u2013 ' + d.hint) + '" class="' + (on ? 'on' : '') +
                       '" style="border-bottom-color:' + d.col + (on ? ';background:' + d.col + '22' : '') +
                       '">' + d.icon + '</button>' + badge + '</span>';
            }).join('');
            return;
        }

        // The timer breathes while a list is overdue; nothing else changes colour.
        win.panel.classList.toggle('alert', key === 'lists' && due > 0);

        const c = windowContent(key, now);
        win.grip.title = win.def.title;
        // Everything that used to be printed under the numbers now lives on this one
        // question mark, so the panel stays a table.
        // Hovering was useless here: the game reloads under the cursor and the native
        // tooltip goes with it. So the question mark is a switch - it swaps the numbers for
        // the explanation until it is pressed again.
        const helpOn = !!(settings.help && settings.help[key] && c.help);
        const why = win.root.querySelector('.why');
        if (why) {
            why.hidden = !c.help;
            why.title = helpOn ? 'Back to the numbers' : 'What am I looking at?';
            why.classList.toggle('on', helpOn);
        }

        // Redrawing the body while the player is typing in it destroys the field under
        // their hands, which is why the settings and the coordinate box could not be
        // filled in at all.
        const ae = win.root.activeElement;
        if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;

        if (helpOn) {
            const txt = esc(String(c.help).replace(/&[a-z]+;/g, ' '));
            if (win.body.dataset.help !== txt) {
                const old = win.body.querySelector('.hlp');
                const keep = old ? old.scrollTop : 0;
                win.body.innerHTML = '<div class="hlp">' + txt + '</div>';
                win.body.dataset.help = txt;
                win.body.dataset.sig = '';
                const box = win.body.querySelector('.hlp');
                if (box && keep) box.scrollTop = keep;      // a changed line must not eject the reader
            }
            return;
        }
        win.body.dataset.help = '';
        // The panel is redrawn every few seconds. Rewriting a body that has not changed
        // threw away whatever the player had scrolled to, so it is only written when the
        // markup really differs - and even then the scroll position is put back.
        if (win.body.dataset.sig !== c.body) {
            const box = win.body.querySelector('.scrollbox');
            const keep = box ? box.scrollTop : 0;
            win.body.innerHTML = c.body;
            win.body.dataset.sig = c.body;
            const now2 = win.body.querySelector('.scrollbox');
            if (now2 && keep) now2.scrollTop = keep;
        }
    }

    // Any village whose lists are shown but whose movements were never read, or read too
    // long ago. Drives the colour of the reload button.
    function movementsStale() {
        if (!cache) return false;
        const vids = [];
        for (const l of cache.lists) if (visible(l) && vids.indexOf(l.villageId) === -1) vids.push(l.villageId);
        if (!vids.length) return false;
        const now = serverNow();
        return vids.some(v => !runs[v] || now - runs[v].at > RUN_TTL);
    }

    // Panels stack into one column under the hub instead of floating in three corners.
    // A window the player drags away from the column is left where they put it.
    const GAP = 6;

    function ensureDock(which) {
        const key = which === 2 ? 'flTimerDock2' : 'flTimerDock';
        let el = which === 2 ? dockEl2 : dockEl;
        if (el && el.isConnected) return el;
        el = document.createElement('div');
        el.id = key;
        el.style.cssText = 'position:fixed;z-index:2147483000;display:flex;' +
            'flex-direction:column;gap:6px;overflow-y:auto;overflow-x:hidden;' +
            'scrollbar-width:thin;';
        document.body.appendChild(el);
        if (which === 2) dockEl2 = el; else dockEl = el;
        return el;
    }

    function layout() {
        const hub = wins.hub;
        if (!hub) return;
        // A viewport that reports no size yet (still loading, or a hidden tab) would place
        // the columns at a nonsense spot.
        const vw = window.innerWidth, vh = window.innerHeight;
        if (!(vw > 200) || !(vh > 200)) return;

        const W = 228, GAP2 = 6;
        const hs = winState('hub');
        const left = Math.max(8, Math.min(hs.pos ? hs.pos.left : vw - W - 12, vw - W - 8));
        const top = Math.max(8, Math.min(hs.pos ? hs.pos.top : 12, vh - 60));
        const room = Math.max(120, vh - top - 8);

        const a = ensureDock(1), b = ensureDock(2);
        // The overflow goes to the OPPOSITE edge of the page, so it never walks across the
        // middle of the game. On a screen too narrow for two columns there is no second
        // column at all and the first one scrolls instead.
        const toRight = left + W / 2 > vw / 2;
        const other = toRight ? 8 : vw - W - 8;
        const canSplit = Math.abs(other - left) >= W + GAP2;

        const docked = [];
        for (const def of WINDOWS) {
            const win = wins[def.key];
            if (!win) continue;
            if (def.key !== 'hub' && winState(def.key).free) {
                if (win.host.parentNode !== document.body) document.body.appendChild(win.host);
                win.host.style.position = 'fixed';
                continue;
            }
            win.host.style.position = 'static';
            win.host.style.left = '';
            win.host.style.top = '';
            docked.push(win.host);
        }

        // Fill the first column to the bottom of the screen, then start the second one.
        const first = [], second = [];
        let used = 0;
        for (const host of docked) {
            const h = host.offsetHeight || 0;
            if (canSplit && first.length && used + h > room) second.push(host);
            else { first.push(host); used += h + GAP2; }
        }

        // Moving a node re-creates its layout and drops focus, so a column is only rebuilt
        // when its contents actually changed.
        const fill = (el, list) => {
            let same = el.children.length === list.length;
            if (same) for (let i = 0; i < list.length; i++) if (el.children[i] !== list[i]) { same = false; break; }
            if (!same) for (const h of list) el.appendChild(h);
        };
        fill(a, first);
        fill(b, second);

        a.style.left = left + 'px';
        a.style.top = top + 'px';
        a.style.maxHeight = room + 'px';
        b.style.left = other + 'px';
        b.style.top = top + 'px';
        b.style.maxHeight = room + 'px';
        b.style.display = second.length ? 'flex' : 'none';
    }

    function render() {
        const now = serverNow();
        for (let i = 0; i < WINDOWS.length; i++) {
            const def = WINDOWS[i];
            const open = winState(def.key).open;
            if (!open) {
                if (wins[def.key]) { wins[def.key].host.remove(); delete wins[def.key]; }
                continue;
            }
            if (!wins[def.key]) wins[def.key] = makeWindow(def, i);
            drawWindow(wins[def.key], now);
        }
        layout();
    }

    // ---------- events ----------
    function bindWindow(win) {
        win.root.addEventListener('click', e => {
            const openEl = e.target.closest('[data-open]');
            if (openEl) {
                const k = openEl.dataset.open;
                const st = winState(k);
                st.open = !st.open;
                persist();
                if (st.open && k === 'loot' && !loot && !loadingLoot) loadLoot();
                else if (st.open && k === 'training' && !training && !loadingTrain) loadTraining();
                else if (st.open && k === 'prod' && !prod && !loadingProd) loadProduction();
                else if (st.open && k === 'afk' && !afk && !loadingAfk) loadInactive();
                else render();
                return;
            }

            const infoEl = e.target.closest('[data-info]');
            if (infoEl) {
                const id = Number(infoEl.dataset.info);
                openInfo = (openInfo === id) ? 0 : id;
                settings.openInfo = openInfo;
                winState('detail').open = !!openInfo;
                persist();
                if (openInfo) ensureTotals();
                render();
                return;
            }

            if (e.target.closest('[data-loot]')) { loadLoot(); return; }
            if (e.target.closest('[data-train]')) { loadTraining(); return; }
            if (e.target.closest('[data-prod]')) { loadProduction(); return; }
            if (e.target.closest('[data-afkgo]')) { loadInactive(); return; }
            if (e.target.closest('[data-afkknown]')) {
                settings.afkKnown = !settings.afkKnown;
                persist();
                render();
                return;
            }
            const afkEl = e.target.closest('[data-afk]');
            if (afkEl) {
                // No automation: the link is a plain link the player clicked, and the panel
                // only fills in the coordinates they would otherwise have typed. Redrawing is
                // left to the next tick so it cannot interfere with opening the link.
                settings.flyTo = afkEl.dataset.afk;
                winState('fly').open = true;
                persist();
                setTimeout(render, 0);
                return;
            }
            if (e.target.closest('[data-act="why"]')) {
                settings.help = settings.help || {};
                settings.help[win.def.key] = !settings.help[win.def.key];
                persist();
                render();
                return;
            }
            const runEl = e.target.closest('[data-run]');
            if (runEl && !runEl.disabled) { loadRun(); return; }

            const actEl = e.target.closest('[data-act]');
            const act = actEl && actEl.dataset.act;

            // Reload now does the lot: farm lists first, then movements and the training
            // queues for whichever village the game currently has open.
            if (act === 'refresh') {
                refresh().then(loadRun);
                if (winState('loot').open) loadLoot();
                if (winState('training').open) loadTraining();
                if (winState('prod').open) loadProduction();
                return;
            }
            if (act === 'reload') {
                if (win.def.key === 'loot') loadLoot();
                else if (win.def.key === 'training') loadTraining();
                else if (win.def.key === 'prod') loadProduction();
                else if (win.def.key === 'afk') { afk = null; loadInactive(); }
                return;
            }
            if (act === 'tidy') {
                for (const def of WINDOWS) {
                    const st = winState(def.key);
                    if (def.key !== 'hub') { st.free = false; delete st.pos; }
                }
                persist();
                render();
                return;
            }
            if (act === 'perm') {
                try {
                    if (typeof Notification !== 'undefined') Notification.requestPermission().then(() => render());
                } catch {}
                return;
            }

            const bulkEl = e.target.closest('[data-bulk]');
            const bulk = bulkEl && bulkEl.dataset.bulk;
            if (bulk === 'clear') { settings.perList = {}; }
            else if (bulk === 'none' && cache) { settings.hidden = cache.lists.map(l => l.id); }
            else if (bulk === 'all') { settings.hidden = []; settings.hiddenVillages = []; }
            else return;
            persist();
            checkAlerts(true);
            render();
        });

        const onField = e => {
            const fly = e.target.closest('[data-fly]');
            if (fly) {
                if (fly.dataset.fly === 'to') settings.flyTo = fly.value;
                else settings.flyFrom = Number(fly.value);
                persist(); render();
                return;
            }

            const ts = e.target.closest('input[data-ts]');
            if (ts) {
                settings.tsPct = settings.tsPct || {};
                const n = parseFloat(ts.value);
                if (!isNaN(n) && n >= 100) settings.tsPct[ts.dataset.ts] = n;
                else delete settings.tsPct[ts.dataset.ts];
                persist(); render();
                return;
            }

            const cb = e.target.closest('input[data-id]');
            if (cb) {
                const id = Number(cb.dataset.id);
                settings.hidden = cb.checked ? settings.hidden.filter(x => x !== id) : settings.hidden.concat(id);
                persist(); checkAlerts(true); render();
                return;
            }

            const vb = e.target.closest('input[data-vid]');
            if (vb) {
                const vid = Number(vb.dataset.vid);
                settings.hiddenVillages = vb.checked
                    ? settings.hiddenVillages.filter(x => x !== vid)
                    : settings.hiddenVillages.concat(vid);
                persist(); checkAlerts(true); render();
                return;
            }

            const un = e.target.closest('input[data-unit]');
            if (un) {
                const u = Number(un.dataset.unit);
                const cur = settings.flyUnits || [];
                settings.flyUnits = un.checked ? cur.concat(u).filter((x, i, arr) => arr.indexOf(x) === i)
                                               : cur.filter(x => x !== u);
                persist(); render();
                return;
            }

            const thr = e.target.closest('input[data-thr]');
            if (thr) {
                const id = Number(thr.dataset.tid);
                const key = thr.dataset.thr;
                const o = settings.perList[id] || {};
                if (thr.value === '') delete o[key];
                else {
                    const n = parseFloat(thr.value);
                    if (!isNaN(n) && n >= 0) o[key] = n;
                }
                if (Object.keys(o).length) settings.perList[id] = o;
                else delete settings.perList[id];
                settings.notified = [];
                persist(); checkAlerts(true); render();
                return;
            }

            const f = e.target.closest('[data-set]');
            if (!f) return;
            const key = f.dataset.set;
            if (f.type === 'checkbox') settings[key] = f.checked;
            else if (f.dataset.text !== undefined) settings[key] = String(f.value).trim();
            else {
                const n = parseFloat(f.value);
                if (!isNaN(n) && n >= 0) settings[key] = n;
            }
            settings.notified = [];
            persist(); checkAlerts(true); render();
        };
        win.root.addEventListener('change', onField);

        // Dragging by the title bar; each window keeps its own position.
        let sx, sy, st0, sl0, active = false;
        win.head.addEventListener('mousedown', e => {
            if (e.target.closest('button')) return;
            const r = win.host.getBoundingClientRect();
            // A window in the column has no position of its own, so it is lifted out of the
            // column before it can follow the mouse.
            if (win.def.key !== 'hub' && win.host.parentNode !== document.body) {
                document.body.appendChild(win.host);
                win.host.style.position = 'fixed';
                win.host.style.left = r.left + 'px';
                win.host.style.top = r.top + 'px';
            }
            sx = e.clientX; sy = e.clientY; st0 = r.top; sl0 = r.left;
            active = true;
            e.preventDefault();
        });
        const move = e => {
            if (!active) return;
            const top = Math.max(0, st0 + e.clientY - sy);
            const left = Math.max(0, sl0 + e.clientX - sx);
            // Dragging the hub drags the whole column, since the hub sits inside it.
            if (win.def.key === 'hub') {
                winState('hub').pos = { top: Math.round(top), left: Math.round(left) };
                layout();
                return;
            }
            win.host.style.top = top + 'px';
            win.host.style.left = left + 'px';
        };
        const up = () => {
            if (!active) return;
            active = false;
            const r = win.host.getBoundingClientRect();

            if (win.def.key === 'hub') {
                // The hub snaps flush to whichever side edge it was dropped near, and the
                // whole column follows it.
                let left = Math.round(r.left);
                if (left < 40) left = 8;
                else if (window.innerWidth - r.right < 40) left = Math.round(window.innerWidth - r.width - 8);
                winState('hub').pos = { top: Math.round(r.top), left };
            } else {
                const st = winState(win.def.key);
                // Dropped back in line with either column: rejoin. Dropped elsewhere: stay.
                const cols = [dockEl, dockEl2]
                    .filter(d => d && d.isConnected && d.style.display !== 'none')
                    .map(d => d.getBoundingClientRect().left);
                const col = cols.length ? cols.reduce((p, c) =>
                    Math.abs(c - r.left) < Math.abs(p - r.left) ? c : p) : null;
                if (col !== null && Math.abs(r.left - col) < 60) { st.free = false; delete st.pos; }
                else { st.free = true; st.pos = { top: Math.round(r.top), left: Math.round(r.left) }; }
            }
            persist();
            render();
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    }

    async function refresh() {
        try {
            cache = await fetchData();
            learnFromLists(cache.lists);
            save(LS_CACHE, cache);
            lastError = null;
        } catch (e) {
            lastError = e.message;
        }
        // The cadence on each row needs the troop totals, so keep them warm even when the
        // farm list page itself failed. ensureTotals has its own TTL, so this is not spam.
        if (cache) ensureTotals();
        checkAlerts();
        render();
    }

    // ---------- coordinates the player points at ----------
    // The game marks coordinates the same way everywhere it shows them — a .coordinateX
    // and .coordinateY pair — so one listener covers the map, reports and the village
    // list. Read-only: it never touches the click, only notices where it landed.
    function coordsFromNode(node) {
        if (!node || !node.closest) return null;

        // A coordinate block inside what was clicked counts only when it is the ONLY one
        // there: that is a tile or a row. Accepting any descendant would let a click on
        // empty space match the first pair on the page — the village list, say — and set
        // a target at random. Otherwise look upwards, for a click on the numbers.
        const SEL = '.coordinatesWrapper, .coordinates';
        // A click on the page background is not a click on a target, whatever the page
        // happens to contain.
        const big = node === document.body || node === document.documentElement;
        const inside = (!big && node.querySelectorAll) ? node.querySelectorAll(SEL) : [];
        const w = inside.length === 1 ? inside[0] : node.closest(SEL);
        if (w) {
            const cx = w.querySelector('.coordinateX');
            const cy = w.querySelector('.coordinateY');
            if (cx && cy) {
                const mx = plain(cx.textContent).match(/-?\d+/);
                const my = plain(cy.textContent).match(/-?\d+/);
                if (mx && my) return { x: Number(mx[0]), y: Number(my[0]) };
            }
        }

        // These sit on the element itself, so walking up cannot pick up a stranger.
        for (let el = node; el && el !== document.documentElement; el = el.parentElement) {
            if (el.dataset && el.dataset.x !== undefined && el.dataset.y !== undefined) {
                const x = parseInt(el.dataset.x, 10), y = parseInt(el.dataset.y, 10);
                if (!isNaN(x) && !isNaN(y)) return { x, y };
            }
            const href = el.getAttribute && el.getAttribute('href');
            if (href) {
                const mx = href.match(/[?&#]x=(-?\d+)/), my = href.match(/[?&#]y=(-?\d+)/);
                if (mx && my) return { x: Number(mx[1]), y: Number(my[1]) };
            }
        }
        return null;
    }

    // The map's own jump box is the other place a coordinate is stated outright.
    function coordsFromMapBox() {
        const xi = document.querySelector('input#xCoordInput, input[name="xCoord"], input[name="x"]');
        const yi = document.querySelector('input#yCoordInput, input[name="yCoord"], input[name="y"]');
        if (!xi || !yi) return null;
        const x = parseInt(xi.value, 10), y = parseInt(yi.value, 10);
        return (isNaN(x) || isNaN(y)) ? null : { x, y };
    }

    function pickCoords(c) {
        if (!c) return;
        const txt = c.x + '|' + c.y;
        if (settings.flyTo === txt) return;
        settings.flyTo = txt;
        persist();
        if (winState('fly').open) render();
    }

    document.addEventListener('click', e => {
        if (!winState('fly').open) return;
        if (e.target && e.target.id && String(e.target.id).indexOf('flTimerHost') === 0) return;
        pickCoords(coordsFromNode(e.target) || coordsFromMapBox());
    }, true);

    // Clicking a map tile opens the game's own preview, and the coordinates only appear
    // once that has rendered — which is after the click has already been handled. Reading
    // the map's coordinate box for a moment afterwards catches it. This touches nothing but
    // the page that is already loaded: no requests, and only while the window is open.
    document.addEventListener('click', () => {
        if (!winState('fly').open) return;
        let n = 0;
        const t = setInterval(() => {
            if (++n > 6 || !winState('fly').open) { clearInterval(t); return; }
            pickCoords(coordsFromMapBox());
        }, 250);
    }, true);

    // ---------- start ----------
    try {
        // One-off cleanup: an earlier version shipped 1460 as the default CONTENTS of the
        // override field, so every world saved it as if the player had typed it - and an
        // override beats the world the address says. Anything that looks like that leftover
        // goes; a value the player really chose is left alone.
        if (!settings.travcoFixed) {
            const auto = travcoAuto();
            if (String(settings.travcoServer) === '1460' && auto && auto !== 1460) {
                settings.travcoServer = '';
            }
            settings.travcoFixed = 1;
            persist();
        }

        learnCoords(document.documentElement.innerHTML);
        learnCrop();
        const inline = parseGame(document.documentElement.innerHTML);
        if (inline) { cache = inline; learnFromLists(cache.lists); save(LS_CACHE, cache); }
        if (cache) ensureTotals();
        checkAlerts(true);
        render();
        if (!inline) refresh();

        setInterval(refresh, REFRESH_MS);
        setInterval(() => { checkAlerts(); tabAlert(); render(); }, TICK_MS);
        console.log('[flTimer] panel rendered' + (inline ? ' (data from page)' : ' (fetching)'));
    } catch (e) {
        console.error('[flTimer] startup failed:', e);
    }
})();
