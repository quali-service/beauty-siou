// --- 1. SUPABASE CONFIG ---
const SUPABASE_URL = "https://ryhlhhfiffgzmpaxdmbe.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5aGxoaGZpZmZnem1wYXhkbWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODM2MDQsImV4cCI6MjA4OTM1OTYwNH0.-XTLc6CbEEGbZs9MH2dlz9uYsmBW1vw0mmCniGS-E1Y";

const HEADERS = {
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json'
};

// --- 2. STATE ---
let allPractitioners = [];
let procedureFilter = null;
let currentPractitioner = null;

let lookupCache = {};
let selectedIds = { indications: new Set(), zones: new Set(), technologies: new Set() };
let ratings = { invasivite: 0, douleur: 0 };

let allFinderProcedures = [];
let finderFilters = {
    zones: new Set(),
    indications: new Set(),
    technologies: new Set(),
    duree_eviction: new Set(),
    duree_effets: new Set(),
    prix_indicatifs: new Set(),
    delai_apparition: new Set(),
    invasivite_max: 0,
    douleur_max: 0
};
let labelMaps = { zones: {}, indications: {}, technologies: {}, durees_eviction: {}, durees_effets: {}, prix_indicatifs: {} };

// --- 3. NAVIGATION ---

window.showSection = function(sectionId) {
    const sections = ['finder-section', 'booking-section', 'admin-section'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', id !== sectionId);
    });

    const navMap = {
        'finder-section': 'nav-finder',
        'booking-section': 'nav-booking',
        'admin-section': 'nav-admin'
    };

    Object.entries(navMap).forEach(([sId, btnId]) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.classList.toggle('bg-blue-50', sId === sectionId);
        btn.classList.toggle('text-blue-700', sId === sectionId);
        btn.classList.toggle('font-semibold', sId === sectionId);
        btn.classList.toggle('text-slate-500', sId !== sectionId);
    });

    if (sectionId === 'finder-section') loadFinderData();
    if (sectionId === 'booking-section') loadPractitioners();
    if (sectionId === 'admin-section') initProcedureForm();
};

// --- 3b. PROCEDURE FORM LOOKUPS ---

