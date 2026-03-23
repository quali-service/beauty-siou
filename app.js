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

// Finder steps: each step asks a question and narrows down procedures
const FINDER_STEPS = [
    {
        id: 'zone',
        question: 'Quelle zone souhaitez-vous traiter ?',
        options: ['Visage', 'Corps', 'Mains & Ongles', 'Cheveux & Cuir chevelu']
    },
    {
        id: 'concern',
        question: 'Quel est votre principal objectif ?',
        options: ['Hydratation & Éclat', 'Anti-âge & Fermeté', 'Relaxation & Bien-être', 'Correction & Soin ciblé']
    },
    {
        id: 'frequency',
        question: 'À quelle fréquence souhaitez-vous venir ?',
        options: ['Une fois (occasion spéciale)', 'Une fois par mois', 'Toutes les deux semaines', 'Cure intensive']
    }
];

let finderAnswers = {};
let currentStep = 0;

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
        btn.classList.toggle('bg-rose-500', sId === sectionId);
        btn.classList.toggle('text-white', sId === sectionId);
        btn.classList.toggle('text-slate-500', sId !== sectionId);
    });

    if (sectionId === 'finder-section') renderFinderStep();
    if (sectionId === 'booking-section') loadPractitioners();
};

// --- 4. FINDER ---

function renderFinderStep() {
    const content = document.getElementById('finder-content');
    const results = document.getElementById('finder-results');
    if (!content) return;

    results.classList.add('hidden');
    content.classList.remove('hidden');

    const step = FINDER_STEPS[currentStep];
    const progress = ((currentStep) / FINDER_STEPS.length) * 100;
    document.getElementById('finder-progress-bar').style.width = `${progress}%`;

    // Update step dots
    FINDER_STEPS.forEach((_, i) => {
        const dot = document.getElementById(`step-dot-${i + 1}`);
        if (dot) {
            dot.classList.toggle('bg-rose-400', i <= currentStep);
            dot.classList.toggle('w-4', i === currentStep);
            dot.classList.toggle('bg-slate-200', i > currentStep);
        }
    });

    content.innerHTML = `
        <span class="inline-block px-3 py-1 rounded-full bg-rose-50 text-rose-500 text-[10px] font-bold uppercase tracking-widest mb-4">
            Étape ${currentStep + 1} / ${FINDER_STEPS.length}
        </span>
        <h2 class="text-xl font-extrabold text-slate-800 leading-tight mb-8">${step.question}</h2>
        <div class="space-y-3">
            ${step.options.map((opt, i) => `
                <button onclick="selectFinderOption('${step.id}', '${opt}')"
                    class="w-full text-left flex items-center gap-4 p-4 border-2 border-slate-100 rounded-2xl hover:border-rose-300 hover:bg-rose-50/40 transition-all group">
                    <div class="w-5 h-5 border-2 border-slate-300 rounded-full flex-shrink-0 group-hover:border-rose-400 transition-all"></div>
                    <span class="text-slate-700 font-medium text-sm group-hover:text-rose-700">${opt}</span>
                </button>
            `).join('')}
        </div>
        ${currentStep > 0 ? `
        <button onclick="prevFinderStep()" class="mt-6 flex items-center gap-2 text-slate-400 hover:text-slate-600 text-sm font-semibold transition-all">
            ← Retour
        </button>` : ''}
    `;
}

window.selectFinderOption = function(stepId, value) {
    finderAnswers[stepId] = value;
    if (currentStep < FINDER_STEPS.length - 1) {
        currentStep++;
        renderFinderStep();
    } else {
        showFinderResults();
    }
};

window.prevFinderStep = function() {
    if (currentStep > 0) {
        currentStep--;
        renderFinderStep();
    }
};

