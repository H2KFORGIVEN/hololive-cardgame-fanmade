import { t } from '../i18n.js';

const IMG = 'images/tutorial';

function section(id, title, content) {
  return `<section class="tutorial-section" id="${id}">
    <h3 class="section-heading">${title}</h3>
    ${content}
  </section>`;
}

function step(img, text, imgClass = '') {
  return `<div class="tut-step">
    <div class="tut-step-img${imgClass ? ' ' + imgClass : ''}"><img src="${img}" alt="" loading="lazy" class="tut-zoomable"></div>
    <div class="tut-step-text">${text}</div>
  </div>`;
}

function stepReverse(img, text, imgClass = '') {
  return `<div class="tut-step tut-step-reverse">
    <div class="tut-step-text">${text}</div>
    <div class="tut-step-img${imgClass ? ' ' + imgClass : ''}"><img src="${img}" alt="" loading="lazy" class="tut-zoomable"></div>
  </div>`;
}

function imgBlock(img, caption = '') {
  return `<div class="tut-img-block">
    <img src="${img}" alt="" loading="lazy" class="tut-zoomable">
    ${caption ? `<p class="tut-img-caption">${caption}</p>` : ''}
  </div>`;
}

function note(text) {
  return `<p class="tut-note">${text}</p>`;
}

function warn(text) {
  return `<p class="tut-warn">${text}</p>`;
}