async function loadAllLookups() {
    const tables = ['indications', 'zones', 'technologies', 'durees_eviction', 'durees_effets', 'prix_indicatifs', 'delais_apparition'];
    await Promise.all(tables.map(async (table) => {
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id,label&order=label`, { headers: HEADERS });
            lookupCache[table] = await res.json() || [];
        } catch (e) {
            console.error(`[loadAllLookups] ${table}`, e);
            lookupCache[table] = [];
        }
    }));
}

function renderChips(containerId, table) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const items = lookupCache[table] || [];
    const selected = selectedIds[table];

    container.innerHTML = items.map(item => {
        const isSelected = selected && selected.has(item.id);
        const activeClasses = 'border-blue-500 bg-blue-50 text-blue-700';
        const inactiveClasses = 'border-slate-200 text-slate-500 hover:border-blue-300';
        return `<button type="button"
            onclick="toggleChip('${table}', ${item.id}, this)"
            class="px-3 py-1.5 rounded-full border-2 text-xs font-semibold transition-all ${isSelected ? activeClasses : inactiveClasses}">
            ${escapeHtml(item.label)}
        </button>`;
    }).join('') + `<button type="button"
        onclick="addLookupValue('${table}')"
        class="px-3 py-1.5 rounded-full border-2 border-dashed border-slate-300 text-slate-400 text-xs font-semibold hover:border-blue-400 hover:text-blue-500 transition-all">
        + Ajouter
    </button>`;
}

function renderSelect(selectId, table) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const items = lookupCache[table] || [];
    select.innerHTML = '<option value="">-- Choisir --</option>' +
        items.map(item => `<option value="${item.id}">${escapeHtml(item.label)}</option>`).join('');
}

function renderRating(containerId, field) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const current = ratings[field] || 0;
    container.innerHTML = [1, 2, 3, 4, 5].map(n => {
        const isActive = n <= current;
        const activeClasses = 'border-blue-600 bg-blue-600 text-white';
        const inactiveClasses = 'border-slate-200 text-slate-400 hover:border-blue-300';
        return `<button type="button"
            onclick="setRating('${field}', ${n})"
            class="w-9 h-9 rounded-full border-2 text-sm font-bold transition-all flex items-center justify-center ${isActive ? activeClasses : inactiveClasses}">
            ${n}
        </button>`;
    }).join('');
}

window.toggleChip = function(table, id, btn) {
    const set = selectedIds[table];
    if (!set) return;
    if (set.has(id)) {
        set.delete(id);
        btn.className = btn.className
            .replace('border-blue-500', 'border-slate-200')
            .replace('bg-blue-50', '')
            .replace('text-blue-700', 'text-slate-500 hover:border-blue-300');
    } else {
        set.add(id);
        btn.className = btn.className
            .replace('border-slate-200', 'border-blue-500')
            .replace('text-slate-500', 'text-blue-700')
            .replace('hover:border-blue-300', '')
            .replace('  ', ' ');
        if (!btn.className.includes('bg-blue-50')) {
            btn.className = btn.className.replace('border-blue-500', 'border-blue-500 bg-blue-50');
        }
    }
};

window.setRating = function(field, value) {
    ratings[field] = value;
    renderRating(`${field}-rating`, field);
};

window.addLookupValue = async function(table) {
    const label = prompt('Nouveau libellé :');
    if (!label || !label.trim()) return;
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
            method: 'POST',
            headers: { ...HEADERS, 'Prefer': 'return=representation' },
            body: JSON.stringify({ label: label.trim() })
        });
        if (!res.ok) throw new Error('Erreur lors de la création');
        const [newItem] = await res.json();

        if (!lookupCache[table]) lookupCache[table] = [];
        lookupCache[table].push(newItem);
        lookupCache[table].sort((a, b) => a.label.localeCompare(b.label));

        const chipsMap = {
            indications: 'indications-chips',
            zones: 'zones-chips',
            technologies: 'technologies-chips'
        };
        const selectMap = {
            durees_eviction: 'duree-eviction-select',
            durees_effets: 'duree-effets-select',
            prix_indicatifs: 'prix-indicatif-select',
            delais_apparition: 'delai-apparition-select'
        };

        if (chipsMap[table]) {
            renderChips(chipsMap[table], table);
            selectedIds[table].add(newItem.id);
            renderChips(chipsMap[table], table);
        } else if (selectMap[table]) {
            renderSelect(selectMap[table], table);
            const select = document.getElementById(selectMap[table]);
            if (select) select.value = newItem.id;
        }
    } catch (err) {
        alert('Erreur : ' + err.message);
    }
};

async function initProcedureForm() {
    selectedIds = { indications: new Set(), zones: new Set(), technologies: new Set() };
    ratings = { invasivite: 0, douleur: 0 };

    await loadAllLookups();

    renderChips('indications-chips', 'indications');
    renderChips('zones-chips', 'zones');
    renderChips('technologies-chips', 'technologies');
    renderSelect('duree-eviction-select', 'durees_eviction');
    renderSelect('duree-effets-select', 'durees_effets');
    renderSelect('prix-indicatif-select', 'prix_indicatifs');
    renderSelect('delai-apparition-select', 'delais_apparition');
    renderRating('invasivite-rating', 'invasivite');
    renderRating('douleur-rating', 'douleur');
}

// --- 4. FINDER ---

async function loadFinderData() {
    const list = document.getElementById('finder-results-list');
    if (!list) return;
    list.innerHTML = `<div class="flex justify-center p-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>`;

    try {
        const select = [
            'id,name,invasivite,douleur,note_communaute,description,deroulement,recommandations_post_op,resultats_attendus,frequence_entretien,contre_indications',
            'durees_eviction(id,label)',
            'durees_effets(id,label)',
            'prix_indicatifs(id,label)',
            'delais_apparition(id,label)',
            'procedures_zones(zone_id,zones(id,label))',
            'procedures_indications(indication_id,indications(id,label))',
            'procedures_technologies(technologie_id,technologies(id,label))'
        ].join(',');

        const res = await fetch(`${SUPABASE_URL}/rest/v1/procedures?select=${encodeURIComponent(select)}`, { headers: HEADERS });
        allFinderProcedures = await res.json() || [];

        buildLabelMaps();
        renderAllFilters();
        renderFinderResults(allFinderProcedures);
    } catch (err) {
        list.innerHTML = `<p class="text-red-500 text-center p-8">Erreur de connexion.</p>`;
    }
}

function buildLabelMaps() {
    labelMaps = { zones: {}, indications: {}, technologies: {}, durees_eviction: {}, durees_effets: {}, prix_indicatifs: {}, delais_apparition: {} };
    allFinderProcedures.forEach(p => {
        (p.procedures_zones || []).forEach(pz => { if (pz.zones) labelMaps.zones[pz.zone_id] = pz.zones.label; });
        (p.procedures_indications || []).forEach(pi => { if (pi.indications) labelMaps.indications[pi.indication_id] = pi.indications.label; });
        (p.procedures_technologies || []).forEach(pt => { if (pt.technologies) labelMaps.technologies[pt.technologie_id] = pt.technologies.label; });
        if (p.durees_eviction) labelMaps.durees_eviction[p.durees_eviction.id] = p.durees_eviction.label;
        if (p.durees_effets) labelMaps.durees_effets[p.durees_effets.id] = p.durees_effets.label;
        if (p.prix_indicatifs) labelMaps.prix_indicatifs[p.prix_indicatifs.id] = p.prix_indicatifs.label;
        if (p.delais_apparition) labelMaps.delais_apparition[p.delais_apparition.id] = p.delais_apparition.label;
    });
}

function getFilteredProcedures(excludeDimension = null) {
    return allFinderProcedures.filter(p => {
        if (excludeDimension !== 'zones' && finderFilters.zones.size > 0) {
            const ids = (p.procedures_zones || []).map(pz => pz.zone_id);
            if (!ids.some(id => finderFilters.zones.has(id))) return false;
        }
        if (excludeDimension !== 'indications' && finderFilters.indications.size > 0) {
            const ids = (p.procedures_indications || []).map(pi => pi.indication_id);
            if (!ids.some(id => finderFilters.indications.has(id))) return false;
        }
        if (excludeDimension !== 'technologies' && finderFilters.technologies.size > 0) {
            const ids = (p.procedures_technologies || []).map(pt => pt.technologie_id);
            if (!ids.some(id => finderFilters.technologies.has(id))) return false;
        }
        if (excludeDimension !== 'duree_eviction' && finderFilters.duree_eviction.size > 0) {
            if (!p.durees_eviction || !finderFilters.duree_eviction.has(p.durees_eviction.id)) return false;
        }
        if (excludeDimension !== 'duree_effets' && finderFilters.duree_effets.size > 0) {
            if (!p.durees_effets || !finderFilters.duree_effets.has(p.durees_effets.id)) return false;
        }
        if (excludeDimension !== 'prix_indicatifs' && finderFilters.prix_indicatifs.size > 0) {
            if (!p.prix_indicatifs || !finderFilters.prix_indicatifs.has(p.prix_indicatifs.id)) return false;
        }
        if (excludeDimension !== 'delai_apparition' && finderFilters.delai_apparition.size > 0) {
            if (!p.delais_apparition || !finderFilters.delai_apparition.has(p.delais_apparition.id)) return false;
        }
        if (excludeDimension !== 'invasivite_max' && finderFilters.invasivite_max > 0) {
            if (!p.invasivite || p.invasivite > finderFilters.invasivite_max) return false;
        }
        if (excludeDimension !== 'douleur_max' && finderFilters.douleur_max > 0) {
            if (!p.douleur || p.douleur > finderFilters.douleur_max) return false;
        }
        return true;
    });
}

function getAvailableIds(dimension) {
    const procs = getFilteredProcedures(dimension);
    const ids = new Set();
    procs.forEach(p => {
        if (dimension === 'zones') (p.procedures_zones || []).forEach(pz => ids.add(pz.zone_id));
        else if (dimension === 'indications') (p.procedures_indications || []).forEach(pi => ids.add(pi.indication_id));
        else if (dimension === 'technologies') (p.procedures_technologies || []).forEach(pt => ids.add(pt.technologie_id));
        else if (dimension === 'duree_eviction') { if (p.durees_eviction) ids.add(p.durees_eviction.id); }
        else if (dimension === 'duree_effets') { if (p.durees_effets) ids.add(p.durees_effets.id); }
        else if (dimension === 'prix_indicatifs') { if (p.prix_indicatifs) ids.add(p.prix_indicatifs.id); }
        else if (dimension === 'delai_apparition') { if (p.delais_apparition) ids.add(p.delais_apparition.id); }
    });
    return ids;
}

function renderFilterChips(containerId, dimension, labelMap, activeSet) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const available = getAvailableIds(dimension);
    if (available.size === 0) {
        container.innerHTML = '<span class="text-xs text-slate-300">—</span>';
        return;
    }
    container.innerHTML = [...available].map(id => {
        const label = labelMap[id] || id;
        const isActive = activeSet.has(id);
        return `<button type="button" onclick="toggleFinderFilter('${dimension}', ${id})"
            class="px-2.5 py-1 rounded-full border text-xs font-semibold transition-all ${
                isActive
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600'
            }">${escapeHtml(label)}</button>`;
    }).join('');
}

function renderFilterRating(containerId, field, currentMax) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = [1, 2, 3, 4, 5].map(n => `
        <button type="button" onclick="setFinderRatingFilter('${field}', ${n})"
            class="w-8 h-8 rounded-full border text-xs font-bold transition-all ${
                currentMax >= n
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 text-slate-400 hover:border-blue-300'
            }">${n}</button>
    `).join('');
}

function renderAllFilters() {
    renderFilterChips('filter-zones', 'zones', labelMaps.zones, finderFilters.zones);
    renderFilterChips('filter-indications', 'indications', labelMaps.indications, finderFilters.indications);
    renderFilterChips('filter-technologies', 'technologies', labelMaps.technologies, finderFilters.technologies);
    renderFilterChips('filter-prix', 'prix_indicatifs', labelMaps.prix_indicatifs, finderFilters.prix_indicatifs);
    renderFilterChips('filter-eviction', 'duree_eviction', labelMaps.durees_eviction, finderFilters.duree_eviction);
    renderFilterChips('filter-effets', 'duree_effets', labelMaps.durees_effets, finderFilters.duree_effets);
    renderFilterChips('filter-delai', 'delai_apparition', labelMaps.delais_apparition, finderFilters.delai_apparition);
    renderFilterRating('filter-invasivite', 'invasivite_max', finderFilters.invasivite_max);
    renderFilterRating('filter-douleur', 'douleur_max', finderFilters.douleur_max);
}

window.toggleFinderFilter = function(dimension, id) {
    const set = finderFilters[dimension];
    if (set.has(id)) set.delete(id);
    else set.add(id);
    renderAllFilters();
    renderFinderResults(getFilteredProcedures());
};

window.setFinderRatingFilter = function(field, value) {
    finderFilters[field] = finderFilters[field] === value ? 0 : value;
    renderAllFilters();
    renderFinderResults(getFilteredProcedures());
};

window.resetFinderFilters = function() {
    finderFilters = {
        zones: new Set(), indications: new Set(), technologies: new Set(),
        duree_eviction: new Set(), duree_effets: new Set(), prix_indicatifs: new Set(),
        delai_apparition: new Set(),
        invasivite_max: 0, douleur_max: 0
    };
    renderAllFilters();
    renderFinderResults(allFinderProcedures);
};

function renderDots(value) {
    if (!value) return '<span class="text-slate-300 text-xs">—</span>';
    return [1, 2, 3, 4, 5].map(n =>
        `<span class="w-2 h-2 rounded-full inline-block ${n <= value ? 'bg-blue-500' : 'bg-slate-200'}"></span>`
    ).join('');
}

function renderFinderResults(procedures) {
    const list = document.getElementById('finder-results-list');
    const countEl = document.getElementById('finder-results-count');
    if (!list) return;

    if (countEl) countEl.textContent = `${procedures.length} procédure${procedures.length !== 1 ? 's' : ''} trouvée${procedures.length !== 1 ? 's' : ''}`;

    if (procedures.length === 0) {
        list.innerHTML = `<div class="text-center p-12 text-slate-400">
            <p class="text-4xl mb-3">🔍</p>
            <p class="font-semibold">Aucun résultat</p>
            <p class="text-sm mt-1">Essayez d'élargir vos filtres.</p>
        </div>`;
        return;
    }

    list.innerHTML = procedures.map(p => {
        const zones = (p.procedures_zones || []).map(pz => pz.zones?.label).filter(Boolean);
        const indications = (p.procedures_indications || []).map(pi => pi.indications?.label).filter(Boolean);
        const technologies = (p.procedures_technologies || []).map(pt => pt.technologies?.label).filter(Boolean);

        const tags = [
            ...zones.map(l => `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-500">${escapeHtml(l)}</span>`),
            ...indications.map(l => `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-500">${escapeHtml(l)}</span>`),
            ...technologies.map(l => `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600">${escapeHtml(l)}</span>`)
        ].join('');

        return `<div class="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-200 hover:shadow-sm transition-all">
            <h3 class="font-bold text-slate-800 text-base mb-2">${escapeHtml(p.name)}</h3>
            ${tags ? `<div class="flex flex-wrap gap-1 mb-3">${tags}</div>` : ''}
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs text-slate-500">
                ${p.prix_indicatifs ? `<div><span class="text-slate-400">Prix </span><span class="font-semibold text-slate-700">${escapeHtml(p.prix_indicatifs.label)}</span></div>` : ''}
                ${p.durees_eviction ? `<div><span class="text-slate-400">Éviction </span><span class="font-semibold text-slate-700">${escapeHtml(p.durees_eviction.label)}</span></div>` : ''}
                ${p.durees_effets ? `<div><span class="text-slate-400">Effets </span><span class="font-semibold text-slate-700">${escapeHtml(p.durees_effets.label)}</span></div>` : ''}
                ${p.delais_apparition ? `<div><span class="text-slate-400">Délai résultats </span><span class="font-semibold text-slate-700">${escapeHtml(p.delais_apparition.label)}</span></div>` : ''}
                ${p.invasivite ? `<div class="flex items-center gap-1.5"><span class="text-slate-400">Invasivité </span><span class="flex gap-0.5">${renderDots(p.invasivite)}</span></div>` : ''}
                ${p.douleur ? `<div class="flex items-center gap-1.5"><span class="text-slate-400">Douleur </span><span class="flex gap-0.5">${renderDots(p.douleur)}</span></div>` : ''}
                ${p.note_communaute != null ? `<div><span class="text-slate-400">Note de la communauté </span><span class="font-semibold text-blue-700">${p.note_communaute}%</span></div>` : ''}
            </div>
            ${[
                { label: 'Description', value: p.description },
                { label: 'Déroulement', value: p.deroulement },
                { label: 'Fréquence & Entretien', value: p.frequence_entretien },
                { label: 'Contre-indications majeures', value: p.contre_indications },
                { label: 'Recommandations post-op', value: p.recommandations_post_op },
                { label: 'Résultats attendus', value: p.resultats_attendus }
            ].filter(f => f.value).map(f => `
                <div class="mt-3 pt-3 border-t border-slate-100">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">${f.label}</p>
                    <p class="text-sm text-slate-600">${escapeHtml(f.value)}</p>
                </div>
            `).join('')}
        </div>`;
    }).join('');
}

// --- 5. PRACTITIONERS ---

async function loadPractitioners() {
    const grid = document.getElementById('practitioners-grid');
    if (!grid) return;
    grid.innerHTML = `<div class="flex justify-center p-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>`;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/practitioners?select=*,practitioner_procedures(procedure_id,procedures(name))`, { headers: HEADERS });
        allPractitioners = await res.json() || [];
        await loadProcedureFilters();
        renderPractitioners(allPractitioners);
    } catch (err) {
        grid.innerHTML = `<p class="text-red-500 text-center p-8">Erreur de connexion.</p>`;
    }
}

async function loadProcedureFilters() {
    const container = document.getElementById('procedure-filters');
    if (!container) return;
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/procedures?select=id,name`, { headers: HEADERS });
        const procedures = await res.json() || [];
        const chips = procedures.map(p => `
            <button onclick="setProcedureFilter(${p.id}, this)"
                class="procedure-chip flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all bg-white text-slate-500 border border-slate-200 hover:border-rose-300">
                ${escapeHtml(p.name)}
            </button>`).join('');
        // Keep the "Tous" button and append procedure chips
        const allBtn = container.querySelector('button');
        if (allBtn) allBtn.insertAdjacentHTML('afterend', chips);
    } catch (e) { console.error('[loadProcedureFilters]', e); }
}

