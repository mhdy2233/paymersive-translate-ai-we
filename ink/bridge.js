export async function settingsMessage(method, data) {
  const reply = await chrome.runtime.sendMessage({inkOCR: {method, data}});
  if (!reply) throw new Error('插件后台未响应，请在扩展管理页重新加载插件');
  if (reply.error) throw new Error(reply.error);
  return reply.value;
}

// Long translation requests run in the offscreen page, whose lifetime is not the
// service worker's 30-second fetch-response budget.
export async function translateWithInk(data, signal) {
  const cfg = await settingsMessage('config');
  if (!cfg.translateWithInk) return {enabled: false};
  if (!data.boxes.length) return {enabled: true, boxes: []};
  let response;
  try {
    response = await fetch(cfg.baseUrl + '/v1/translate', {
      method: 'POST', signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(600000)]) : AbortSignal.timeout(600000),
      headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.token},
      body: JSON.stringify({paragraphs:data.boxes.map(box => box.originalText), target_language:data.targetLanguage}),
    });
  } catch (error) {
    throw new Error(error.name === 'TimeoutError' ? '墨识翻译超时，请减小图片文字量' : '无法连接墨识翻译接口，请检查本地服务');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || `墨识 HTTP ${response.status}`);
  if (result.paragraphs.length !== data.boxes.length) throw new Error('墨识返回的翻译段落数不匹配');
  return {enabled:true, boxes:data.boxes.map((box,index) => ({...box,translatedText:result.paragraphs[index].translation}))};
}

export async function recognizeWithInk(mimeType, bytes, progress = () => {}, signal, options = {}) {
  const cfg = await settingsMessage('config');
  if (!cfg.token) throw new Error('请打开插件的“墨识 OCR”设置并填写本地接口令牌');
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(Object.values(bytes));
  if (!data.length || data.length > 24 * 1024 * 1024) throw new Error('图片为空或超过 24 MiB');
  let binary = '';
  for (let i = 0; i < data.length; i += 32768) binary += String.fromCharCode(...data.subarray(i, i+32768));
  const headers = {'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.token};
  let jobId;
  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(cfg.baseUrl + path, {...options, headers,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)});
    } catch (error) {
      if (signal?.aborted) throw new DOMException('已取消图片识别', 'AbortError');
      throw new Error(error.name === 'TimeoutError' ? '墨识连接超时，请检查本地服务日志' : '无法连接墨识，请先启动 scripts/start-browser-api.ps1 -Background');
    }
    const value = await response.json();
    if (!response.ok) throw new Error(value.error?.message || `墨识 HTTP ${response.status}`);
    return value;
  }
  try {
    progress('extension_uploading');
    let job = await request('/v1/ocr/jobs', {method: 'POST', body: JSON.stringify({image: btoa(binary), mode: options.mode || cfg.mode,
      ...(options.regions ? {regions:options.regions} : {})})});
    jobId = job.id;
    const deadline = Date.now() + 610000;
    while (Date.now() < deadline) {
      if (job.status === 'completed') { progress('saved'); return job.result; }
      if (job.status === 'failed') throw new Error(job.error?.message || '墨识识别失败');
      if (job.status === 'cancelled') throw new DOMException('已取消图片识别', 'AbortError');
      progress(job.progress?.stage === 'loading' ? 'model_loading' : job.status === 'queued' ? 'extension_uploading' : 'recognizing');
      await new Promise(resolve => setTimeout(resolve, 250));
      job = await request('/v1/ocr/jobs/' + encodeURIComponent(jobId));
    }
    throw new Error('墨识识别超时；首次 NPU 编译可能需要较长时间，请检查服务日志');
  } catch (error) {
    if (jobId) {
      await fetch(cfg.baseUrl + '/v1/ocr/jobs/' + encodeURIComponent(jobId), {
        method: 'DELETE', headers, signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
    throw error;
  }
}
