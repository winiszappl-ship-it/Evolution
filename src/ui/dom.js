export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'data') for (const [dk, dv] of Object.entries(v)) n.dataset[dk] = dv;
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return n;
}

export const $ = (sel) => document.querySelector(sel);

const modal = () => document.getElementById('modal');
const modalBox = () => document.getElementById('modalBox');

let onCloseCb = null;

export function openModal(content, opts = {}) {
  const box = modalBox();
  box.innerHTML = '';
  box.appendChild(content);
  modal().classList.remove('hidden');
  modal().dataset.dismissable = opts.dismissable === false ? '0' : '1';
  onCloseCb = opts.onClose || null;
  box.scrollTop = 0;
}

export function closeModal() {
  modal().classList.add('hidden');
  modalBox().innerHTML = '';
  const cb = onCloseCb; onCloseCb = null;
  if (cb) cb();
}

export function isModalOpen() { return !modal().classList.contains('hidden'); }
export function modalDismissable() { return modal().dataset.dismissable !== '0'; }

export function toast(title, text, kind = '') {
  const box = document.getElementById('toasts');
  const t = el('div', { class: 'toast ' + kind }, el('b', { text: title }), text ? el('span', { text }) : null);
  box.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .4s, transform .4s';
    t.style.opacity = '0';
    t.style.transform = 'translateX(20px)';
    setTimeout(() => t.remove(), 420);
  }, kind === 'bad' ? 9000 : 6000);
  while (box.children.length > 6) box.firstChild.remove();
}

export function slider(label, value, min, max, step, hint, onInput, format = (v) => v) {
  const val = el('b', { text: format(value) });
  const input = el('input', {
    type: 'range', min, max, step, value,
    oninput: (e) => {
      const v = parseFloat(e.target.value);
      val.textContent = format(v);
      onInput(v);
    },
  });
  return el('div', { class: 'field' },
    el('label', {}, el('span', { text: label }), val),
    input,
    hint ? el('span', { class: 'hint', text: hint }) : null);
}

export function confirmBox(title, text, onYes, yesLabel = 'Tak') {
  openModal(el('div', {},
    el('h2', { text: title }),
    el('p', { class: 'lead', text }),
    el('div', { class: 'actions' },
      el('button', { class: 'primary', onclick: () => { closeModal(); onYes(); }, text: yesLabel }),
      el('button', { class: 'ghost', onclick: closeModal, text: 'Anuluj' }))));
}