window.setProcedureFilter = function(procedureId, btn) {
    procedureFilter = procedureId;
    document.querySelectorAll('.procedure-chip').forEach(c => {
        c.classList.remove('bg-blue-600', 'text-white');
        c.classList.add('bg-white', 'text-slate-500', 'border', 'border-slate-200');
    });
    btn.classList.remove('bg-white', 'text-slate-500', 'border', 'border-slate-200');
    btn.classList.add('bg-blue-600', 'text-white');

    const filtered = procedureId
        ? allPractitioners.filter(p =>
            (p.practitioner_procedures || []).some(pp => pp.procedure_id === procedureId)
          )
        : allPractitioners;
    renderPractitioners(filtered);
};

function renderPractitioners(list) {
    const grid = document.getElementById('practitioners-grid');
    if (!grid) return;
    if (!list || list.length === 0) {
        grid.innerHTML = `<p class="text-center text-slate-400 p-12">Aucun praticien trouvé.</p>`;
        return;
    }
    grid.innerHTML = list.map(p => {
        const procedures = (p.practitioner_procedures || [])
            .map(pp => pp.procedures?.name)
            .filter(Boolean);
        return `
        <div class="group flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-200 hover:shadow-sm transition-all">
            <div class="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0 text-xl">🧑‍⚕️</div>
            <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-slate-800">${escapeHtml(p.name)}</h3>
                ${p.bio ? `<p class="text-sm text-slate-400 truncate">${escapeHtml(p.bio)}</p>` : ''}
                ${procedures.length > 0 ? `
                <div class="flex flex-wrap gap-1 mt-1.5">
                    ${procedures.map(pr => `<span class="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-medium rounded-full">${escapeHtml(pr)}</span>`).join('')}
                </div>` : ''}
            </div>
            <button onclick="openBookingModal(${p.id}, '${escapeHtml(p.name)}')"
                class="flex-shrink-0 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:scale-95 transition-all">
                Réserver
            </button>
        </div>`;
    }).join('');
}

