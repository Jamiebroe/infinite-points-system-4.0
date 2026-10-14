// Inventory tab: permanent abilities, equipment, consumables, services and live effects.
import { el, mount } from '../dom.js';
import { card, section, button, chip, badge, empty, progress, disclosure, row } from '../controls.js';
import { inventoryModel } from '../viewmodel.js';

export function render(body, ctx) {
    if (!ctx.ready) { mount(body, [card([empty('Open a chat to see your Inventory.', '🎒')])]); return; }
    const inv = inventoryModel({ settings: ctx.settings, progress: ctx.progress, chatId: ctx.chatId, msgCount: ctx.msgCount });

    if (inv.empty) {
        mount(body, [card([empty('Nothing owned yet. Anything you buy appears here and stays after the Shop rotates.', '🎒')])]);
        return;
    }

    const summary = card([row([
        badge(`${inv.total} item types`, ''),
        badge(`${inv.groups.find(g => g.id === 'permanent')?.items.length || 0} permanent`, 'good'),
        badge(`${inv.effects.length} active effect(s)`, inv.effects.length ? 'good' : 'muted'),
        badge(`Spent ${ctx.progress.spent.toLocaleString('en-US')} ${ctx.settings.currencyName}`, 'muted'),
    ])], 'ipi-card--snapshot');

    const effects = inv.effects.length
        ? card([section('Active effects', inv.effects.map(e => el('div', { class: 'ipi-effect' }, [
            el('span', { class: 'ipi-effect__icon', text: e.icon || '🌀' }),
            el('div', { class: 'ipi-grow' }, [
                el('div', { class: 'ipi-effect__name', text: e.name }),
                el('div', { class: 'ipi-effect__desc', text: e.effect }),
                progress(e.progress, { kind: 'accent', label: `${e.remaining} of ${e.total} messages left · started ${e.startedText}` }),
            ]),
            button('End now', { kind: 'ghost', sm: true, onClick: () => ctx.actions.endEffect(e.id) }),
        ])), { icon: '🌀', hint: 'The AI is told these effects are currently active.' })])
        : null;

    const groups = inv.groups.map(g => card([section(
        `${g.label} (${g.items.length})`,
        g.items.map(i => itemCard(i, ctx)),
        { icon: g.icon, hint: g.id === 'permanent' ? 'Permanent abilities are always active and described to the AI.' : '' },
    )]));

    mount(body, [summary, effects, ...groups].filter(Boolean));
}

function itemCard(i, ctx) {
    return el('article', { class: `ipi-item ipi-item--${i.rarity}` }, [
        el('header', { class: 'ipi-item__head' }, [
            el('div', { class: 'ipi-item__icon', text: i.icon }),
            el('div', { class: 'ipi-grow' }, [
                el('div', { class: 'ipi-item__name' }, [
                    i.name,
                    i.qty > 1 ? badge(`×${i.qty}`, 'good') : null,
                    i.active ? badge('active', 'good') : null,
                    i.permanent ? badge('permanent', 'accent') : null,
                ]),
                el('div', { class: 'ipi-item__meta' }, [
                    badge(i.rarityLabel, `rarity-${i.rarity}`),
                    badge(i.typeLabel),
                    i.showDuration ? badge(i.durationLabel) : null,
                    !i.permanent ? badge(`${i.charges} charge(s)`, i.charges ? 'muted' : 'warn') : null,
                ]),
            ]),
            el('div', { class: 'ipi-item__actions' }, [
                i.usable
                    ? button('Use', { icon: '▶', sm: true, onClick: () => ctx.actions.use(i.key) })
                    : i.permanent
                        ? badge('always on', 'good')
                        : badge('empty', 'warn'),
            ]),
        ]),
        el('div', { class: 'ipi-item__effect', text: i.effect }),
        disclosure('Details', [
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Description' }), el('strong', { text: i.description })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Power / Utility' }), el('strong', { text: `${i.power}/10 · ${i.utility}/10` })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Acquired' }), el('strong', { text: i.acquiredText })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Last price paid' }), el('strong', { text: `${i.lastPriceText} ${ctx.settings.currencyName}` })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Tags' }), el('strong', { text: (i.tags || []).join(', ') || '—' })]),
            el('div', { class: 'ipi-detailrow ipi-detailrow--wrap' }, [el('span', { text: 'Purchase history' }), el('strong', { text: i.history.length ? i.history.map(h => `${h.whenText} · ${h.priceText}`).join(' | ') : '—' })]),
            el('div', { class: 'ipi-quickrow' }, [
                chip('Remove from recommendations', { kind: 'muted', title: 'Forget this product in Shop Memory (you keep the item)', onClick: () => ctx.actions.forgetProduct(i.key) }),
            ]),
        ], { open: false }),
    ]);
}
