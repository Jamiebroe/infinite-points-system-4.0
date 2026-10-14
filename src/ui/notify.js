// In-panel notifications: animated toasts + a persisted notification log (bell menu).
// Kept out of the chat area so roleplay is never interrupted.
import { el, mount, clear, animate } from './dom.js';

const STORE_KEY = 'infinite_points_notifications';
const MAX = 60;
const TOAST_MAX = 4;

let host = null;          // toast container
let list = load();
let unread = 0;
let live = 0;
const listeners = new Set();

function load() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
        return Array.isArray(raw) ? raw.slice(0, MAX) : [];
    } catch { return []; }
}

function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* storage full/blocked */ }
}

function emit() {
    for (const fn of listeners) { try { fn(list, unread); } catch (e) { console.error('[infinite_points] notification listener failed', e); } }
}

export function onNotifications(fn) {
    listeners.add(fn);
    fn(list, unread);
    return () => listeners.delete(fn);
}

export function initNotifications(node) {
    host = node;
    emit();
}

export function notifications() { return list.slice(); }
export function unreadCount() { return unread; }

export function markAllRead() {
    unread = 0;
    emit();
}

export function clearNotifications() {
    list = [];
    unread = 0;
    save();
    emit();
}

/** Push a notification. `kind`: info | success | warning | error | award | purchase | assistant */
export function notify({ kind = 'info', title = '', text = '', icon = '', sticky = false, timeout = 5200, silent = false } = {}) {
    const entry = { id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ts: Date.now(), kind, title, text, icon, read: false };
    list.unshift(entry);
    list.length = Math.min(list.length, MAX);
    unread++;
    save();
    emit();
    if (host && !silent) toast(entry, sticky ? 0 : timeout);
    return entry;
}

function toast(entry, timeout) {
    if (live >= TOAST_MAX && host.firstChild) {
        host.removeChild(host.firstChild);
        live--;
    }
    const bar = el('div', { class: 'ipi-toast__bar' });
    const node = el('div', { class: `ipi-toast ipi-toast--${entry.kind}`, role: 'status' }, [
        el('div', { class: 'ipi-toast__icon', text: entry.icon || KIND_ICON[entry.kind] || 'ℹ️' }),
        el('div', { class: 'ipi-toast__body' }, [
            entry.title ? el('div', { class: 'ipi-toast__title', text: entry.title }) : null,
            entry.text ? el('div', { class: 'ipi-toast__text', text: entry.text }) : null,
        ]),
        el('button', { class: 'ipi-toast__close', title: 'Dismiss', 'aria-label': 'Dismiss', onClick: () => dismiss() }),
        bar,
    ]);
    let timer = null;
    const dismiss = () => {
        if (!node.parentNode) return;
        clearTimeout(timer);
        node.classList.add('ipi-toast--out');
        setTimeout(() => { node.remove(); live = Math.max(0, live - 1); }, 220);
    };
    if (timeout > 0) {
        timer = setTimeout(dismiss, timeout);
        bar.style.animationDuration = `${timeout}ms`;
        node.addEventListener('mouseenter', () => { clearTimeout(timer); bar.style.animationPlayState = 'paused'; });
        node.addEventListener('mouseleave', () => {
            bar.style.animationPlayState = 'running';
            timer = setTimeout(dismiss, 1800);
        });
    } else {
        bar.classList.add('ipi-toast__bar--static');
    }
    host.append(node);
    live++;
    animate(node, 'ipi-pop');
}

const KIND_ICON = {
    info: 'ℹ️', success: '✅', warning: '⚠️', error: '⛔', award: '✨', purchase: '🛒', assistant: '💬', achievement: '🏅', milestone: '🎯',
};

/** Render the notification log into a container (used by the History tab's bell panel). */
export function renderNotifications(node, { onClear } = {}) {
    clear(node);
    if (!list.length) {
        node.append(el('div', { class: 'ipi-empty', text: 'No notifications yet.' }));
        return node;
    }
    const rows = list.map(n => el('div', { class: `ipi-notif ipi-notif--${n.kind}` }, [
        el('div', { class: 'ipi-notif__icon', text: n.icon || KIND_ICON[n.kind] || 'ℹ️' }),
        el('div', { class: 'ipi-notif__body' }, [
            n.title ? el('div', { class: 'ipi-notif__title', text: n.title }) : null,
            n.text ? el('div', { class: 'ipi-notif__text', text: n.text }) : null,
        ]),
        el('div', { class: 'ipi-notif__time', text: new Date(n.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }),
    ]));
    mount(node, [
        el('div', { class: 'ipi-row ipi-row--end' }, [
            el('button', { class: 'ipi-btn ipi-btn--ghost ipi-btn--sm', text: 'Clear all', onClick: () => { clearNotifications(); onClear?.(); } }),
        ]),
        ...rows,
    ]);
    return node;
}

export { KIND_ICON };
