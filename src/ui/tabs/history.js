// History tab: notification log, detected events (with manual corrections) and the full ledger.
import { el, mount } from '../dom.js';
import { card, section, row, button, chip, badge, empty, input, select } from '../controls.js';
import { eventRows, ledgerRows, ledgerKinds, ledgerCsv } from '../viewmodel.js';
import { renderNotifications } from '../notify.js';
import { truncate } from '../../util.js';

const state = { catId: '', includeRevoked: true, kinds: null, query: '', showNotifications: true };
export function render(body, ctx) {
    if (!ctx.ready) { mount(body, [card([empty('Open a chat to see History.', '🕘')])]); return; }

    const events = eventRows(ctx.progress, { catId: state.catId, includeRevoked: state.includeRevoked, limit: 300 });
    const kinds = ledgerKinds(ctx.progress);
    const ledger = ledgerRows(ctx.progress, { kinds: state.kinds, query: state.query, limit: 300 });

    // ---- notifications
    const notifBox = el('div', { class: 'ipi-notiflist' });
    renderNotifications(notifBox, { onClear: () => ctx.rerender() });
    const notifCard = card([section('Notifications', [notifBox], {
        icon: '🔔',
        actions: [button(state.showNotifications ? 'Hide' : 'Show', { kind: 'ghost', sm: true, onClick: () => { state.showNotifications = !state.showNotifications; ctx.rerender(); } })],
    })]);

    // ---- event history
    const catSelect = select(state.catId, [{ value: '', label: 'All categories' }, ...ctx.settings.categories.map(c => ({ value: c.id, label: `${c.icon} ${c.name}` }))], {
        onChange: v => { state.catId = v; ctx.rerender(); },
    });
    const eventCard = card([section(`Event history (${events.length})`, [
        row([
            el('label', { class: 'ipi-field ipi-grow' }, [el('span', { class: 'ipi-field__label', text: 'Category' }), catSelect]),
            chip(state.includeRevoked ? 'Showing revoked' : 'Hiding revoked', { active: state.includeRevoked, onClick: () => { state.includeRevoked = !state.includeRevoked; ctx.rerender(); } }),
            button('Export events (JSON)', { kind: 'ghost', sm: true, icon: '⬇️', onClick: () => ctx.actions.exportEvents(events) }),
        ]),
        events.length
            ? events.slice(0, 120).map(e => eventRow(e, ctx))
            : [empty('No events detected yet. Events are awarded automatically as the story progresses.', '🎭')],
        events.length > 120 ? el('div', { class: 'ipi-hint', text: `Showing the 120 most recent of ${events.length} events.` }) : null,
    ], { icon: '🎭', hint: 'Every reward is listed here exactly once; revoked events stay visible for transparency.' })]);

    // ---- manual event
    const manualCat = select(ctx.settings.categories[0]?.id || '', ctx.settings.categories.map(c => ({ value: c.id, label: `${c.icon} ${c.name} (${c.points})` })));
    const manualText = input('', { placeholder: 'What happened in the story?' });
    const manualPoints = input('', { type: 'number', placeholder: 'override reward (optional)' });
    const manualCard = card([section('Add an event manually', [
        row([
            el('label', { class: 'ipi-field ipi-grow' }, [el('span', { class: 'ipi-field__label', text: 'Category' }), manualCat]),
            el('label', { class: 'ipi-field ipi-grow' }, [el('span', { class: 'ipi-field__label', text: 'Note' }), manualText]),
            el('label', { class: 'ipi-field' }, [el('span', { class: 'ipi-field__label', text: 'Points' }), manualPoints]),
            button('Add', { icon: '➕', onClick: () => {
                const points = manualPoints.value === '' ? null : Number(manualPoints.value);
                ctx.actions.addEvent(manualCat.value, manualText.value, points);
                manualText.value = ''; manualPoints.value = '';
            } }),
        ]),
        el('div', { class: 'ipi-hint', text: 'Useful when AI analysis is unavailable or when you want to credit something the rules missed. Manual events are never awarded twice.' }),
    ], { icon: '✎' })]);

    // ---- transaction ledger
    const queryBox = input(state.query, {
        placeholder: 'Search notes…',
        onInput: v => {
            state.query = v;
            clearTimeout(state.timer);
            state.timer = setTimeout(() => ctx.rerender(), 250);
        },
    });
    const ledgerCard = card([section(`Transaction ledger (${ledger.length})`, [
        row([
            el('div', { class: 'ipi-quickrow' }, [
                chip('All', { active: !state.kinds, onClick: () => { state.kinds = null; ctx.rerender(); } }),
                ...kinds.map(k => chip(`${k.label} (${k.count})`, { active: state.kinds?.includes(k.kind), onClick: () => { state.kinds = [k.kind]; ctx.rerender(); } })),
            ]),
            el('label', { class: 'ipi-field ipi-grow' }, [el('span', { class: 'ipi-field__label', text: 'Search' }), queryBox]),
            button('Export CSV', { kind: 'ghost', sm: true, icon: '⬇️', onClick: () => ctx.actions.exportCsv(ledgerCsv(ledger)) }),
        ]),
        el('div', { class: 'ipi-ledger' }, ledger.length
            ? ledger.slice(0, 150).map(t => el('div', { class: `ipi-ledger__row ipi-ledger__row--${t.positive ? 'in' : t.negative ? 'out' : 'zero'}` }, [
                el('span', { class: 'ipi-ledger__time', text: t.whenText }),
                badge(t.kindLabel, t.kind === 'purchase' ? 'warn' : t.positive ? 'good' : 'muted'),
                el('span', { class: 'ipi-ledger__note ipi-truncate', text: t.note, title: t.note }),
                el('span', { class: 'ipi-ledger__amount', text: t.amountText }),
                el('span', { class: 'ipi-ledger__balance', text: `→ ${t.balanceText}` }),
            ]))
            : [empty('No transactions yet.', '🧾')]),
        ledger.length > 150 ? el('div', { class: 'ipi-hint', text: `Showing the 150 most recent of ${ledger.length} entries. Export for the complete ledger.` }) : null,
    ], { icon: '🧾', hint: 'The ledger is the complete audit trail — it always sums to your balance.' })]);

    mount(body, [
        state.showNotifications ? notifCard : null,
        eventCard,
        manualCard,
        ledgerCard,
    ].filter(Boolean));
}

