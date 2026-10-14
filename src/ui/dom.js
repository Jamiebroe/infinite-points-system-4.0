// Minimal DOM helpers for the System interface.
// This file (and the whole src/ui folder) is the only place that touches the document.

/** Create an element. attrs: class, text, html, dataset{}, style{}, on<Event>, or any attribute. */
export function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            if (v === undefined || v === null || v === false) continue;
            if (k === 'class') node.className = v;
            else if (k === 'text') node.textContent = String(v);
            else if (k === 'html') node.innerHTML = String(v);
            else if (k === 'dataset') Object.assign(node.dataset, v);
            else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
            else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
            else if (v === true) node.setAttribute(k, '');
            else node.setAttribute(k, String(v));
        }
    }
    append(node, children);
    return node;
}

/** Recursively flatten child arrays (so `.map()` results can be passed directly). */
function flatten(value, out = []) {
    if (Array.isArray(value)) {
        for (const item of value) flatten(item, out);
    } else {
        out.push(value);
    }
    return out;
}

/** Append children (nodes, strings, nested arrays; nullish entries are skipped). */
export function append(node, children) {
    for (const c of flatten(children)) {
        if (c === null || c === undefined || c === false || c === '') continue;
        node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
}

export function frag(children) {
    return append(document.createDocumentFragment(), children);
}

export function qs(sel, root = document) {
    return root.querySelector(sel);
}

export function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
}

/** Replace the content of `node` with `children`. */
export function mount(node, children) {
    clear(node);
    return append(node, children);
}

export function on(node, type, handler, opts) {
    node.addEventListener(type, handler, opts);
    return () => node.removeEventListener(type, handler, opts);
}

/** Event delegation: `sel` is matched against the closest ancestor from the target. */
export function delegate(root, type, sel, handler) {
    return on(root, type, ev => {
        const target = ev.target instanceof Element ? ev.target.closest(sel) : null;
        if (target && root.contains(target)) handler(ev, target);
    });
}

export function setClass(node, name, active) {
    if (node) node.classList.toggle(name, !!active);
    return node;
}

export function setText(node, value) {
    if (node && node.textContent !== String(value)) node.textContent = String(value);
    return node;
}

/** Toggle a one-shot CSS animation class (re-triggered by forcing a reflow). */
export function animate(node, name, ms = 600) {
    if (!node) return;
    node.classList.remove(name);
    void node.offsetWidth;
    node.classList.add(name);
    setTimeout(() => node.classList.remove(name), ms);
}

export function measure(node) {
    const r = node?.getBoundingClientRect?.();
    return r ? { width: r.width, height: r.height, top: r.top, left: r.left, right: r.right, bottom: r.bottom } : null;
}

export const isMobile = () => window.matchMedia('(max-width: 700px)').matches;

/** Focus trap helper used by the panel on mobile. */
export function focusFirst(root) {
    const node = root?.querySelector('input, select, textarea, button:not([disabled])');
    if (node && typeof node.focus === 'function') node.focus();
}