// --- 6. BOOKING MODAL ---

window.openBookingModal = function(practitionerId, practitionerName) {
    currentPractitioner = { id: practitionerId, name: practitionerName };
    document.getElementById('booking-practitioner-info').innerHTML = `
        <div class="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-xl">🧑‍⚕️</div>
        <div>
            <p class="font-bold text-slate-800">${escapeHtml(practitionerName)}</p>
            <p class="text-xs text-slate-400">Sélectionnez une date ci-dessous</p>
        </div>
    `;
    // Set min date to today
    const dateInput = document.querySelector('#booking-form [name="preferred_date"]');
    if (dateInput) dateInput.min = new Date().toISOString().split('T')[0];

    document.getElementById('booking-modal').classList.remove('hidden');
};

window.closeBookingModal = function() {
    document.getElementById('booking-modal').classList.add('hidden');
    document.getElementById('booking-form').reset();
    currentPractitioner = null;
};

// --- 7. ADMIN ---

window.switchAdminTab = function(tab) {
    const isPractitioners = tab === 'practitioners';
    document.getElementById('admin-procedures').classList.toggle('hidden', isPractitioners);
    document.getElementById('admin-practitioners').classList.toggle('hidden', !isPractitioners);

    const activeClass = 'flex-1 py-2 rounded-lg text-sm font-semibold transition-all bg-white text-slate-800 shadow-sm';
    const inactiveClass = 'flex-1 py-2 rounded-lg text-sm font-semibold transition-all text-slate-500 hover:text-slate-700';
    document.getElementById('tab-procedures').className = isPractitioners ? inactiveClass : activeClass;
    document.getElementById('tab-practitioners').className = isPractitioners ? activeClass : inactiveClass;
};