function eventRow(e, ctx) {
    let newPoints = null;
    const box = input(e.points, { type: 'number' });
    box.addEventListener('input', () => { newPoints = Number(box.value); });
    return el('article', { class: `ipi-event${e.revoked ? ' ipi-event--revoked' : ''}` }, [
        el('header', { class: 'ipi-event__head' }, [
            el('span', { class: 'ipi-event__icon', text: e.icon }),
            el('strong', { class: 'ipi-event__cat', text: e.catName }),
            e.intensity ? badge(e.intensity, 'muted') : null,
            badge(e.sourceLabel, 'muted'),
            e.adjusted ? badge('corrected', 'accent') : null,
            e.revoked ? badge(`revoked: ${e.revokedReason}`, 'warn') : null,
            el('span', { class: 'ipi-grow' }),
            el('span', { class: 'ipi-event__points', text: e.pointsText }),
            el('span', { class: 'ipi-event__time', text: e.whenText }),
        ]),
        e.snippet ? el('blockquote', { class: 'ipi-event__snippet', text: truncate(e.snippet, 200) }) : null,
        el('div', { class: 'ipi-event__foot' }, [
            e.chars.length ? el('div', { class: 'ipi-quickrow' }, e.chars.map(c => chip(c, { kind: 'muted' }))) : el('span', { class: 'ipi-muted', text: 'no character attributed' }),
            el('span', { class: 'ipi-grow' }),
            box,
            button('Correct', { kind: 'ghost', sm: true, onClick: () => ctx.actions.adjustEvent(e.key, newPoints ?? e.points) }),
            e.revoked ? null : button('Revoke', { kind: 'danger', sm: true, onClick: () => ctx.actions.revokeEvent(e.key) }),
        ]),
    ]);
}

