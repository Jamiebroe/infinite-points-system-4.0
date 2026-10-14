// The System interface shell: floating button, collapsible panel, tab bar, footer status
// and the notification bell. Rendering of tab contents is delegated to index.js.
import { el, mount, qs, on, animate, setText } from './dom.js';
import { initNotifications, markAllRead, renderNotifications } from './notify.js';
import { COLOR_THEMES } from '../content.js';

export const TABS = [
    { id: 'overview', label: 'Points', icon: '◈' },
    { id: 'shop', label: 'Shop', icon: '🛒' },
    { id: 'inventory', label: 'Inventory', icon: '🎒' },
    { id: 'stats', label: 'Statistics', icon: '📊' },
    { id: 'achievements', label: 'Achievements', icon: '🏅' },
    { id: 'history', label: 'History', icon: '🕘' },
    { id: 'memory', label: 'Shop Memory', icon: '🧠' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
];

const POS_KEY = 'infinite_points_button_pos';

function loadPos() {
    try { return JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch { return null; }
}

function savePos(pos) {
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
}

/** Build the shell. `render(body, tabId)` is called whenever a tab must be drawn. */
export function mountShell({ render, onPositionChange, onOpenChange, onTabChange } = {}) {
    const existing = qs('#ipi-root');
    if (existing) existing.remove();

    const tabsEl = el('nav', { class: 'ipi-tabs', role: 'tablist' });
    const tabButtons = new Map();
    for (const t of TABS) {
        const btn = el('button', { class: 'ipi-tab', role: 'tab', 'data-tab': t.id, title: t.label }, [
            el('span', { class: 'ipi-tab__icon', text: t.icon }),
            el('span', { class: 'ipi-tab__label', text: t.label }),
            el('span', { class: 'ipi-tab__badge ipi-hidden' }),
        ]);
        btn.addEventListener('click', () => api.setTab(t.id));
        tabButtons.set(t.id, btn);
        tabsEl.append(btn);
    }

    const balanceChip = el('div', { class: 'ipi-balance' }, [
        el('span', { class: 'ipi-balance__value', text: '0' }),
        el('span', { class: 'ipi-balance__unit', text: 'Points' }),
    ]);
    const bellCount = el('span', { class: 'ipi-bell__count ipi-hidden' });
    const bell = el('button', { class: 'ipi-iconbtn ipi-bell', title: 'Notifications' }, [el('span', { text: '🔔' }), bellCount]);
    const collapseBtn = el('button', { class: 'ipi-iconbtn', title: 'Collapse panel' }, [el('span', { text: '▾' })]);
    const closeBtn = el('button', { class: 'ipi-iconbtn', title: 'Close (Esc)' }, [el('span', { text: '✕' })]);
    const titleEl = el('div', { class: 'ipi-head__title', text: 'The System' });
    const subEl = el('div', { class: 'ipi-head__sub', text: 'no chat open' });

    const head = el('header', { class: 'ipi-head' }, [
        el('div', { class: 'ipi-head__brand' }, [
            el('div', { class: 'ipi-head__sigil', text: '◈' }),
            el('div', { class: 'ipi-head__text' }, [titleEl, subEl]),
        ]),
        balanceChip,
        el('div', { class: 'ipi-head__actions' }, [bell, collapseBtn, closeBtn]),
    ]);

    const body = el('div', { class: 'ipi-body', role: 'tabpanel' });
    const statusEl = el('div', { class: 'ipi-foot__status', text: 'Ready.' });
    const resetEl = el('div', { class: 'ipi-foot__reset', text: '' });
    const foot = el('footer', { class: 'ipi-foot' }, [statusEl, resetEl]);

    const notifBody = el('div', { class: 'ipi-notifdrawer__body' });
    const notifPanel = el('div', { class: 'ipi-notifdrawer ipi-hidden' }, [
        el('div', { class: 'ipi-notifdrawer__head' }, [
            el('span', { text: 'Notifications' }),
            el('button', { class: 'ipi-iconbtn', title: 'Close', onClick: () => api.setNotificationsOpen(false) }, [el('span', { text: '✕' })]),
        ]),
        notifBody,
    ]);

    const panel = el('div', { class: 'ipi-panel ipi-hidden', role: 'dialog', 'aria-label': 'The System' }, [
        head, tabsEl,
        el('div', { class: 'ipi-content' }, [body, notifPanel]),
        foot,
    ]);

    const toasts = el('div', { class: 'ipi-toasts', 'aria-live': 'polite' });

    const fabBadge = el('span', { class: 'ipi-fab__badge', text: '0' });
    const fab = el('button', { class: 'ipi-fab', title: 'Open The System (Ctrl+Shift+S)', 'aria-label': 'Open The System' }, [
        el('span', { class: 'ipi-fab__sigil', text: '◈' }),
        el('span', { class: 'ipi-fab__label', text: 'System' }),
        fabBadge,
    ]);

    const root = el('div', { class: 'ipi-root', id: 'ipi-root' }, [fab, panel, toasts]);
    document.body.append(root);
    initNotifications(toasts);

    // ------------------------------------------------------------ state
    let active = 'overview';
    let opened = false;
    let compact = false;
    let notificationsOpen = false;

    const api = {
        root, fab, panel, body, tabsEl, toasts,
        setRenderer(fn) { render = fn; },
        activeTab: () => active,
        isOpen: () => opened,
        isNotificationsOpen: () => notificationsOpen,

        setTab(id, { silent = false } = {}) {
            if (!TABS.some(t => t.id === id)) return;
            active = id;
            for (const [tid, btn] of tabButtons) {
                const isActive = tid === id;
                btn.classList.toggle('ipi-tab--active', isActive);
                btn.setAttribute('aria-selected', String(isActive));
            }
            api.draw();
            if (!silent) onTabChange?.(id);
        },

        draw() {
            try { render?.(body, active); } catch (e) {
                console.error('[infinite_points] tab render failed', e);
                mount(body, el('div', { class: 'ipi-notice ipi-notice--error', text: `This tab failed to render: ${e.message}` }));
            }
        },

        refresh() { api.draw(); },

        open({ tab } = {}) {
            if (tab) {
                active = tab;
                for (const [tid, btn] of tabButtons) btn.classList.toggle('ipi-tab--active', tid === active);
            }
            opened = true;
            panel.classList.remove('ipi-hidden');
            fab.classList.add('ipi-fab--open');
            animate(panel, 'ipi-slidein');
            api.draw();
            onOpenChange?.(true);
            api.setUnread(0);
            markAllRead();
        },

        close() {
            opened = false;
            panel.classList.add('ipi-hidden');
            fab.classList.remove('ipi-fab--open');
            api.setNotificationsOpen(false);
            onOpenChange?.(false);
        },

        toggle() { opened ? api.close() : api.open(); },

        setNotificationsOpen(v) {
            notificationsOpen = !!v;
            notifPanel.classList.toggle('ipi-hidden', !notificationsOpen);
            if (notificationsOpen) {
                markAllRead();
                api.setUnread(0);
                renderNotifications(notifBody, { onClear: () => api.draw() });
            }
        },

        setUnread(n) {
            setText(bellCount, n > 99 ? '99+' : String(n || 0));
            bellCount.classList.toggle('ipi-hidden', !n);
        },

        setBalance(value, unit) {
            setText(qs('.ipi-balance__value', balanceChip), value);
            if (unit) setText(qs('.ipi-balance__unit', balanceChip), unit);
            setText(fabBadge, value);
        },

        setTitle(title, sub) {
            setText(titleEl, title || 'The System');
            if (sub !== undefined) setText(subEl, sub || '');
        },

        setStatus(text) { setText(statusEl, text || ''); },
        setReset(text) { setText(resetEl, text || ''); },

        pulse(kind = 'award') { animate(fab, kind === 'award' ? 'ipi-pulse' : 'ipi-wobble', 900); },

        setTabBadge(id, text) {
            const btn = tabButtons.get(id);
            if (!btn) return;
            const b = qs('.ipi-tab__badge', btn);
            setText(b, text || '');
            b.classList.toggle('ipi-hidden', !text);
        },

        setCompact(v) {
            compact = !!v;
            root.classList.toggle('ipi-compact', compact);
            setText(qs('span', collapseBtn), compact ? '▸' : '▾');
        },

        setTheme(ui = {}) {
            const theme = COLOR_THEMES[ui.theme] || COLOR_THEMES.void;
            const vars = {
                '--ipi-accent': ui.accent || theme.accent,
                '--ipi-accent2': theme.accent2,
                '--ipi-bg': theme.bg,
                '--ipi-panel': theme.panel,
                '--ipi-text': theme.text,
                '--ipi-muted': theme.muted,
            };
            for (const [k, v] of Object.entries(vars)) if (v) root.style.setProperty(k, v);
            root.classList.toggle('ipi-no-anim', ui.animations === false);
            root.classList.toggle('ipi-light', ui.theme === 'light');
            if (ui.buttonSize) root.style.setProperty('--ipi-fab-size', `${Math.max(40, Math.min(96, Number(ui.buttonSize) || 56))}px`);
            root.classList.toggle('ipi-compact', !!ui.compact || compact);
        },

        setFabVisible(v) { fab.classList.toggle('ipi-hidden', !v); },

        positionFab(pos) {
            if (!pos) return;
            const size = fab.offsetWidth || 56;
            const maxX = Math.max(8, window.innerWidth - size - 8);
            const maxY = Math.max(8, window.innerHeight - size - 8);
            const x = Math.max(8, Math.min(maxX, Number(pos.x) || 0));
            const y = Math.max(8, Math.min(maxY, Number(pos.y) || 0));
            fab.style.left = `${x}px`;
            fab.style.top = `${y}px`;
            fab.style.right = 'auto';
            fab.style.bottom = 'auto';
        },

        destroy() {
            window.removeEventListener('keydown', keyHandler);
            window.removeEventListener('resize', resizeHandler);
            root.remove();
        },
    };

    // ------------------------------------------------------------ interaction
    let dragging = false, moved = false, start = null;

    fab.addEventListener('pointerdown', ev => {
        if (ev.button !== 0) return;
        dragging = true; moved = false;
        const r = fab.getBoundingClientRect();
        start = { x: ev.clientX, y: ev.clientY, left: r.left, top: r.top };
        fab.setPointerCapture?.(ev.pointerId);
        fab.classList.add('ipi-fab--dragging');
    });

    on(window, 'pointermove', ev => {
        if (!dragging || !start) return;
        const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return;
        moved = true;
        api.positionFab({ x: start.left + dx, y: start.top + dy });
    });

    on(window, 'pointerup', () => {
        if (!dragging) return;
        dragging = false;
        fab.classList.remove('ipi-fab--dragging');
        if (moved) {
            const r = fab.getBoundingClientRect();
            const pos = { x: Math.round(r.left), y: Math.round(r.top) };
            savePos(pos);
            onPositionChange?.(pos);
        } else {
            api.toggle();
        }
        start = null;
    });

    closeBtn.addEventListener('click', () => api.close());
    collapseBtn.addEventListener('click', () => api.setCompact(!compact));
    bell.addEventListener('click', () => api.setNotificationsOpen(!notificationsOpen));

    const keyHandler = ev => {
        if (ev.key === 'Escape' && opened) api.close();
        else if (ev.ctrlKey && ev.shiftKey && (ev.key === 'S' || ev.key === 's')) { ev.preventDefault(); api.toggle(); }
    };
    on(window, 'keydown', keyHandler);

    // Keep the button on screen when the window shrinks (mobile rotation, resize).
    const resizeHandler = () => {
        if (fab.style.left) api.positionFab({ x: parseFloat(fab.style.left), y: parseFloat(fab.style.top) });
    };
    on(window, 'resize', resizeHandler);

    const pos = loadPos();
    if (pos) api.positionFab(pos);
    api.setTab('overview', { silent: true });
    return api;
}