// --- 8. UTILS ---

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// --- 9. INIT ---

document.addEventListener('DOMContentLoaded', () => {

    // Booking form submit
    const bookingForm = document.getElementById('booking-form');
    if (bookingForm) {
        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentPractitioner) return;
            const btn = document.getElementById('booking-submit-btn');
            const formData = new FormData(e.target);
            const payload = {
                practitioner_id: currentPractitioner.id,
                client_name: formData.get('client_name'),
                client_email: formData.get('client_email'),
                preferred_date: formData.get('preferred_date'),
                message: formData.get('message') || null,
                created_at: new Date().toISOString()
            };
            try {
                btn.disabled = true;
                btn.textContent = 'Envoi... ⏳';
                const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
                    method: 'POST',
                    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error('Erreur lors de la réservation');
                window.closeBookingModal();
                alert('Réservation confirmée ! Vous recevrez une confirmation par email.');
            } catch (err) {
                alert('Erreur : ' + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Confirmer la réservation';
            }
        });
    }

    // Procedure form submit
    const procedureForm = document.getElementById('procedure-form');
    if (procedureForm) {
        procedureForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('procedure-submit-btn');
            const formData = new FormData(e.target);

            const noteCommunaute = formData.get('note_communaute');
            const payload = {
                name: formData.get('name'),
                duree_eviction_id: formData.get('duree_eviction_id') || null,
                duree_effets_id: formData.get('duree_effets_id') || null,
                prix_indicatif_id: formData.get('prix_indicatif_id') || null,
                invasivite: ratings.invasivite || null,
                douleur: ratings.douleur || null,
                note_communaute: noteCommunaute !== '' ? parseFloat(noteCommunaute) : null,
                description: formData.get('description') || null,
                deroulement: formData.get('deroulement') || null,
                recommandations_post_op: formData.get('recommandations_post_op') || null,
                resultats_attendus: formData.get('resultats_attendus') || null,
                delai_apparition_id: formData.get('delai_apparition_id') || null,
                frequence_entretien: formData.get('frequence_entretien') || null,
                contre_indications: formData.get('contre_indications') || null,
                created_at: new Date().toISOString()
            };

            try {
                btn.disabled = true;
                btn.textContent = 'Envoi... ⏳';

                const res = await fetch(`${SUPABASE_URL}/rest/v1/procedures`, {
                    method: 'POST',
                    headers: { ...HEADERS, 'Prefer': 'return=representation' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error("Erreur lors de l'enregistrement");
                const [newProcedure] = await res.json();
                const procedureId = newProcedure.id;

                // Insert junction records in parallel
                const junctionInserts = [];
                if (selectedIds.indications.size > 0) {
                    const rows = [...selectedIds.indications].map(id => ({ procedure_id: procedureId, indication_id: id }));
                    junctionInserts.push(fetch(`${SUPABASE_URL}/rest/v1/procedures_indications`, {
                        method: 'POST',
                        headers: { ...HEADERS, 'Prefer': 'return=minimal' },
                        body: JSON.stringify(rows)
                    }));
                }
                if (selectedIds.zones.size > 0) {
                    const rows = [...selectedIds.zones].map(id => ({ procedure_id: procedureId, zone_id: id }));
                    junctionInserts.push(fetch(`${SUPABASE_URL}/rest/v1/procedures_zones`, {
                        method: 'POST',
                        headers: { ...HEADERS, 'Prefer': 'return=minimal' },
                        body: JSON.stringify(rows)
                    }));
                }
                if (selectedIds.technologies.size > 0) {
                    const rows = [...selectedIds.technologies].map(id => ({ procedure_id: procedureId, technologie_id: id }));
                    junctionInserts.push(fetch(`${SUPABASE_URL}/rest/v1/procedures_technologies`, {
                        method: 'POST',
                        headers: { ...HEADERS, 'Prefer': 'return=minimal' },
                        body: JSON.stringify(rows)
                    }));
                }
                await Promise.all(junctionInserts);

                alert('Procédure ajoutée !');
                e.target.reset();
                selectedIds = { indications: new Set(), zones: new Set(), technologies: new Set() };
                ratings = { invasivite: 0, douleur: 0 };
                initProcedureForm();
            } catch (err) {
                alert('Erreur : ' + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Enregistrer la procédure';
            }
        });
    }

    // Practitioner form submit
    const practitionerForm = document.getElementById('practitioner-form');
    if (practitionerForm) {
        practitionerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('practitioner-submit-btn');
            const formData = new FormData(e.target);
            const payload = {
                name: formData.get('name'),
                bio: formData.get('bio') || null,
                email: formData.get('email') || null,
                created_at: new Date().toISOString()
            };
            try {
                btn.disabled = true;
                btn.textContent = 'Envoi... ⏳';
                const res = await fetch(`${SUPABASE_URL}/rest/v1/practitioners`, {
                    method: 'POST',
                    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error("Erreur lors de l'enregistrement");
                alert('Praticien ajouté !');
                e.target.reset();
            } catch (err) {
                alert('Erreur : ' + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Enregistrer le praticien';
            }
        });
    }

    window.showSection('finder-section');
});
