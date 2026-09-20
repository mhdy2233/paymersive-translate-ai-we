export const models = [
  {id: 'balanced', name: '均衡 · RepSVTR', detail: 'NPU 检测 + CPU FP32 识别。'},
  {id: 'npu', name: 'NPU 优先 · PP-OCR', detail: 'NPU 核心计算 + CPU 辅助。'},
  {id: 'accurate', name: '多视图识别 · PP-OCR', detail: 'NPU 多视图识别 + CPU 辅助，耗时较长。'},
  {id: 'wechat', name: '微信 OCR', detail: '设备由微信运行时选择，未核验。'},
  {id: 'manga', name: 'Manga OCR · 日文漫画', detail: ''},
];

export function fillModels(select) {
  select.replaceChildren(...models.map(model => new Option(model.name, model.id)));
}
