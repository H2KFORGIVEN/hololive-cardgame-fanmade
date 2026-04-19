import { renderDeckModal } from './components/deck-view.js';
import { renderCardGallery, renderCardDetail } from './components/card-view.js';
import { renderTournamentView, renderTournamentDeckModal } from './components/tournament-view.js';
import { renderGuidesView } from './components/guides-view.js';
import { renderTutorialView } from './components/tutorial-view.js';
import { initI18n, setLang, getLang, getSupportedLangs, applyStaticTranslations, t } from './i18n.js';

let cardsData = [];
let tierData = null;
let decksData = [];
let decklogDecks = [];
let allGuides = [];
let officialDecks = [];
let rulesData = null;
let currentView = 'home';
let filters = { color: 'all', type: 'all', tier: 'all', search: '' };

const _loaded = { cards: false, decklog: false };

// Cache-bust JSON fetches — browsers (and Python's http.server) don't set
// cache-control, so data/*.json can serve stale copies for hours across deploys.
// Unique per page load; within a session Electron/browser still dedupes.
const _BUST = '?v=' + Date.now();
function _fetchJSON(url) {
  const sep = url.includes('?') ? '&' : '?';
  return fetch(url + (url.endsWith('.json') ? _BUST : '')).then(r => r.ok ? r.json() : null);
}

async function loadCoreData() {
  const [tierResp, decksResp, guidesResp, officialResp, rulesResp] = await Promise.all([
    _fetchJSON('data/tier_list.json'),
    _fetchJSON('data/decks.json'),
    _fetchJSON('data/all_guides.json'),
    _fetchJSON('data/official_decks.json'),
    _fetchJSON('data/rules.json'),
  ]);
  tierData = tierResp;
  decksData = decksResp || [];
  allGuides = guidesResp || [];
  officialDecks = officialResp || [];
  rulesData = rulesResp;
}

async function ensureCards() {
  if (_loaded.cards) return;
  _loaded.cards = true;
  cardsData = (await _fetchJSON('data/cards.json')) || [];
}

async function ensureDecklog() {
  if (_loaded.decklog) return;
  _loaded.decklog = true;
  decklogDecks = (await _fetchJSON('data/decklog_decks.json')) || [];
}

async function render() {
  const guidesView = document.getElementById('guidesView');
  const tournamentView = document.getElementById('tournamentView');
  const cardsView = document.getElementById('cardsView');
  const tutorialView = document.getElementById('tutorialView');
  const tierFilterGroup = document.getElementById('tierFilterGroup');
  const cardSearchGroup = document.getElementById('cardSearchGroup');
  const cardTypeGroup = document.getElementById('cardTypeGroup');
  const cardSupportSubGroup = document.getElementById('cardSupportSubGroup');
  const filterBar = document.getElementById('filterBar');
  const homeSections = document.getElementById('homeSections');
  const carousel = document.getElementById('carousel');
  const mainContent = document.getElementById('mainContent');

  const isHome = currentView === 'home';

  // Toggle homepage vs content
  if (homeSections) homeSections.style.display = isHome ? '' : 'none';
  if (carousel) carousel.style.display = isHome ? '' : 'none';
  if (mainContent) mainContent.style.display = isHome ? 'none' : '';

  // Filter bar: show for guides/cards/tournament, hide for home/tutorial
  filterBar.style.display = (isHome || currentView === 'tutorial') ? 'none' : '';

  guidesView.classList.toggle('active', currentView === 'guides');
  tournamentView.classList.toggle('active', currentView === 'tournament');
  cardsView.classList.toggle('active', currentView === 'cards');
  tutorialView.classList.toggle('active', currentView === 'tutorial');
  tierFilterGroup.style.display = currentView === 'guides' ? 'flex' : 'none';
  cardSearchGroup.style.display = currentView === 'cards' ? 'flex' : 'none';
  cardTypeGroup.style.display = currentView === 'cards' ? 'flex' : 'none';
  // Show support subtype filter only when type=support* is selected
  const isSupportFilter = currentView === 'cards' && (filters.type === 'support' || filters.type?.startsWith('support_'));
  if (cardSupportSubGroup) cardSupportSubGroup.style.display = isSupportFilter ? 'flex' : 'none';

  if (isHome) return;

  if (currentView === 'guides') {
    await ensureCards();
    renderGuidesView(guidesView, allGuides, decksData, cardsData, filters, officialDecks);
  } else if (currentView === 'tournament') {
    await Promise.all([ensureDecklog(), ensureCards()]);
    renderTournamentView(tournamentView, decklogDecks, cardsData);
  } else if (currentView === 'tutorial') {
    renderTutorialView(tutorialView);
  } else if (currentView === 'cards') {
    await ensureCards();
    renderCardGallery(cardsView, cardsData, filters, rulesData);
  }
}

