import { CARD_TYPE, isSupport, isMember, isOshi, isCheer } from './constants.js';

let _cards = null;
let _byId = null;
let _byType = null;
let _byBloom = null;
let _byName = null;
let _oshiCards = null;
let _memberCards = null;
let _supportCards = null;
let _cheerCards = null;

export async function loadCards(url = '../data/cards.json') {
  if (_cards) return;
  const resp = await fetch(url);
  const raw = await resp.json();
  _processRawCards(raw);
}

// Node.js server: load cards from filesystem instead of fetch
export async function loadCardsFromFile(filePath) {
  if (_cards) return;
  const fs = await import('fs');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  _processRawCards(raw);
}

function _processRawCards(raw) {
  const seen = new Set();
  _cards = [];
  for (const c of raw) {
    const key = c.id;
    if (isMember(c.type) || isOshi(c.type)) {
      const bloomKey = `${c.id}|${c.bloom || ''}`;
      if (seen.has(bloomKey)) continue;
      seen.add(bloomKey);
    } else {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    _cards.push(c);
  }

  _byId = new Map();
  _byType = new Map();
  _byBloom = new Map();
  _byName = new Map();
  _oshiCards = [];
  _memberCards = [];
  _supportCards = [];
  _cheerCards = [];

  for (const c of _cards) {
    if (!_byId.has(c.id)) _byId.set(c.id, []);
    _byId.get(c.id).push(c);
    const t = c.type || '';
    if (!_byType.has(t)) _byType.set(t, []);
    _byType.get(t).push(c);
    if (c.bloom) {
      if (!_byBloom.has(c.bloom)) _byBloom.set(c.bloom, []);
      _byBloom.get(c.bloom).push(c);
    }
    if (c.name) {
      if (!_byName.has(c.name)) _byName.set(c.name, []);
      _byName.get(c.name).push(c);
    }
    if (isOshi(c.type)) _oshiCards.push(c);
    else if (isMember(c.type)) _memberCards.push(c);
    else if (isSupport(c.type)) _supportCards.push(c);
    else if (isCheer(c.type)) _cheerCards.push(c);
  }
}

export function getCard(id) {
  const entries = _byId?.get(id);
  return entries ? entries[0] : null;
}

export function getCardVariants(id) {
  return _byId?.get(id) || [];
}

export function getCardByIdAndBloom(id, bloom) {
  const entries = _byId?.get(id) || [];
  return entries.find(c => c.bloom === bloom) || entries[0];
}

export function getCardsByType(type) {
  return _byType?.get(type) || [];
}

export function getCardsByBloom(bloom) {
  return _byBloom?.get(bloom) || [];
}

export function getCardsByName(name) {
  return _byName?.get(name) || [];
}

export function getAllOshi() { return _oshiCards || []; }
export function getAllMembers() { return _memberCards || []; }
export function getAllSupports() { return _supportCards || []; }
export function getAllCheers() { return _cheerCards || []; }
export function getAllCards() { return _cards || []; }

// Get the image path for a card (relative to game/ directory).
// Priority: local `image` path (if set by localize-data.py) → remote `imageUrl` (CDN fallback).
// Swapped from the original `imageUrl || image` so hosts without local card images
// (e.g. Studio) still see card art via the remote CDN.
export function getCardImage(cardId) {
  const card = getCard(cardId);
  if (!card) return '';
  // Prefer local image path only when it points into images/cards/ (the localized form)
  const isLocal = card.image && card.image.startsWith('images/cards/');
  const path = isLocal ? card.image : (card.imageUrl || card.image || '');
  // Paths in cards.json are relative to web/ root, prefix ../ for game/ subdir
  if (path && !path.startsWith('http') && !path.startsWith('../')) {
    return '../' + path;
  }
  return path;
}

// Get localized text from a multi-language object
export function localized(obj, lang = 'zh-TW') {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] || obj['zh-TW'] || obj['ja'] || obj['en'] || '';
}
