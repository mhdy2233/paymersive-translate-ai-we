import {settingsMessage, recognizeWithInk} from './bridge.js';
import {models, fillModels} from './models.js';
const $ = id => document.getElementById(id);
let controller;
let run = 0;
let dirty = false;
let saving = false;
fillModels($('mode'));
function describe() {
  $('model-detail').textContent = models.find(model => model.id === $('mode').value)?.detail || '';
  $('model-detail').hidden = !$('model-detail').textContent;
}
$('settings').addEventListener('input', () => { dirty = true; describe(); status('有未保存的修改。'); });
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
async function save() {
  saving = true;
  try {
    const value = await settingsMessage('save', {...await settingsMessage('config'), baseUrl: $('baseUrl').value.trim(), token: $('token').value.trim(),
      mode: $('mode').value, translateWithInk: $('translateWithInk').checked});
    dirty = false; status('设置已保存。已打开的网页请刷新后再使用图片翻译。'); return value;
  } finally { saving = false; }
}
$('settings').onsubmit = event => { event.preventDefault(); save().catch(e => status(e.message, true)); };
$('check').onclick = async () => {
  try { await save(); await settingsMessage('health'); status('连接成功 · 墨识 API v1 已就绪。模型在首次识别时加载。'); }
  catch (error) { status(error.message, true); }
};
$('cancel').onclick = () => controller?.abort();
$('image').onchange = async () => {
  const file = $('image').files[0]; if (!file) return;
  const currentRun = ++run;
  controller?.abort(); const requestController = controller = new AbortController();
  $('cancel').disabled = false; $('result').textContent = ''; $('preview').hidden = true;
  try {
    await save();
    const result = await recognizeWithInk(file.type, await file.arrayBuffer(), stage => {
      if (run !== currentRun) return;
      $('progress').textContent = ({extension_uploading:'提交／排队中…',model_loading:'加载模型／编译中…',recognizing:'正在识别…',saved:'识别完成'})[stage] || stage;
    }, requestController.signal);
    if (run !== currentRun) return;
    $('result').textContent = result.text + '\n\n' + (result.inference_device || JSON.stringify(result.model_backends));
    globalThis.inkLastResult = result;
    const bitmap = await createImageBitmap(file); const canvas = $('preview');
    canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.hidden = false;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    ctx.strokeStyle = '#1aaf67'; ctx.lineWidth = 2;
    result.boxesWithText.forEach(box => ctx.strokeRect(...box.bounding));
  } catch (error) { if (run === currentRun) $('progress').textContent = error.message; }
  finally { if (run === currentRun) $('cancel').disabled = true; }
};
function apply(cfg) {
  for (const key of ['baseUrl', 'token', 'mode']) $(key).value = cfg[key] || '';
  $('translateWithInk').checked = cfg.translateWithInk;
  dirty = false; describe();
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.inkOCR || saving) return;
  if (dirty) { status('漫画/图片设置页已更新配置。当前有未保存的修改；刷新可读取新配置，保存会使用当前填写内容。'); return; }
  settingsMessage('config').then(cfg => { if (!dirty) { apply(cfg); status('已同步漫画/图片设置页的墨识配置。'); } }).catch(e => status(e.message, true));
});
settingsMessage('config').then(apply).catch(e => status(e.message, true));
