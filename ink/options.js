import {settingsMessage} from './bridge.js';
import {models, fillModels} from './models.js';

// The build inserts this element in the vendor's manga/image route. Its lifecycle
// follows that route, so sidebar navigation cannot leave duplicate forms/listeners.
class InkOCRSettings extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <section class="ink-panel" aria-labelledby="ink-title">
        <h2 id="ink-title">墨识 OCR</h2>
        <form id="ink-form">
          <fieldset disabled>
            <label for="ink-mode">识别模型</label>
            <select id="ink-mode" aria-describedby="ink-model-detail"></select>
            <p id="ink-model-detail" class="ink-help"></p>
            <div class="ink-grid">
              <div><label for="ink-repairMode">图片回填</label><select id="ink-repairMode"><option value="auto">漫画修复</option><option value="solid">纯色覆盖</option></select></div>
              <div><label for="ink-textDirection">译文排版</label><select id="ink-textDirection"><option value="auto">自动</option><option value="horizontal">横排</option><option value="vertical">竖排</option></select></div>
            </div>
            <div class="ink-grid">
              <div><label for="ink-baseUrl">接口地址</label>
                <input id="ink-baseUrl" type="url" required placeholder="http://127.0.0.1:18765" spellcheck="false" autocomplete="off"></div>
              <div><label for="ink-token">接口令牌</label>
                <input id="ink-token" type="password" required minlength="32" autocomplete="off" spellcheck="false"></div>
            </div>
            <label class="ink-check" for="ink-translateWithInk"><input id="ink-translateWithInk" type="checkbox">使用墨识翻译服务</label>
            <p class="ink-help">关闭后使用插件翻译服务。</p>
            <div class="ink-actions">
              <button type="submit">保存设置</button>
              <button type="button" id="ink-check" class="ink-secondary">保存并检查连接</button>
              <button type="button" id="ink-reset" class="ink-secondary">重新读取</button>
              <a id="ink-test" target="_blank" rel="noopener">测试图片 ↗</a>
            </div>
          </fieldset>
        </form>
        <p id="ink-status" role="status" aria-live="polite">读取中…</p>
        <details class="ink-connection-help"><summary>连接帮助</summary>
          <p class="ink-help">启动接口：墨识桌面 → 设置 → 识别与存储。<br>令牌：browser-api.settings.json 中的 token。</p>
        </details>
      </section>`;
    this.dirty = false;
    this.busy = false;
    this.field = id => this.querySelector('#ink-' + id);
    fillModels(this.field('mode'));
    this.field('test').href = chrome.runtime.getURL('ink/settings.html');
    this.field('form').addEventListener('input', () => {
      this.dirty = true; this.describe(); this.status('未保存');
    });
    this.field('form').addEventListener('submit', event => {
      event.preventDefault(); this.save(false);
    });
    this.field('check').onclick = () => { if (this.field('form').reportValidity()) this.save(true); };
    this.field('reset').onclick = () => this.load();
    this.onStorage = (changes, area) => {
      if (area !== 'local' || !changes.inkOCR || this.busy) return;
      if (this.dirty) this.status('其他页面已修改设置，请保存当前修改或重新读取。');
      else this.load('已同步');
    };
    chrome.storage.onChanged.addListener(this.onStorage);
    this.load();
  }

  disconnectedCallback() {
    chrome.storage.onChanged.removeListener(this.onStorage);
  }

  status(message, error = false) {
    this.field('status').textContent = message;
    this.field('status').classList.toggle('ink-error', error);
  }

  describe() {
    const detail = this.field('model-detail');
    detail.textContent = models.find(model => model.id === this.field('mode').value)?.detail ?? '未知模型，请重新选择。';
    detail.hidden = !detail.textContent;
  }

  apply(config) {
    for (const key of ['baseUrl', 'token', 'mode']) this.field(key).value = config[key] || '';
    for (const key of ['repairMode', 'textDirection']) this.field(key).value = config[key] || 'auto';
    this.field('translateWithInk').checked = !!config.translateWithInk;
    this.dirty = false;
    this.describe();
  }

  async load(message = '') {
    this.busy = true;
    this.querySelector('fieldset').disabled = true;
    try {
      const config = await settingsMessage('config');
      if (!this.isConnected) return;
      this.apply(config); this.status(message);
    } catch (error) { if (this.isConnected) this.status(error.message, true); }
    finally { this.busy = false; this.querySelector('fieldset').disabled = false; }
  }

  async save(check) {
    if (this.busy) return;
    this.busy = true;
    this.querySelector('fieldset').disabled = true;
    this.status(check ? '检查连接中…' : '保存中…');
    try {
      const config = await settingsMessage('save', {
        baseUrl: this.field('baseUrl').value.trim(), token: this.field('token').value.trim(),
        mode: this.field('mode').value, translateWithInk: this.field('translateWithInk').checked,
        repairMode: this.field('repairMode').value, textDirection: this.field('textDirection').value,
      });
      if (!this.isConnected) return;
      this.apply(config);
      if (check) {
        const result = await settingsMessage('health');
        if (!this.isConnected) return;
        if (!result.engines?.some(engine => engine.id === config.mode)) throw new Error('接口未提供所选模型，请确认服务版本。');
        this.status('已保存，连接成功');
      } else this.status('已保存');
    } catch (error) { if (this.isConnected) this.status(error.message, true); }
    finally { this.busy = false; this.querySelector('fieldset').disabled = false; }
  }
}

customElements.define('ink-ocr-settings', InkOCRSettings);
