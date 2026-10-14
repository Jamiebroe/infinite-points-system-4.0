// Reusable interface widgets shared by every System tab.
import { el, clear, mount } from './dom.js';

export const card = (children, cls = '') => el('div', { class: `ipi-card ${cls}` }, children);
export const row = (children, cls = '') => el('div', { class: `ipi-row ${cls}` }, children);
export const cols = (children, cls = '') => el('div', { class: `ipi-cols ${cls}` }, children);
export const spacer = () => el('div', { class: 'ipi-spacer' });

export function section(title, children, { hint = '', actions = [], icon = '' } = {}) {
    return el('section', { class: 'ipi-section' }, [
        el('header', { class: 'ipi-section__head' }, [
            el('h3', { class: 'ipi-section__title' }, [icon ? el('span', { class: 'ipi-section__icon', text: icon }) : null, title]),
            hint ? el('span', { class: 'ipi-section__hint', text: hint }) : null,
            actions.length ? el('div', { class: 'ipi-section__actions' }, actions) : null,
        ]),
        el('div', { class: 'ipi-section__body' }, children),
    ]);
}

export function empty(text, icon = '✨') {
    return el('div', { class: 'ipi-empty' }, [el('div', { class: 'ipi-empty__icon', text: icon }), el('div', { text })]);
}

export function chip(text, { kind = '', title = '', onClick = null, active = false } = {}) {
    return el(onClick ? 'button' : 'span', {
        class: `ipi-chip ${kind ? `ipi-chip--${kind}` : ''} ${active ? 'ipi-chip--active' : ''}`,
        text, title, onClick: onClick || undefined,
    });
}

export function badge(text, kind = '') {
    return el('span', { class: `ipi-badge ${kind ? `ipi-badge--${kind}` : ''}`, text });
}

export function button(label, { kind = 'primary', icon = '', onClick, title = '', disabled = false, sm = false, id = '' } = {}) {
    return el('button', {
        class: `ipi-btn ipi-btn--${kind} ${sm ? 'ipi-btn--sm' : ''}`, title, disabled, id: id || undefined,
        onClick: onClick ? ev => { ev.preventDefault(); ev.stopPropagation(); onClick(ev); } : undefined,
    }, [icon ? el('span', { class: 'ipi-btn__icon', text: icon }) : null, el('span', { text: label })]);
}

export function progress(value, { kind = '', label = '', title = '' } = {}) {
    const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    return el('div', { class: `ipi-progress ${kind ? `ipi-progress--${kind}` : ''}`, title: title || `${v}%` }, [
        el('div', { class: 'ipi-progress__fill', style: { width: `${v}%` } }),
        label ? el('div', { class: 'ipi-progress__label', text: label }) : null,
    ]);
}

export function statTile(label, value, hint = '', { kind = '', icon = '' } = {}) {
    return el('div', { class: `ipi-tile ${kind ? `ipi-tile--${kind}` : ''}` }, [
        icon ? el('div', { class: 'ipi-tile__icon', text: icon }) : null,
        el('div', { class: 'ipi-tile__value', text: value }),
        el('div', { class: 'ipi-tile__label', text: label }),
        hint ? el('div', { class: 'ipi-tile__hint', text: hint }) : null,
    ]);
}

// ---------------------------------------------------------------- form controls
function labelled(label, control, hint = '') {
    return el('label', { class: 'ipi-field' }, [
        el('span', { class: 'ipi-field__label', text: label }),
        control,
        hint ? el('span', { class: 'ipi-field__hint', text: hint }) : null,
    ]);
}

export function input(value, { onInput, type = 'text', placeholder = '', min = null, max = null, step = null, disabled = false, id = '' } = {}) {
    const node = el('input', { class: 'ipi-input', type, placeholder, disabled, id: id || undefined });
    node.value = value ?? '';
    if (min !== null) node.min = min;
    if (max !== null) node.max = max;
    if (step !== null) node.step = step;
    if (onInput) node.addEventListener('input', () => onInput(node.value, node));
    return node;
}

export function textarea(value, { onInput, rows = 3, placeholder = '', disabled = false } = {}) {
    const node = el('textarea', { class: 'ipi-input ipi-input--area', rows, placeholder, disabled });
    node.value = value ?? '';
    if (onInput) node.addEventListener('input', () => onInput(node.value, node));
    return node;
}

export function select(value, options, { onChange, disabled = false } = {}) {
    const node = el('select', { class: 'ipi-input ipi-select', disabled, onChange: onChange ? () => onChange(node.value) : undefined });
    for (const opt of options) {
        const o = el('option', { value: opt.value, text: opt.label });
        if (String(opt.value) === String(value)) o.selected = true;
        node.append(o);
    }
    return node;
}

export function toggle(checked, { onChange, label = '', disabled = false } = {}) {
    const node = el('button', { class: `ipi-switch ${checked ? 'ipi-switch--on' : ''}`, type: 'button', role: 'switch', 'aria-checked': String(!!checked), disabled });
    node.append(el('span', { class: 'ipi-switch__knob' }));
    node.addEventListener('click', () => {
        const next = !node.classList.contains('ipi-switch--on');
        node.classList.toggle('ipi-switch--on', next);
        node.setAttribute('aria-checked', String(next));
        onChange?.(next);
    });
    return label ? el('div', { class: 'ipi-switchrow' }, [node, el('span', { class: 'ipi-switchrow__label', text: label })]) : node;
}

export const field = labelled;
export const fieldText = (label, value, opts = {}) => labelled(label, input(value, opts), opts.hint || '');
export const fieldNumber = (label, value, opts = {}) => labelled(label, input(value, { type: 'number', ...opts }), opts.hint || '');
export const fieldSelect = (label, value, options, opts = {}) => labelled(label, select(value, options, opts), opts.hint || '');
export const fieldTextarea = (label, value, opts = {}) => labelled(label, textarea(value, opts), opts.hint || '');

export function fieldToggle(label, checked, opts = {}) {
    return el('div', { class: 'ipi-field ipi-field--inline' }, [
        toggle(checked, opts),
        el('span', { class: 'ipi-field__label', text: label }),
        opts.hint ? el('span', { class: 'ipi-field__hint', text: opts.hint }) : null,
    ]);
}

/** A list editor row: [content] [actions]. */
export function listRow(content, actions = [], cls = '') {
    return el('div', { class: `ipi-listrow ${cls}` }, [
        el('div', { class: 'ipi-listrow__main' }, content),
        actions.length ? el('div', { class: 'ipi-listrow__actions' }, actions) : null,
    ]);
}

/** Collapsible details block used for advanced settings. */
export function disclosure(summary, children, { open = false } = {}) {
    const node = el('details', { class: 'ipi-details' }, [
        el('summary', { class: 'ipi-details__summary', text: summary }),
        el('div', { class: 'ipi-details__body' }, children),
    ]);
    node.open = open;
    return node;
}

/** Inline notice used for validation errors and hints. */
export function notice(text, kind = 'info') {
    return el('div', { class: `ipi-notice ipi-notice--${kind}`, text });
}

export { mount, clear };