async function showFinderResults() {
    const content = document.getElementById('finder-content');
    const results = document.getElementById('finder-results');
    const loading = document.getElementById('finder-loading');

    content.classList.add('hidden');
    loading.classList.remove('hidden');
    document.getElementById('finder-progress-bar').style.width = '100%';

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/procedures?select=*`, { headers: HEADERS });
        const procedures = await res.json() || [];

        // Filter by zone answer (category match)
        const zone = finderAnswers['zone'] || '';
        const matched = procedures.filter(p =>
            !zone || (p.category || '').toLowerCase().includes(zone.split(' ')[0].toLowerCase())
        );
        const display = matched.length > 0 ? matched : procedures;

        loading.classList.add('hidden');
        results.classList.remove('hidden');

        results.innerHTML = `
            <div class="mb-6">
                <span class="inline-block px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-widest mb-3">Résultats</span>
                <h2 class="text-xl font-extrabold text-slate-800">Soins recommandés pour vous</h2>
                <p class="text-sm text-slate-400 mt-1">D'après votre profil : <strong>${zone}</strong> · <strong>${finderAnswers['concern'] || ''}</strong></p>
            </div>
            <div class="space-y-3 mb-6">
                ${display.map(p => `
                    <div class="flex items-start gap-4 p-4 bg-white border-2 border-rose-100 rounded-2xl">
                        <div class="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center flex-shrink-0 text-xl">💆</div>
                        <div class="flex-1 min-w-0">
                            <h3 class="font-bold text-slate-800">${escapeHtml(p.name)}</h3>
                            ${p.category ? `<span class="text-[10px] font-bold text-rose-400 uppercase tracking-wider">${escapeHtml(p.category)}</span>` : ''}
                            ${p.description ? `<p class="text-sm text-slate-500 mt-1">${escapeHtml(p.description)}</p>` : ''}
                            ${p.duration_minutes ? `<p class="text-xs text-slate-400 mt-1">⏱ ${p.duration_minutes} min</p>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
            <button onclick="showSection('booking-section')"
                class="w-full py-4 bg-rose-500 text-white font-bold rounded-2xl hover:bg-rose-600 active:scale-[0.98] transition-all shadow-lg shadow-rose-100">
                Réserver avec un praticien →
            </button>
            <button onclick="restartFinder()" class="w-full mt-3 py-3 text-slate-400 hover:text-slate-600 text-sm font-semibold transition-all">
                Recommencer le questionnaire
            </button>
        `;
    } catch (err) {
        loading.classList.add('hidden');
        results.classList.remove('hidden');
        results.innerHTML = `<p class="text-rose-500 text-center p-8">Erreur de connexion. Veuillez réessayer.</p>`;
    }
}

window.restartFinder = function() {
    finderAnswers = {};
    currentStep = 0;
    document.getElementById('finder-results').classList.add('hidden');
    document.getElementById('finder-content').classList.remove('hidden');
    document.getElementById('finder-progress-bar').style.width = '0%';
    renderFinderStep();
};

// --- 5. PRACTITIONERS ---

async function loadPractitioners() {
    const grid = document.getElementById('practitioners-grid');
    if (!grid) return;
    grid.innerHTML = `<div class="flex justify-center p-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-400"></div></div>`;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/practitioners?select=*,practitioner_procedures(procedure_id,procedures(name))`, { headers: HEADERS });
        allPractitioners = await res.json() || [];
        await loadProcedureFilters();
        renderPractitioners(allPractitioners);
    } catch (err) {
        grid.innerHTML = `<p class="text-rose-500 text-center p-8">Erreur de connexion.</p>`;
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
        c.classList.remove('bg-rose-500', 'text-white', 'shadow-sm');
        c.classList.add('bg-white', 'text-slate-500', 'border', 'border-slate-200');
    });
    btn.classList.remove('bg-white', 'text-slate-500', 'border', 'border-slate-200');
    btn.classList.add('bg-rose-500', 'text-white', 'shadow-sm');

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
        <div class="group flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 hover:border-rose-200 hover:shadow-md transition-all">
            <div class="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl">🧖</div>
            <div class="flex-1 min-w-0">
                <h3 class="font-bold text-slate-800">${escapeHtml(p.name)}</h3>
                ${p.bio ? `<p class="text-sm text-slate-400 truncate">${escapeHtml(p.bio)}</p>` : ''}
                ${procedures.length > 0 ? `
                <div class="flex flex-wrap gap-1 mt-1.5">
                    ${procedures.map(pr => `<span class="px-2 py-0.5 bg-rose-50 text-rose-400 text-[10px] font-bold rounded-full">${escapeHtml(pr)}</span>`).join('')}
                </div>` : ''}
            </div>
            <button onclick="openBookingModal(${p.id}, '${escapeHtml(p.name)}')"
                class="flex-shrink-0 px-4 py-2 bg-rose-500 text-white text-sm font-bold rounded-xl hover:bg-rose-600 active:scale-95 transition-all shadow-sm">
                Réserver
            </button>
        </div>`;
    }).join('');
}

// --- 6. BOOKING MODAL ---

window.openBookingModal = function(practitionerId, practitionerName) {
    currentPractitioner = { id: practitionerId, name: practitionerName };
    document.getElementById('booking-practitioner-info').innerHTML = `
        <div class="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-xl">🧖</div>
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

    const activeClass = 'flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all bg-rose-500 text-white shadow-sm';
    const inactiveClass = 'flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all bg-slate-100 text-slate-500 hover:bg-slate-200';
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
            const payload = {
                name: formData.get('name'),
                category: formData.get('category'),
                description: formData.get('description'),
                duration_minutes: formData.get('duration_minutes') ? parseInt(formData.get('duration_minutes')) : null,
                created_at: new Date().toISOString()
            };
            try {
                btn.disabled = true;
                btn.textContent = 'Envoi... ⏳';
                const res = await fetch(`${SUPABASE_URL}/rest/v1/procedures`, {
                    method: 'POST',
                    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error("Erreur lors de l'enregistrement");
                alert('Soin ajouté !');
                e.target.reset();
            } catch (err) {
                alert('Erreur : ' + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Enregistrer le soin';
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