function renderLangSwitcher() {
  const container = document.getElementById('langSwitcher');
  const current = getLang();
  const dropdownBtn = document.getElementById('langDropdownBtn');

  container.innerHTML = getSupportedLangs().map(({ code, label }) =>
    `<button class="lang-btn${code === current ? ' active' : ''}" data-lang="${code}">${label}</button>`
  ).join('');

  // Update dropdown button text
  const currentLabel = getSupportedLangs().find(l => l.code === current)?.label || current;
  if (dropdownBtn) dropdownBtn.textContent = currentLabel + ' ▾';

  container.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setLang(btn.dataset.lang);
      applyStaticTranslations();
      renderLangSwitcher();
      // Close dropdown
      const menu = document.getElementById('langDropdownMenu');
      if (menu) menu.hidden = true;
      render();
    });
  });
}

function setupNav() {
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      window.scrollTo(0, 0);
      render();
    });
  });

  // Click logo to go back to home
  document.querySelector('.header-logo-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    currentView = 'home';
    window.scrollTo(0, 0);
    render();
  });
}

function setupFilters() {
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filters.color = btn.dataset.color;
      render();
    });
  });

  document.querySelectorAll('.tier-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tier-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filters.tier = btn.dataset.tier;
      render();
    });
  });

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filters.type = btn.dataset.type;
      render();
    });
  });

  let searchTimeout;
  document.getElementById('cardSearch')?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filters.search = e.target.value.trim();
      render();
    }, 300);
  });
}

function setupModals() {
  const deckModal = document.getElementById('deckModal');
  const deckModalBody = document.getElementById('deckModalBody');
  const cardModal = document.getElementById('cardModal');
  const cardModalBody = document.getElementById('cardModalBody');

  document.addEventListener('click', async (e) => {
    const clickableCard = e.target.closest('.clickable-card');
    if (clickableCard && !e.target.closest('.gallery-card')) {
      const cardId = clickableCard.dataset.cardId;
      if (cardId) {
        await ensureCards();
        const card = cardsData.find(c => c.id === cardId);
        if (card) {
          renderCardDetail(cardModalBody, card, cardsData, rulesData);
          cardModal.hidden = false;
          document.body.style.overflow = 'hidden';
          return;
        }
      }
    }

    const tournamentDeckCard = e.target.closest('.tournament-deck-card');
    if (tournamentDeckCard) {
      const decklogId = tournamentDeckCard.dataset.decklogId;
      await ensureCards();
      renderTournamentDeckModal(deckModalBody, decklogId, decklogDecks, cardsData);
      deckModal.hidden = false;
      document.body.style.overflow = 'hidden';
      return;
    }

    const deckCard = e.target.closest('.deck-card');
    if (deckCard) {
      const deckId = deckCard.dataset.deckId;
      renderDeckModal(deckModalBody, deckId, tierData, decksData, allGuides, officialDecks);
      deckModal.hidden = false;
      document.body.style.overflow = 'hidden';
      return;
    }

    const galleryCard = e.target.closest('.gallery-card');
    if (galleryCard) {
      const cardId = galleryCard.dataset.cardId;
      await ensureCards();
      const card = cardsData.find(c => c.id === cardId);
      renderCardDetail(cardModalBody, card, cardsData, rulesData);
      cardModal.hidden = false;
      document.body.style.overflow = 'hidden';
      return;
    }
  });

  function closeModal(modal) {
    modal.hidden = true;
    if (modal === cardModal && !deckModal.hidden) return;
    document.body.style.overflow = '';
  }

  for (const modal of [deckModal, cardModal]) {
    modal.querySelector('.modal-backdrop')?.addEventListener('click', () => closeModal(modal));
    modal.querySelector('.modal-close')?.addEventListener('click', () => closeModal(modal));
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!cardModal.hidden) {
        closeModal(cardModal);
      } else if (!deckModal.hidden) {
        closeModal(deckModal);
      }
    }
  });
}

function setupScrollTop() {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.hidden = window.scrollY < 600;
  }, { passive: true });
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

async function init() {
  initI18n();
  renderLangSwitcher();
  applyStaticTranslations();
  setupNav();
  setupFilters();
  setupModals();
  setupScrollTop();
  await loadCoreData();
  render();
}

init();
