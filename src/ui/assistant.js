// The private System Shop assistant: only the User can see or hear it.
// Comments come from templates (offline, free) or the AI when explicitly enabled.
import { el } from './dom.js';
import { card, button, fieldSelect, fieldToggle, input, chip, row } from './controls.js';
import { PERSONALITIES } from '../ai.js';
import { when } from '../time.js';

const PERSONALITY_OPTIONS = Object.entries(PERSONALITIES).map(([value, hint]) => ({ value, label: `${value[0].toUpperCase()}${value.slice(1)} — ${hint}` }));

/**
 * Assistant card used by the Points and Shop tabs.
 * ctx: { settings, save, rerender, aiAvailable, askAssistant }
 */
export function assistantCard(ctx) {
    const a = ctx.settings.assistant;
    const log = ctx.assistantLog();
    const body = [];

    body.push(el('div', { class: 'ipi-assistant__head' }, [
        el('div', { class: 'ipi-assistant__avatar', text: '💬' }),
        el('div', { class: 'ipi-assistant__meta' }, [
            el('div', { class: 'ipi-assistant__name', text: a.name || 'Echo' }),
            el('div', { class: 'ipi-assistant__role', text: `${a.personality} · private to you` }),
        ]),
        chip(a.enabled ? 'Enabled' : 'Muted', { kind: a.enabled ? 'good' : 'muted' }),
    ]));

    body.push(el('div', { class: 'ipi-assistant__feed' }, log.length
        ? log.slice(0, 6).map(entry => el('div', { class: 'ipi-assistant__line' }, [
            el('span', { class: 'ipi-assistant__time', text: when(entry.ts) }),
            el('span', { class: 'ipi-assistant__text', text: entry.text }),
        ]))
        : [el('div', { class: 'ipi-assistant__line ipi-assistant__line--muted', text: 'No commentary yet. It speaks when the Shop rotates, when you buy something, and when you reach a milestone.' })]));

    if (a.enabled) {
        body.push(el('div', { class: 'ipi-assistant__controls' }, [
            fieldToggle('Commentary', a.enabled, {
                onChange: v => { a.enabled = v; ctx.save(); ctx.rerender(); },
            }),
            fieldToggle('Also show as notification', !!a.toasts, {
                onChange: v => { a.toasts = v; ctx.save(); },
            }),
            fieldToggle('Use the AI for commentary', !!a.useAi, {
                hint: ctx.aiAvailable ? 'Uses your configured AI source.' : 'Requires an AI source in Settings → AI.',
                onChange: v => { a.useAi = v; ctx.save(); },
            }),
            fieldSelect('Personality', a.personality, PERSONALITY_OPTIONS, {
                onChange: v => { a.personality = v; ctx.save(); ctx.rerender(); },
            }),
            el('label', { class: 'ipi-field' }, [
                el('span', { class: 'ipi-field__label', text: 'Name' }),
                input(a.name, { onInput: v => { a.name = v; ctx.save(); } }),
            ]),
        ]));
    } else {
        body.push(el('div', { class: 'ipi-assistant__controls' }, [
            button('Unmute assistant', { icon: '🔊', onClick: () => { a.enabled = true; ctx.save(); ctx.rerender(); } }),
        ]));
    }

    if (ctx.aiAvailable && a.enabled) {
        let value = '';
        const box = input('', {
            placeholder: 'Ask for a recommendation…',
            onInput: v => { value = v; },
        });
        const send = async () => {
            const text = value.trim();
            if (!text) return;
            box.value = ''; value = '';
            await ctx.askAssistant(text);
        };
        box.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); send(); } });
        body.push(row([box, button('Ask', { icon: '✨', onClick: send })], 'ipi-assistant__ask'));
    }

    return card([el('div', { class: 'ipi-assistant' }, body)], 'ipi-card--assistant');
}