export function renderTutorialView(container) {
  container.innerHTML = `
    <div class="tutorial-page">
      <div class="tutorial-header">
        <h2 class="tutorial-title">${t('tutorial_title')}</h2>
        <p class="tutorial-desc">${t('tutorial_desc')}</p>
      </div>

      <nav class="tutorial-toc">
        <div class="toc-title">${t('tutorial_toc')}</div>
        <div class="toc-links">
          <a href="#tut-victory">${t('tutorial_victory_title')}</a>
          <a href="#tut-cards">${t('tutorial_cards_title')}</a>
          <a href="#tut-field">${t('tutorial_field_title')}</a>
          <a href="#tut-deck">${t('tutorial_deck_title')}</a>
          <a href="#tut-setup">${t('tutorial_setup_title')}</a>
          <a href="#tut-states">${t('tutorial_states_title')}</a>
          <a href="#tut-phases">${t('tutorial_phases_title')}</a>
          <a href="#tut-glossary">${t('tutorial_glossary_title')}</a>
        </div>
      </nav>

      ${section('tut-victory', t('tutorial_victory_title'), `
        <div class="tutorial-card victory-card">
          <div class="victory-conditions">
            <div class="victory-item"><span class="victory-icon">💀</span><span>${t('tutorial_victory_1')}</span></div>
            <div class="victory-item"><span class="victory-icon">🚫</span><span>${t('tutorial_victory_2')}</span></div>
            <div class="victory-item"><span class="victory-icon">📦</span><span>${t('tutorial_victory_3')}</span></div>
          </div>
        </div>
      `)}

      ${section('tut-cards', t('tutorial_cards_title'), `
        ${step(`${IMG}/oshi-card.png`, `
          <div class="card-type-header"><span class="card-type-badge" style="--type-color:var(--accent-gold)">OSHI</span>
          <span class="card-type-name">${t('tutorial_card_oshi_name')}</span></div>
          <p>${t('tutorial_card_oshi_desc')}</p>
          <ul><li>${t('tutorial_card_oshi_rule1')}</li><li>${t('tutorial_card_oshi_rule2')}</li><li>${t('tutorial_card_oshi_rule3')}</li></ul>
        `)}

        ${stepReverse(`${IMG}/member-card.png`, `
          <div class="card-type-header"><span class="card-type-badge" style="--type-color:var(--accent-cyan)">MEMBER</span>
          <span class="card-type-name">${t('tutorial_card_member_name')}</span></div>
          <p>${t('tutorial_card_member_desc')}</p>
          <ul><li>${t('tutorial_card_member_rule1')}</li><li>${t('tutorial_card_member_rule2')}</li></ul>
        `)}
        ${imgBlock(`${IMG}/member-card-2.png`, t('tutorial_card_member_rule1'))}

        ${step(`${IMG}/support-card.png`, `
          <div class="card-type-header"><span class="card-type-badge" style="--type-color:var(--color-green)">SUPPORT</span>
          <span class="card-type-name">${t('tutorial_card_support_name')}</span></div>
          <p>${t('tutorial_card_support_desc')}</p>
          <ul><li>${t('tutorial_card_support_rule1')}</li><li>${t('tutorial_card_support_rule2')}</li></ul>
        `)}
        ${imgBlock(`${IMG}/support-card-2.png`)}

        ${stepReverse(`${IMG}/cheer-card.png`, `
          <div class="card-type-header"><span class="card-type-badge" style="--type-color:var(--color-yellow)">CHEER</span>
          <span class="card-type-name">${t('tutorial_card_cheer_name')}</span></div>
          <p>${t('tutorial_card_cheer_desc')}</p>
          <ul><li>${t('tutorial_card_cheer_rule1')}</li></ul>
        `)}
      `)}

      ${section('tut-field', t('tutorial_field_title'), `
        ${imgBlock(`${IMG}/field-layout.jpg`)}
        <div class="zone-descriptions">
          <div class="zone-desc-item"><strong>① ${t('tutorial_zone_stage')}</strong>${t('tutorial_zone_stage_desc')}</div>
          <div class="zone-desc-item"><strong>② ${t('tutorial_zone_oshi')}</strong>${t('tutorial_zone_oshi_desc')}</div>
          <div class="zone-desc-item"><strong>⑥ ${t('tutorial_zone_deck')}</strong>${t('tutorial_zone_deck_desc')}</div>
          <div class="zone-desc-item"><strong>⑦ ${t('tutorial_zone_holopower')}</strong>${t('tutorial_zone_holopower_desc')}</div>
          <div class="zone-desc-item"><strong>⑨ ${t('tutorial_zone_cheerdeck')}</strong>${t('tutorial_zone_cheerdeck_desc')}</div>
          <div class="zone-desc-item"><strong>⑩ ${t('tutorial_zone_archive')}</strong>${t('tutorial_zone_archive_desc')}</div>
        </div>
      `)}

      ${section('tut-deck', t('tutorial_deck_title'), `
        <div class="tutorial-card">
          <div class="deck-rules">
            <div class="deck-rule-item"><span class="deck-rule-label">${t('tutorial_deck_main')}</span><span class="deck-rule-value">${t('tutorial_deck_main_desc')}</span></div>
            <div class="deck-rule-item"><span class="deck-rule-label">${t('tutorial_deck_cheer')}</span><span class="deck-rule-value">${t('tutorial_deck_cheer_desc')}</span></div>
            <div class="deck-rule-item"><span class="deck-rule-label">${t('tutorial_deck_oshi_label')}</span><span class="deck-rule-value">${t('tutorial_deck_oshi_desc')}</span></div>
            <div class="deck-rule-item"><span class="deck-rule-label">${t('tutorial_deck_limit_label')}</span><span class="deck-rule-value">${t('tutorial_deck_limit_desc')}</span></div>
          </div>
        </div>
      `)}

      ${section('tut-setup', t('tutorial_setup_title'), `
        <ol class="setup-steps">
          <li><span class="step-text">${t('tutorial_setup_1')}</span></li>
          <li><span class="step-text">${t('tutorial_setup_2')}</span></li>
          <li><span class="step-text">${t('tutorial_setup_3')}</span></li>
          <li><span class="step-text">${t('tutorial_setup_4')}</span></li>
          <li><span class="step-text">${t('tutorial_setup_5')}</span></li>
          <li><span class="step-text">${t('tutorial_setup_6')}</span></li>
          <li><span class="step-text">${t('tutorial_setup_7')}</span></li>
          <li><span class="step-text">${t('tutorial_setup_8')}</span></li>
          <li><span class="step-text">${t('tutorial_setup_9')}</span></li>
          <li><span class="step-text">${t('tutorial_setup_10')}</span></li>
          <li><span class="step-text">${t('tutorial_setup_11')}</span></li>
        </ol>
      `)}

      ${section('tut-states', t('tutorial_states_title'), `
        ${imgBlock(`${IMG}/card-states.jpg`)}
        <div class="states-grid">
          <div class="state-item state-active">
            <div class="state-icon">↑</div>
            <strong>${t('tutorial_state_active')}</strong>
            <p>${t('tutorial_state_active_desc')}</p>
          </div>
          <div class="state-item state-rest">
            <div class="state-icon">→</div>
            <strong>${t('tutorial_state_rest')}</strong>
            <p>${t('tutorial_state_rest_desc')}</p>
            <div class="state-details">
              <div><strong>${t('tutorial_state_cannot')}</strong></div>
              <ul><li>${t('tutorial_state_no_arts')}</li><li>${t('tutorial_state_no_collab')}</li><li>${t('tutorial_state_no_baton')}</li></ul>
              <div><strong>${t('tutorial_state_can')}</strong></div>
              <ul><li>${t('tutorial_state_yes_bloom')}</li><li>${t('tutorial_state_yes_effect')}</li></ul>
            </div>
          </div>
        </div>
      `)}

      ${section('tut-phases', t('tutorial_phases_title'), `
        <div class="phase-flow">
          <div class="phase-arrow-row">
            <span class="phase-chip" data-phase="reset">${t('tutorial_phase_reset')}</span>
            <span class="phase-arrow">&rarr;</span>
            <span class="phase-chip" data-phase="draw">${t('tutorial_phase_draw')}</span>
            <span class="phase-arrow">&rarr;</span>
            <span class="phase-chip" data-phase="cheer">${t('tutorial_phase_cheer')}</span>
            <span class="phase-arrow">&rarr;</span>
            <span class="phase-chip active" data-phase="main">${t('tutorial_phase_main')}</span>
            <span class="phase-arrow">&rarr;</span>
            <span class="phase-chip" data-phase="performance">${t('tutorial_phase_performance')}</span>
            <span class="phase-arrow">&rarr;</span>
            <span class="phase-chip" data-phase="end">${t('tutorial_phase_end')}</span>
          </div>
        </div>

        <!-- Reset Phase -->
        <div class="phase-detail">
          <h4 class="phase-title"><span class="phase-num">1</span>${t('tutorial_phase_reset')}</h4>
          ${note(t('tutorial_reset_skip'))}
          ${step(`${IMG}/reset-phase.png`, `
            <ol class="phase-steps">
              <li>${t('tutorial_reset_1')}</li>
              <li>${t('tutorial_reset_2')}</li>
              <li>${t('tutorial_reset_3')}</li>
            </ol>
          `)}
          ${imgBlock(`${IMG}/collab-move.png`, t('tutorial_reset_2'))}
        </div>

        <!-- Draw Phase -->
        <div class="phase-detail">
          <h4 class="phase-title"><span class="phase-num">2</span>${t('tutorial_phase_draw')}</h4>
          <p>${t('tutorial_draw_1')}</p>
          ${warn(t('tutorial_draw_warn'))}
        </div>

        <!-- Cheer Phase -->
        <div class="phase-detail">
          <h4 class="phase-title"><span class="phase-num">3</span>${t('tutorial_phase_cheer')}</h4>
          ${step(`${IMG}/cheer-phase.jpg`, `
            <p>${t('tutorial_cheer_1')}</p>
            ${note(t('tutorial_cheer_note'))}
          `)}
        </div>

        <!-- Main Phase -->
        <div class="phase-detail phase-main-detail">
          <h4 class="phase-title"><span class="phase-num">4</span>${t('tutorial_phase_main')}</h4>
          <p class="phase-intro">${t('tutorial_main_intro')}</p>

          <div class="main-actions">
            <div class="action-item">
              <h5 class="action-title">${t('tutorial_action_place')}</h5>
              ${step(`${IMG}/place-member.png`, `
                <p>${t('tutorial_action_place_desc')}</p>
              `)}
            </div>

            <div class="action-item">
              <h5 class="action-title">${t('tutorial_action_bloom')}</h5>
              ${step(`${IMG}/bloom.jpg`, `
                <p>${t('tutorial_action_bloom_desc')}</p>
                <div class="bloom-flow">Debut &rarr; 1st &rarr; 2nd</div>
                <p class="action-note">${t('tutorial_action_bloom_note')}</p>
              `)}
              <div class="cannot-bloom">
                <strong>${t('tutorial_action_bloom_cannot')}</strong>
                <ul>
                  <li>${t('tutorial_bloom_no_1')}</li>
                  <li>${t('tutorial_bloom_no_2')}</li>
                  <li>${t('tutorial_bloom_no_3')}</li>
                  <li>${t('tutorial_bloom_no_4')}</li>
                  <li>${t('tutorial_bloom_no_5')}</li>
                </ul>
              </div>
            </div>

            <div class="action-item">
              <h5 class="action-title">${t('tutorial_action_support')}</h5>
              ${step(`${IMG}/support-use.png`, `
                <p>${t('tutorial_action_support_desc')}</p>
              `)}
              ${step(`${IMG}/limited.png`, `
                ${note(t('tutorial_action_support_limited'))}
                ${warn(t('tutorial_action_support_first'))}
              `, 'tut-step-img-sm')}
            </div>

            <div class="action-item">
              <h5 class="action-title">${t('tutorial_action_oshi_skill')}</h5>
              ${step(`${IMG}/oshi-skill.jpg`, `
                <p>${t('tutorial_action_oshi_skill_desc')}</p>
              `)}
            </div>

            <div class="action-item">
              <h5 class="action-title">${t('tutorial_action_collab')}</h5>
              ${step(`${IMG}/collab.jpg`, `
                <p>${t('tutorial_action_collab_desc')}</p>
                <ul class="action-restrictions">
                  <li>${t('tutorial_collab_rule_1')}</li>
                  <li>${t('tutorial_collab_rule_2')}</li>
                  <li>${t('tutorial_collab_rule_3')}</li>
                </ul>
              `)}
            </div>

            <div class="action-item">
              <h5 class="action-title">${t('tutorial_action_baton')}</h5>
              ${step(`${IMG}/baton-pass.jpg`, `
                <p>${t('tutorial_action_baton_desc')}</p>
                <ul class="action-restrictions">
                  <li>${t('tutorial_baton_rule_1')}</li>
                  <li>${t('tutorial_baton_rule_2')}</li>
                  <li>${t('tutorial_baton_rule_3')}</li>
                </ul>
              `)}
            </div>
          </div>
        </div>

        <!-- Performance Phase -->
        <div class="phase-detail">
          <h4 class="phase-title"><span class="phase-num">5</span>${t('tutorial_phase_performance')}</h4>
          ${note(t('tutorial_perf_skip'))}

          ${step(`${IMG}/performance.jpg`, `
            <span class="perf-step-num">A</span>
            <strong>${t('tutorial_perf_select')}</strong>
            <p>${t('tutorial_perf_select_desc')}</p>
          `)}

          ${stepReverse(`${IMG}/target-select.jpg`, `
            <span class="perf-step-num">B</span>
            <strong>${t('tutorial_perf_target')}</strong>
            <p>${t('tutorial_perf_target_desc')}</p>
          `)}

          ${step(`${IMG}/damage.jpg`, `
            <span class="perf-step-num">C</span>
            <strong>${t('tutorial_perf_damage')}</strong>
            <p>${t('tutorial_perf_damage_desc')}</p>
          `)}

          ${stepReverse(`${IMG}/recovery.jpg`, `
            <span class="perf-step-num">D</span>
            <strong>${t('tutorial_perf_knockdown')}</strong>
            <p>${t('tutorial_perf_knockdown_desc')}</p>
          `)}

          <div class="tutorial-card" style="margin-top:0.8rem">
            <span class="perf-step-num">E</span>
            <strong>${t('tutorial_perf_life_loss')}</strong>
            <p style="font-size:0.82rem;color:var(--text-secondary);margin-top:0.3rem">${t('tutorial_perf_life_loss_desc')}</p>
          </div>
        </div>

        <!-- End Phase -->
        <div class="phase-detail">
          <h4 class="phase-title"><span class="phase-num">6</span>${t('tutorial_phase_end')}</h4>
          <ol class="phase-steps">
            <li>${t('tutorial_end_1')}</li>
            <li>${t('tutorial_end_2')}</li>
            <li>${t('tutorial_end_3')}</li>
          </ol>
        </div>
      `)}

      ${section('tut-glossary', t('tutorial_glossary_title'), `
        <div class="glossary-list">
          <div class="glossary-item"><dt>${t('tutorial_term_bloom')}</dt><dd>${t('tutorial_term_bloom_desc')}</dd></div>
          <div class="glossary-item"><dt>${t('tutorial_term_collab')}</dt><dd>${t('tutorial_term_collab_desc')}</dd></div>
          <div class="glossary-item"><dt>${t('tutorial_term_baton')}</dt><dd>${t('tutorial_term_baton_desc')}</dd></div>
          <div class="glossary-item"><dt>${t('tutorial_term_arts')}</dt><dd>${t('tutorial_term_arts_desc')}</dd></div>
          <div class="glossary-item"><dt>${t('tutorial_term_knockdown')}</dt><dd>${t('tutorial_term_knockdown_desc')}</dd></div>
          <div class="glossary-item"><dt>${t('tutorial_term_archive')}</dt><dd>${t('tutorial_term_archive_desc')}</dd></div>
          <div class="glossary-item"><dt>${t('tutorial_term_holopower')}</dt><dd>${t('tutorial_term_holopower_desc')}</dd></div>
          <div class="glossary-item"><dt>${t('tutorial_term_limited')}</dt><dd>${t('tutorial_term_limited_desc')}</dd></div>
        </div>
      `)}

      <div class="tutorial-footer">
        <p>${t('tutorial_credit')}</p>
      </div>
    </div>

    <!-- Lightbox -->
    <div class="tut-lightbox" id="tutLightbox" hidden>
      <div class="tut-lightbox-backdrop"></div>
      <img class="tut-lightbox-img" id="tutLightboxImg" src="" alt="">
    </div>

  `;

  // Lightbox: click image to zoom
  const lightbox = container.querySelector('#tutLightbox');
  const lightboxImg = container.querySelector('#tutLightboxImg');

  container.querySelectorAll('.tut-zoomable').forEach(img => {
    img.addEventListener('click', () => {
      lightboxImg.src = img.src;
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
    });
  });

  lightbox.addEventListener('click', () => {
    lightbox.hidden = true;
    document.body.style.overflow = '';
  });
}
