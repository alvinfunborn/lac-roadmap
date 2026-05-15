export default class ConfirmModal {
  private maskEl?: HTMLElement;
  private modalEl?: HTMLElement;

  private message: string;
  private confirmText: string;
  private cancelText: string;
  private danger: boolean;

  constructor(message: string, confirmText: string = '确定', cancelText: string = '取消', danger: boolean = true) {
    this.message = message;
    this.confirmText = confirmText;
    this.cancelText = cancelText;
    this.danger = danger;
  }

  open(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.maskEl = document.createElement('div');
      this.maskEl.className = 'lac-confirm-mask';

      this.modalEl = document.createElement('div');
      this.modalEl.className = 'lac-confirm-modal';

      const content = document.createElement('div');
      content.className = 'lac-confirm-content';

      const title = document.createElement('div');
      title.className = 'lac-confirm-title';
      title.textContent = '确认';

      const msgEl = document.createElement('div');
      msgEl.className = 'lac-confirm-message';
      msgEl.textContent = this.message;

      const actions = document.createElement('div');
      actions.className = 'lac-confirm-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'lac-btn lac-btn-cancel';
      cancelBtn.textContent = this.cancelText;

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'lac-btn lac-btn-confirm';
      if (this.danger) confirmBtn.classList.add('danger');
      confirmBtn.textContent = this.confirmText;

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      content.appendChild(title);
      content.appendChild(msgEl);
      content.appendChild(actions);
      this.modalEl.appendChild(content);
      this.maskEl.appendChild(this.modalEl);
      document.body.appendChild(this.maskEl);

      const close = (result: boolean) => {
        if (this.maskEl && this.maskEl.parentElement) this.maskEl.parentElement.removeChild(this.maskEl);
        this.maskEl = undefined;
        this.modalEl = undefined;
        resolve(result);
      };

      this.maskEl.addEventListener('click', (e) => { if (e.target === this.maskEl) close(false); });
      cancelBtn.addEventListener('click', () => close(false));
      confirmBtn.addEventListener('click', () => close(true));
    });
  }
}


