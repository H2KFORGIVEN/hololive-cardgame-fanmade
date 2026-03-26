import { renderTierView } from './components/tier-view.js';
import { renderDeckModal } from './components/deck-view.js';
import { renderCardGallery, renderCardDetail } from './components/card-view.js';
import { renderTournamentView, renderTournamentDeckModal } from './components/tournament-view.js';
import { renderGuidesView } from './components/guides-view.js';
import { initI18n, setLang, getLang, getSupportedLangs, applyStaticTranslations } from './i18n.js';

let cardsData = [];
let tierData = null;
let decksData = [];
let decklogDecks = [];
let allGuides = [];
let currentView = 'tiers';
let filters = { color: 'all', type: 'all', search: '' };

async function loadData() {
  const [cardsResp, tierResp, decksResp, decklogResp, guidesResp] = await Promise.all([
    fetch('data/cards.json').then(r => r.ok ? r.json() : []),
    fetch('data/tier_list.json').then(r => r.ok ? r.json() : null),
    fetch('data/decks.json').then(r => r.ok ? r.json() : []),
    fetch('data/decklog_decks.json').then(r => r.ok ? r.json() : []),
    fetch('data/all_guides.json').then(r => r.ok ? r.json() : []),
  ]);
  cardsData = cardsResp;
  tierData = tierResp;
  decksData = decksResp;
  decklogDecks = decklogResp;
  allGuides = guidesResp;
}

function render() {
  const tiersView = document.getElementById('tiersView');
  const guidesView = document.getElementById('guidesView');
  const tournamentView = document.getElementById('tournamentView');
  const cardsView = document.getElementById('cardsView');
  const cardSearchGroup = document.getElementById('cardSearchGroup');
  const cardTypeGroup = document.getElementById('cardTypeGroup');

  tiersView.classList.toggle('active', currentView === 'tiers');
  guidesView.classList.toggle('active', currentView === 'guides');
  tournamentView.classList.toggle('active', currentView === 'tournament');
  cardsView.classList.toggle('active', currentView === 'cards');
  cardSearchGroup.style.display = currentView === 'cards' ? 'flex' : 'none';
  cardTypeGroup.style.display = currentView === 'cards' ? 'flex' : 'none';

  if (currentView === 'tiers') {
    renderTierView(tiersView, tierData, decksData);
  } else if (currentView === 'guides') {
    renderGuidesView(guidesView, allGuides, decksData);
  } else if (currentView === 'tournament') {
    renderTournamentView(tournamentView, decklogDecks, cardsData);
  } else {
    renderCardGallery(cardsView, cardsData, filters);
  }
}

function renderLangSwitcher() {
  const container = document.getElementById('langSwitcher');
  const current = getLang();
  container.innerHTML = getSupportedLangs().map(({ code, label }) =>
    `<button class="lang-btn${code === current ? ' active' : ''}" data-lang="${code}">${label}</button>`
  ).join('');

  container.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setLang(btn.dataset.lang);
      applyStaticTranslations();
      renderLangSwitcher();
      render();
    });
  });
}

function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      render();
    });
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

  document.addEventListener('click', (e) => {
    const tournamentDeckCard = e.target.closest('.tournament-deck-card');
    if (tournamentDeckCard) {
      const decklogId = tournamentDeckCard.dataset.decklogId;
      renderTournamentDeckModal(deckModalBody, decklogId, decklogDecks, cardsData);
      deckModal.hidden = false;
      document.body.style.overflow = 'hidden';
      return;
    }

    const deckCard = e.target.closest('.deck-card');
    if (deckCard) {
      const deckId = deckCard.dataset.deckId;
      renderDeckModal(deckModalBody, deckId, tierData, decksData);
      deckModal.hidden = false;
      document.body.style.overflow = 'hidden';
      return;
    }

    const galleryCard = e.target.closest('.gallery-card');
    if (galleryCard) {
      const cardId = galleryCard.dataset.cardId;
      const card = cardsData.find(c => c.id === cardId);
      renderCardDetail(cardModalBody, card);
      cardModal.hidden = false;
      document.body.style.overflow = 'hidden';
      return;
    }
  });

  for (const modal of [deckModal, cardModal]) {
    modal.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      modal.hidden = true;
      document.body.style.overflow = '';
    });
    modal.querySelector('.modal-close')?.addEventListener('click', () => {
      modal.hidden = true;
      document.body.style.overflow = '';
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      deckModal.hidden = true;
      cardModal.hidden = true;
      document.body.style.overflow = '';
    }
  });
}

async function init() {
  initI18n();
  await loadData();
  renderLangSwitcher();
  applyStaticTranslations();
  setupNav();
  setupFilters();
  setupModals();
  render();
}

init();
