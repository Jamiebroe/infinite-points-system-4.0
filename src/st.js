// Thin wrappers around the supported SillyTavern extension API (SillyTavern.getContext()).
// Every other module talks to SillyTavern only through this file.

export const ctx = () => SillyTavern.getContext();
export const libs = () => (globalThis.SillyTavern && SillyTavern.libs) || {};

export function chatId() {
    try { return ctx().getCurrentChatId() || null; } catch { return null; }
}

export function hasChat() {
    const c = ctx();
    if (!chatId()) return false;
    return !!c.groupId || (c.characterId !== undefined && c.characterId !== null && c.characterId !== '');
}

/** Identity of the active character or group (used for shared profiles). */
export function currentOwner() {
    const c = ctx();
    if (c.groupId) {
        const g = (c.groups || []).find(x => String(x.id) === String(c.groupId));
        const members = (g?.members || []).map(av => (c.characters || []).find(ch => ch.avatar === av)?.name).filter(Boolean);
        return { key: `group:${c.groupId}`, name: g?.name || 'Group chat', group: true, members };
    }
    const ch = (c.characters || [])[c.characterId];
    if (!ch) return null;
    return { key: `char:${ch.avatar}`, name: ch.name, group: false, members: [ch.name] };
}

export function userName() {
    return ctx().name1 || 'User';
}

/** Short description of the setting for AI product generation (character card + scenario). */
export function settingSummary(maxLen = 900) {
    const c = ctx();
    try {
        if (c.groupId) {
            const o = currentOwner();
            return `Group roleplay with: ${o?.members.join(', ')}`.slice(0, maxLen);
        }
        const ch = (c.characters || [])[c.characterId];
        if (!ch) return '';
        const parts = [`Character: ${ch.name}`];
        if (ch.scenario) parts.push(`Scenario: ${ch.scenario}`);
        if (ch.description) parts.push(`Description: ${ch.description}`);
        return c.substituteParams ? c.substituteParams(parts.join('\n')).slice(0, maxLen) : parts.join('\n').slice(0, maxLen);
    } catch {
        return '';
    }
}

export function toast(type, message, title = '', opts = {}) {
    try {
        if (globalThis.toastr) globalThis.toastr[type](message, title, { timeOut: 4000, escapeHtml: true, ...opts });
    } catch { /* ignore */ }
}

export async function confirmPopup(html, okText = 'Confirm', cancelText = 'Cancel') {
    const c = ctx();
    const r = await c.callGenericPopup(html, c.POPUP_TYPE.CONFIRM, '', { okButton: okText, cancelButton: cancelText, allowVerticalScrolling: true });
    return r === c.POPUP_RESULT.AFFIRMATIVE;
}

export async function inputPopup(html, defaultValue = '', okText = 'Save') {
    const c = ctx();
    const r = await c.callGenericPopup(html, c.POPUP_TYPE.INPUT, String(defaultValue ?? ''), { okButton: okText, cancelButton: 'Cancel', rows: 3 });
    return r === false || r === null || r === undefined ? null : String(r);
}

export async function textPopup(html) {
    const c = ctx();
    return c.callGenericPopup(html, c.POPUP_TYPE.TEXT, '', { okButton: 'Close', allowVerticalScrolling: true, wide: true });
}

export function isGenerating() {
    try { return !!document.querySelector('#send_but')?.classList.contains('displayNone') && !!document.querySelector('#mes_stop:not(.displayNone)'); } catch { return false; }
}

export function sanitize(html) {
    const { DOMPurify } = libs();
    return DOMPurify ? DOMPurify.sanitize(html) : html;
}
