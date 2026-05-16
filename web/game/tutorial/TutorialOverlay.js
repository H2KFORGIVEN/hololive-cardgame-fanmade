// TutorialOverlay: DOM overlay for tutorial prompts, highlights, toasts, modals.

export class TutorialOverlay {
  constructor() {
    this._root = null;
    this._promptEl = null;
    this._toastEl = null;
    this._modalEl = null;
    this._onSkipLesson = null;
    this._onNextLesson = null;
    this._onExit = null;
  }

  mount() {
    if (this._root) return;
    const root = document.createElement('div');
    root.className = 'tutorial-overlay';
    root.innerHTML = `
      <div class="tutorial-prompt-panel" role="dialog" aria-live="polite">
        <div class="tutorial-prompt-header">
          <span class="tutorial-lesson-title"></span>
          <span class="tutorial-progress"></span>
        </div>
        <div class="tutorial-prompt-text"></div>
        <div class="tutorial-prompt-actions">
          <button class="tutorial-btn tutorial-skip">略過本課</button>
          <button class="tutorial-btn tutorial-exit">退出教學</button>
        </div>
      </div>
      <div class="tutorial-toast"></div>
    `;
    document.body.appendChild(root);
    this._root = root;
    this._promptEl = root.querySelector('.tutorial-prompt-panel');
    this._toastEl = root.querySelector('.tutorial-toast');
    root.querySelector('.tutorial-skip').addEventListener('click', () => this._onSkipLesson?.());
    root.querySelector('.tutorial-exit').addEventListener('click', () => this._onExit?.());
  }

  unmount() {
    if (this._root) {
      this._root.remove();
      this._root = null;
      this._promptEl = null;
      this._toastEl = null;
    }
    this._hideModal();
  }

  setCallbacks({ onSkipLesson, onNextLesson, onExit }) {
    this._onSkipLesson = onSkipLesson;
    this._onNextLesson = onNextLesson;
    this._onExit = onExit;
  }

  showStep(lesson, step, stepIndex, totalSteps) {
    if (!this._promptEl) return;
    const titleEl = this._promptEl.querySelector('.tutorial-lesson-title');
    const progEl = this._promptEl.querySelector('.tutorial-progress');
    const textEl = this._promptEl.querySelector('.tutorial-prompt-text');
    titleEl.textContent = lesson.title;
    progEl.textContent = `步驟 ${stepIndex + 1}/${totalSteps}`;
    textEl.textContent = step.prompt;
    this._promptEl.classList.remove('tutorial-shake');
  }

  shake() {
    if (!this._promptEl) return;
    this._promptEl.classList.remove('tutorial-shake');
    // Force reflow so the animation restarts
    void this._promptEl.offsetWidth;
    this._promptEl.classList.add('tutorial-shake');
  }

  toast(msg, duration = 1500) {
    if (!this._toastEl) return;
    this._toastEl.textContent = msg;
    this._toastEl.classList.remove('tutorial-toast-show');
    void this._toastEl.offsetWidth;
    this._toastEl.classList.add('tutorial-toast-show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this._toastEl?.classList.remove('tutorial-toast-show');
    }, duration);
  }

  showHint(hint) {
    if (!this._promptEl) return;
    const textEl = this._promptEl.querySelector('.tutorial-prompt-text');
    const oldText = textEl.textContent;
    textEl.textContent = `💡 ${hint || '這一步不對，再試試！'}`;
    this.shake();
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => {
      if (textEl) textEl.textContent = oldText;
    }, 2800);
  }

  showLessonCompleteModal(lesson, onNext, onExit) {
    this._hideModal();
    const modal = document.createElement('div');
    modal.className = 'tutorial-modal-backdrop';
    const hasNext = !!lesson.onComplete?.next;
    modal.innerHTML = `
      <div class="tutorial-modal">
        <div class="tutorial-modal-title">${lesson.onComplete?.message || lesson.title + ' 完成！'}</div>
        <div class="tutorial-modal-body">${lesson.intro || ''}</div>
        <div class="tutorial-modal-actions">
          ${hasNext ? '<button class="tutorial-btn tutorial-btn-primary tutorial-next">下一課 →</button>' : ''}
          <button class="tutorial-btn tutorial-exit-modal">${hasNext ? '退出教學' : '完成教學'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this._modalEl = modal;
    if (hasNext) {
      modal.querySelector('.tutorial-next').addEventListener('click', () => {
        this._hideModal();
        onNext?.();
      });
    }
    modal.querySelector('.tutorial-exit-modal').addEventListener('click', () => {
      this._hideModal();
      onExit?.();
    });
  }

  showVictoryModal(onExit) {
    this._hideModal();
    const modal = document.createElement('div');
    modal.className = 'tutorial-modal-backdrop';
    modal.innerHTML = `
      <div class="tutorial-modal tutorial-modal-victory">
        <div class="tutorial-modal-title">🎉 恭喜完成全部教學！</div>
        <div class="tutorial-modal-body">你已掌握 hololive CARD GAME 的核心機制：<br>放置、綻放、聯動、藝能攻擊、擊倒勝利。<br><br>接下來可以試試「本地對戰」或「線上對戰」實戰一場！</div>
        <div class="tutorial-modal-actions">
          <button class="tutorial-btn tutorial-btn-primary tutorial-exit-modal">返回首頁</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this._modalEl = modal;
    modal.querySelector('.tutorial-exit-modal').addEventListener('click', () => {
      this._hideModal();
      onExit?.();
    });
  }

  _hideModal() {
    if (this._modalEl) {
      this._modalEl.remove();
      this._modalEl = null;
    }
  }
}
