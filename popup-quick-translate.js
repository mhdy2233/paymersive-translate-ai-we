(function () {
  // 阻止原版扩展在切换服务时调用 window.close() 强行关闭悬浮面板
  try {
    window.close = function () {};
    globalThis.close = function () {};
  } catch (_) {}

  const STORAGE_PREFIX = 'imt_quick_trans_';

  const ALL_LANGUAGES = [
    { code: 'zh-CN', name: '中文 (简体)' },
    { code: 'en', name: '英语' },
    { code: 'ja', name: '日语' },
    { code: 'ko', name: '韩语' },
    { code: 'zh-TW', name: '中文 (繁体)' },
    { code: 'zh-HK', name: '中文 (繁体-香港)' },
    { code: 'fr', name: '法语' },
    { code: 'de', name: '德语' },
    { code: 'es', name: '西班牙语' },
    { code: 'ru', name: '俄语' },
    { code: 'it', name: '意大利语' },
    { code: 'pt', name: '葡萄牙语' },
    { code: 'pt-br', name: '葡萄牙语 (巴西)' },
    { code: 'ar', name: '阿拉伯语' },
    { code: 'vi', name: '越南语' },
    { code: 'th', name: '泰语' },
    { code: 'id', name: '印尼语' },
    { code: 'ms', name: '马来语' },
    { code: 'hi', name: '印地语' },
    { code: 'tr', name: '土耳其语' },
    { code: 'nl', name: '荷兰语' },
    { code: 'pl', name: '波兰语' },
    { code: 'uk', name: '乌克兰语' },
    { code: 'sv', name: '瑞典语' },
    { code: 'no', name: '挪威语' },
    { code: 'da', name: '丹麦语' },
    { code: 'fi', name: '芬兰语' },
    { code: 'el', name: '希腊语' },
    { code: 'he', name: '希伯来语' },
    { code: 'fa', name: '波斯语' },
    { code: 'bo', name: '藏语' },
    { code: 'yue', name: '粤语' },
    { code: 'wyw', name: '文言文' },
  ];

  const SOURCE_LANGUAGES = [
    { code: 'auto', name: '自动检测' },
    ...ALL_LANGUAGES,
  ];

  function getLangName(code, isSource = false) {
    if (isSource && code === 'auto') return '自动检测';
    const found = ALL_LANGUAGES.find(l => l.code === code);
    return found ? found.name : code;
  }

  function resolveServiceType(serviceId) {
    if (!serviceId) return 'google';
    const id = serviceId.toLowerCase();
    if (id.includes('google')) return 'google';
    if (id.includes('bing')) return 'bing';
    if (id.includes('ink')) return 'ink';
    if (id.includes('deepseek')) return 'deepseek';
    if (id.includes('openai') || id.includes('gpt')) return 'openai';
    if (id.includes('claude')) return 'claude';
    if (id.includes('gemini')) return 'gemini';
    if (id.includes('deepl')) return 'deepl';
    if (id.includes('siliconcloud') || id.includes('siliconflow')) return 'siliconcloud';
    if (id.includes('zhipu') || id.includes('glm')) return 'zhipu';
    if (id.includes('qwen')) return 'qwen';
    if (id.includes('ollama')) return 'ollama';
    return serviceId;
  }

  function normalizeUrl(rawUrl, defaultUrl = 'https://api.openai.com/v1/chat/completions') {
    if (!rawUrl || !rawUrl.trim()) return defaultUrl;
    let u = rawUrl.trim();
    if (!u.startsWith('http')) u = 'https://' + u;
    if (u.includes('/chat/completions') || u.includes('/completions') || u.includes('/messages')) {
      return u;
    }
    if (u.endsWith('/v1') || u.endsWith('/v1/')) {
      return u.replace(/\/+$/, '') + '/chat/completions';
    }
    return u.replace(/\/+$/, '') + '/chat/completions';
  }

  async function translateWithService(serviceId, text, fromLang, toLang) {
    if (!serviceId) throw new Error('请选择有效的翻译服务');

    const sLower = serviceId.toLowerCase();

    // 1. Google 翻译
    if (sLower.startsWith('google') || sLower === 'google-free') {
      const sl = fromLang || 'auto';
      const tl = toLang || 'zh-CN';
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text.trim())}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Google 翻译接口错误 (HTTP ${resp.status})`);
      const json = await resp.json();
      if (Array.isArray(json) && Array.isArray(json[0])) {
        return json[0].map(item => item[0]).filter(Boolean).join('');
      }
      throw new Error('未能解析 Google 翻译结果');
    }

    // 2. 墨识本地接口
    if (sLower.includes('ink')) {
      const stored = await chrome.storage.local.get(['inkOCR']).catch(() => ({}));
      const baseUrl = stored?.inkOCR?.baseUrl || 'http://127.0.0.1:18765';
      const token = stored?.inkOCR?.token || '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      const resp = await fetch(baseUrl + '/v1/translate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          paragraphs: [text.trim()],
          target_language: toLang || 'zh-CN',
        }),
        signal: AbortSignal.timeout(30000),
      }).catch(() => {
        throw new Error(`无法连接墨识本地接口，请确认服务已启动 (${baseUrl})`);
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `墨识 HTTP ${resp.status}`);
      }
      const json = await resp.json();
      if (json?.paragraphs?.[0]?.translation) {
        return json.paragraphs[0].translation;
      }
      throw new Error('墨识未返回翻译结果');
    }

    // 3. 微软翻译 (Bing)
    if (sLower.startsWith('bing') || sLower === 'bing-free') {
      const sl = fromLang === 'auto' ? 'auto-detect' : fromLang;
      const tl = toLang || 'zh-Hans';
      const bResp = await fetch(`https://api-edge.cognitive.microsofttranslator.com/translate?from=${encodeURIComponent(sl)}&to=${encodeURIComponent(tl)}&api-version=3.0`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        },
        body: JSON.stringify([{ Text: text.trim() }]),
      });
      if (!bResp.ok) {
        throw new Error(`微软翻译接口请求失败 (HTTP ${bResp.status})`);
      }
      const bJson = await bResp.json();
      if (bJson?.[0]?.translations?.[0]?.text) {
        return bJson[0].translations[0].text;
      }
      throw new Error('微软翻译未返回有效结果');
    }

    // 读取扩展配置中的所有服务配置（包含自定义服务、AI 模型等）
    const stored = await chrome.storage.local.get(['fullLocalUserConfig']).catch(() => ({}));
    const allServices = stored?.fullLocalUserConfig?.translationServices || {};

    let svcConfig = allServices[serviceId] || allServices[sLower];
    if (!svcConfig || Object.keys(svcConfig).length === 0) {
      for (const [k, v] of Object.entries(allServices)) {
        if (k === serviceId || v?.name === serviceId || v?.id === serviceId) {
          svcConfig = v;
          break;
        }
      }
    }
    svcConfig = svcConfig || {};

    const sType = (svcConfig.type || svcConfig.extends || resolveServiceType(serviceId)).toLowerCase();

    // 4. Claude (Anthropic)
    if (sType === 'claude') {
      const apiKey = svcConfig.APIKEY || svcConfig.apiKey || svcConfig.apikey || svcConfig.token;
      if (!apiKey) throw new Error(`请先在扩展设置中为「${serviceId}」配置 Claude API Key`);
      const apiUrl = svcConfig.apiUrl || 'https://api.anthropic.com/v1/messages';
      const model = svcConfig.model || 'claude-3-5-haiku-20241022';
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages: [{ role: 'user', content: `Translate the following text into ${toLang || 'zh-CN'}. Output only the translation:\n\n${text.trim()}` }],
        }),
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Claude HTTP ${resp.status}`);
      }
      const json = await resp.json();
      return json.content?.[0]?.text?.trim() || '';
    }

    // 5. Gemini
    if (sType === 'gemini') {
      const apiKey = svcConfig.APIKEY || svcConfig.apiKey || svcConfig.apikey || svcConfig.token;
      if (!apiKey) throw new Error(`请先在扩展设置中为「${serviceId}」配置 Gemini API Key`);
      const model = svcConfig.model || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Translate the following text into ${toLang || 'zh-CN'}. Output only the translation without any notes:\n\n${text.trim()}` }] }]
        }),
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Gemini HTTP ${resp.status}`);
      }
      const json = await resp.json();
      return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    }

    // 6. DeepL
    if (sType === 'deepl') {
      const authKey = svcConfig.authKey || svcConfig.APIKEY || svcConfig.apiKey || svcConfig.apikey;
      if (!authKey) throw new Error(`请先在扩展设置中为「${serviceId}」配置 DeepL 密钥`);
      const isFree = authKey.endsWith(':fx');
      const url = svcConfig.apiUrl || (isFree ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate');
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'DeepL-Auth-Key ' + authKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: [text.trim()],
          target_lang: (toLang || 'ZH').toUpperCase(),
        }),
      });
      if (!resp.ok) throw new Error(`DeepL HTTP ${resp.status}`);
      const json = await resp.json();
      if (json?.translations?.[0]?.text) return json.translations[0].text;
      throw new Error('DeepL 未返回译文');
    }

    // 7. 所有 OpenAI 格式兼容的 AI / 自定义服务 (包含 inceptionlabs, deepseek, openai, siliconcloud, zhipu, ollama, groq, custom-ai 等)
    const isAiService = [
      'custom-ai', 'custom', 'openai', 'deepseek', 'siliconcloud', 'zhipu',
      'ollama', 'groq', 'openrouter', 'grok', 'qwen', 'kimi', 'hunyuan',
      'stepfun', 'baichuan', 'lingyiwanwu'
    ].includes(sType) || !!svcConfig.apiUrl || svcConfig.provider === 'custom';

    if (isAiService) {
      const apiKey = svcConfig.APIKEY || svcConfig.apiKey || svcConfig.apikey || svcConfig.token || '';
      if (!apiKey && sType !== 'ollama') {
        throw new Error(`服务「${serviceId}」未检测到 API Key，请在扩展设置中配置密钥`);
      }

      let defaultUrl = 'https://api.openai.com/v1/chat/completions';
      let defaultModel = 'gpt-4o-mini';
      if (sType.includes('deepseek')) {
        defaultUrl = 'https://api.deepseek.com/chat/completions';
        defaultModel = 'deepseek-chat';
      } else if (sType.includes('siliconcloud')) {
        defaultUrl = 'https://api.siliconflow.cn/v1/chat/completions';
        defaultModel = 'deepseek-ai/DeepSeek-V3';
      } else if (sType.includes('zhipu')) {
        defaultUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
        defaultModel = 'glm-4-flash';
      } else if (sType.includes('ollama')) {
        defaultUrl = 'http://127.0.0.1:11434/v1/chat/completions';
        defaultModel = 'qwen2.5:7b';
      }

      const finalApiUrl = normalizeUrl(svcConfig.apiUrl, defaultUrl);
      const finalModel = svcConfig.model || defaultModel;

      const headers = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = 'Bearer ' + apiKey;
      }
      if (svcConfig.headers && typeof svcConfig.headers === 'object') {
        Object.assign(headers, svcConfig.headers);
      }

      const bodyPayload = {
        model: finalModel,
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Translate the text into ${toLang || 'zh-CN'}. Output only the translation directly without any explanation, markdown or quotes.`
          },
          {
            role: 'user',
            content: text.trim()
          }
        ],
        temperature: 0.3,
      };
      if (svcConfig.bodyConfigs && typeof svcConfig.bodyConfigs === 'object') {
        Object.assign(bodyPayload, svcConfig.bodyConfigs);
      }

      const resp = await fetch(finalApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(60000),
      }).catch(err => {
        throw new Error(`连接「${serviceId}」失败：` + (err.message || '网络连接超时'));
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error?.message || errJson.message || `「${serviceId}」接口报错 HTTP ${resp.status}`);
      }
      const json = await resp.json();
      const result = json.choices?.[0]?.message?.content?.trim();
      if (result) return result;
      throw new Error(`「${serviceId}」未返回有效译文内容`);
    }

    // 8. 兜底处理：真实反馈状态，严禁隐式伪装为 Google 翻译！
    throw new Error(`服务「${serviceId}」当前未配置或不可用，请在设置中检查`);
  }

  function createQuickTranslateCard() {
    if (document.getElementById('imt-quick-translate-card')) return;

    const savedFrom = localStorage.getItem(STORAGE_PREFIX + 'from') || 'auto';
    const savedTo = localStorage.getItem(STORAGE_PREFIX + 'to') || 'zh-CN';

    const card = document.createElement('div');
    card.id = 'imt-quick-translate-card';
    card.className = 'imt-quick-card';

    card.innerHTML = `
      <div class="imt-quick-header">
        <div class="imt-quick-title">
          <svg class="imt-quick-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 8l6 6"></path>
            <path d="M4 14l6-6 2-3"></path>
            <path d="M2 5h12"></path>
            <path d="M7 2h1"></path>
            <path d="M22 22l-5-10-5 10"></path>
            <path d="M14 18h6"></path>
          </svg>
          <span>快捷文本翻译</span>
        </div>
      </div>

      <!-- 语言选择栏：采用原版 .translate-language-row 相同结构与样式 -->
      <div class="translate-language-row imt-quick-lang-row">
        <div class="select-languages select-languages--popup imt-quick-select-wrap">
          <select id="imt-quick-from" class="imt-quick-overlay-select" aria-label="源语言">
            ${SOURCE_LANGUAGES.map(l => `<option value="${l.code}" ${l.code === savedFrom ? 'selected' : ''}>${l.name}</option>`).join('')}
          </select>
          <div class="select-languages-box popup-source-language">
            <div id="imt-quick-from-text" class="select-languages-text">${getLangName(savedFrom, true)}</div>
            <svg class="arrow-down" width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M3.48 6.39L0.73 3.32A0.8 0.8 0 0 1 0.55 2.87C0.55 2.49 0.86 2.18 1.24 2.18H6.74C7.2 2.18 7.48 2.61 7.25 3.32L4.5 6.39A0.8 0.8 0 0 1 3.48 6.39Z" fill="currentColor"/></svg>
          </div>
        </div>

        <button type="button" class="translate-language-exchange" id="imt-quick-swap" title="交换语言">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
          </svg>
        </button>

        <div class="select-languages select-languages--popup imt-quick-select-wrap">
          <select id="imt-quick-to" class="imt-quick-overlay-select" aria-label="目标语言">
            ${ALL_LANGUAGES.map(l => `<option value="${l.code}" ${l.code === savedTo ? 'selected' : ''}>${l.name}</option>`).join('')}
          </select>
          <div class="select-languages-box popup-target-language">
            <div id="imt-quick-to-text" class="select-languages-text">${getLangName(savedTo, false)}</div>
            <svg class="arrow-down" width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M3.48 6.39L0.73 3.32A0.8 0.8 0 0 1 0.55 2.87C0.55 2.49 0.86 2.18 1.24 2.18H6.74C7.2 2.18 7.48 2.61 7.25 3.32L4.5 6.39A0.8 0.8 0 0 1 3.48 6.39Z" fill="currentColor"/></svg>
          </div>
        </div>
      </div>

      <!-- 翻译服务栏：可选项与网页翻译设置完全同源并动态保持一致 -->
      <div class="translation-service-container imt-quick-service-container">
        <div class="min-select-container">
          <label class="inline-block text-label mb-0 text-gray-6" style="min-width: 50px; flex-shrink: 0;">翻译服务</label>
          <div class="imt-quick-service-select-wrap">
            <select id="imt-quick-service" class="translate-service min-select" aria-label="选择翻译服务">
              <option value="google-free">Google 翻译</option>
              <option value="bing-free">微软翻译 (Bing)</option>
              <option value="ink">墨识本地 (Ink OCR)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- 输入框 -->
      <div class="imt-quick-input-wrap">
        <textarea id="imt-quick-input" class="imt-quick-textarea" placeholder="输入待翻译文本 (Ctrl+Enter 翻译)..." rows="3"></textarea>
      </div>

      <!-- 操作按钮栏 -->
      <div class="imt-quick-action-row">
        <button type="button" id="imt-quick-clear" class="imt-quick-btn-secondary">清空</button>
        <button type="button" id="imt-quick-submit" class="main-button imt-quick-submit-btn">翻译</button>
      </div>

      <!-- 结果区域 -->
      <div id="imt-quick-result-wrap" class="imt-quick-result-wrap" style="display: none;">
        <div class="imt-quick-result-header">
          <span class="imt-quick-result-label">译文</span>
          <button type="button" id="imt-quick-copy" class="imt-quick-copy-btn" title="复制译文">
            <svg class="imt-quick-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span id="imt-quick-copy-text">复制</span>
          </button>
        </div>
        <div id="imt-quick-result-content" class="imt-quick-result-content"></div>
      </div>
    `;

    document.body.appendChild(card);

    // 绑定元素与事件
    const serviceSelect = card.querySelector('#imt-quick-service');
    const fromSelect = card.querySelector('#imt-quick-from');
    const toSelect = card.querySelector('#imt-quick-to');
    const fromText = card.querySelector('#imt-quick-from-text');
    const toText = card.querySelector('#imt-quick-to-text');
    const swapBtn = card.querySelector('#imt-quick-swap');
    const textarea = card.querySelector('#imt-quick-input');
    const submitBtn = card.querySelector('#imt-quick-submit');
    const clearBtn = card.querySelector('#imt-quick-clear');
    const resultWrap = card.querySelector('#imt-quick-result-wrap');
    const resultContent = card.querySelector('#imt-quick-result-content');
    const copyBtn = card.querySelector('#imt-quick-copy');
    const copyText = card.querySelector('#imt-quick-copy-text');

    // ========== 动态同步「网页翻译设置」的可选项与当前选中项 ==========
    function syncExactServicesFromWebSettings() {
      // 1. 优先从 #mount 的自定义下拉选项中读取实际可选列表
      const mountItems = document.querySelectorAll('#mount .translation-service-container .custom-select-content .custom-select-item, #mount .translation-service-container .custom-select-item:not(.default)');
      if (mountItems && mountItems.length > 0) {
        const list = [];
        mountItems.forEach(el => {
          const val = el.getAttribute('value');
          if (!val || val === 'more') return;
          const textSpan = el.querySelector('span:not(.custom-select-item-pro)') || el.querySelector('span') || el;
          const label = textSpan.textContent?.trim() || val;
          const isSelected = el.classList.contains('selected');
          list.push({ value: val, label, selected: isSelected });
        });

        if (list.length > 0) {
          applyExactServiceList(list);
          return true;
        }
      }

      // 2. 从 #mount 中的原生 select 获取
      const mountNativeSelect = document.querySelector('#mount .translation-service-container select');
      if (mountNativeSelect && mountNativeSelect.options.length > 0) {
        const list = Array.from(mountNativeSelect.options)
          .filter(o => o.value && o.value !== 'more')
          .map(o => ({ value: o.value, label: o.text?.trim() || o.value, selected: o.selected }));
        if (list.length > 0) {
          applyExactServiceList(list);
          return true;
        }
      }

      return false;
    }

    function applyExactServiceList(list) {
      const savedService = localStorage.getItem(STORAGE_PREFIX + 'service');
      const selectedItemFromMount = list.find(item => item.selected)?.value;
      const effectiveSelected = (savedService && list.some(item => item.value === savedService))
        ? savedService
        : (selectedItemFromMount || list[0]?.value);

      // 比较选项列表是否有实质变化，避免频繁操作 DOM
      const existingOptions = Array.from(serviceSelect.options).map(o => `${o.value}:${o.textContent}`).join('|');
      const incomingOptions = list.map(i => `${i.value}:${i.label}`).join('|');

      if (existingOptions !== incomingOptions) {
        serviceSelect.innerHTML = '';
        list.forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.value;
          opt.textContent = item.label;
          if (item.value === effectiveSelected) {
            opt.selected = true;
          }
          serviceSelect.appendChild(opt);
        });
      }

      if (effectiveSelected && serviceSelect.value !== effectiveSelected) {
        serviceSelect.value = effectiveSelected;
      }
    }

    // 立即执行一次同步
    syncExactServicesFromWebSettings();

    // 监听 #mount 内部变化，只要网页设置的可选服务挂载或选中变化，立即同步
    const mountEl = document.getElementById('mount');
    if (mountEl) {
      const observer = new MutationObserver(() => {
        syncExactServicesFromWebSettings();
      });
      observer.observe(mountEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'value'] });
    }

    // 快捷翻译服务选择变化：仅在本地记忆，不触发任何外部关窗逻辑
    serviceSelect.addEventListener('change', () => {
      const chosen = serviceSelect.value;
      localStorage.setItem(STORAGE_PREFIX + 'service', chosen);
    });

    fromSelect.addEventListener('change', () => {
      fromText.textContent = getLangName(fromSelect.value, true);
      localStorage.setItem(STORAGE_PREFIX + 'from', fromSelect.value);
    });

    toSelect.addEventListener('change', () => {
      toText.textContent = getLangName(toSelect.value, false);
      localStorage.setItem(STORAGE_PREFIX + 'to', toSelect.value);
    });

    swapBtn.addEventListener('click', () => {
      swapBtn.classList.add('translate-language-exchange-active');
      setTimeout(() => swapBtn.classList.remove('translate-language-exchange-active'), 250);

      const curFrom = fromSelect.value;
      const curTo = toSelect.value;
      if (curFrom === 'auto') {
        fromSelect.value = curTo;
        toSelect.value = curTo === 'zh-CN' ? 'en' : 'zh-CN';
      } else {
        const canSetFrom = Array.from(fromSelect.options).some(o => o.value === curTo);
        const canSetTo = Array.from(toSelect.options).some(o => o.value === curFrom);
        if (canSetFrom && canSetTo) {
          fromSelect.value = curTo;
          toSelect.value = curFrom;
        }
      }
      fromText.textContent = getLangName(fromSelect.value, true);
      toText.textContent = getLangName(toSelect.value, false);
      localStorage.setItem(STORAGE_PREFIX + 'from', fromSelect.value);
      localStorage.setItem(STORAGE_PREFIX + 'to', toSelect.value);
    });

    clearBtn.addEventListener('click', () => {
      textarea.value = '';
      resultWrap.style.display = 'none';
      resultContent.textContent = '';
      textarea.focus();
    });

    copyBtn.addEventListener('click', async () => {
      const textToCopy = resultContent.textContent;
      if (!textToCopy) return;
      try {
        await navigator.clipboard.writeText(textToCopy);
        copyText.textContent = '已复制 ✔';
        setTimeout(() => {
          copyText.textContent = '复制';
        }, 1500);
      } catch (err) {
        copyText.textContent = '复制失败';
      }
    });

    async function handleTranslate() {
      const rawText = textarea.value.trim();
      if (!rawText) {
        textarea.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '翻译中…';
      resultWrap.style.display = 'block';
      resultContent.textContent = '正在获取翻译结果…';
      resultContent.classList.remove('imt-error');
      resultContent.classList.add('imt-loading');

      try {
        const sId = serviceSelect.value;
        const sl = fromSelect.value;
        const tl = toSelect.value;
        const translated = await translateWithService(sId, rawText, sl, tl);
        resultContent.textContent = translated || '(未返回译文)';
        resultContent.classList.remove('imt-loading');
      } catch (err) {
        resultContent.textContent = '翻译失败：' + (err.message || '请检查接口或网络');
        resultContent.classList.remove('imt-loading');
        resultContent.classList.add('imt-error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '翻译';
      }
    }

    submitBtn.addEventListener('click', (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      handleTranslate();
    });

    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleTranslate();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createQuickTranslateCard);
  } else {
    createQuickTranslateCard();
  }
})();
