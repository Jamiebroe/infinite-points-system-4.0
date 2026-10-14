// Points tab: balance, level and XP, today's earnings, live effects, shop snapshot and quick actions.
import { el, mount } from '../dom.js';
import { card, cols, row, section, statTile, button, progress, chip, empty, badge, disclosure, input } from '../controls.js';
import { overviewModel, statsModel, achievementModel, inventoryModel, signed, resetLine, economyHint } from '../viewmodel.js';
import { assistantCard } from '../assistant.js';
import { fmt } from '../../util.js';

export function render(body, ctx) {
    if (!ctx.ready) { mount(body, [card([empty('Open a chat to activate The System.', '◈')])]); return; }

    const o = overviewModel({
        settings: ctx.settings, progress: ctx.progress, memory: ctx.memory, rotation: ctx.rotation,
        resetMs: ctx.resetMs, aiStatus: ctx.aiStatus, achievementsTotal: ctx.achievements.length,
    });
    const stats = statsModel({ settings: ctx.settings, progress: ctx.progress, memory: ctx.memory, achievements: ctx.achievements });
    const ach = achievementModel({ settings: ctx.settings, progress: ctx.progress, achievements: ctx.achievements });
    const inv = inventoryModel({ settings: ctx.settings, progress: ctx.progress, chatId: ctx.chatId, msgCount: ctx.msgCount });
    const nextAch = ach.locked[0];

    const hero = card([el('div', { class: 'ipi-hero' }, [
        el('div', { class: 'ipi-hero__main' }, [
            el('div', { class: 'ipi-hero__label', text: `${o.currency} available` }),
            el('div', { class: 'ipi-hero__value', text: fmt(o.balance) }),
            el('div', { class: 'ipi-hero__row' }, [
                chip(`${o.level.icon} ${o.level.name} · level ${o.level.level}`, { kind: 'accent' }),
        chip(`${fmt(o.level.xp)} XP`, { kind: 'muted' }),
                chip(`${signed(o.earnedToday)} today`, { kind: o.earnedToday > 0 ? 'good' : 'muted' }),
                chip(`≈ ${fmt(o.expectedDaily)}/day`, { title: 'Expected earnings are used only to pick a sensible shop mix, never to set prices' }),
            ]),
            o.level.next
                ? progress(o.level.progress, { label: `${fmt(o.level.toNext)} XP to ${o.level.next}` })
                : el('div', { class: 'ipi-hero__maxed', text: 'Highest level reached.' }),
        ]),
        el('div', { class: 'ipi-hero__side' }, [
            el('div', { class: 'ipi-hero__side-row' }, [el('span', { text: 'Lifetime' }), el('strong', { text: fmt(o.lifetime) })]),
            el('div', { class: 'ipi-hero__side-row' }, [el('span', { text: 'Spent' }), el('strong', { text: fmt(o.spent) })]),
            el('div', { class: 'ipi-hero__side-row' }, [el('span', { text: 'Events' }), el('strong', { text: fmt(o.events) })]),
            el('div', { class: 'ipi-hero__side-row' }, [el('span', { text: 'Purchases' }), el('strong', { text: fmt(o.purchases) })]),
        ]),
    ])], 'ipi-card--hero');

    const tiles = card([cols([
        statTile('Permanent', fmt(o.owned.permanent), 'always active', { icon: '💠' }),
        statTile('Equipment', fmt(o.owned.equipment), 'carried', { icon: '🎽' }),
        statTile('Consumables', fmt(o.owned.consumable), 'usable', { icon: '🧪' }),
        statTile('Effects live', fmt(inv.effects.length), 'right now', { icon: '🌀' }),
        statTile('Categories', fmt(o.categoriesUsed), 'rewarding you', { icon: '🎭' }),
        statTile('Achievements', `${o.achievements.unlocked}/${o.achievements.total}`, 'unlocked', { icon: '🏅' }),
    ], 'ipi-cols--tiles')]);

    const shopCard = card([el('div', { class: 'ipi-snapshot' }, [
        row([
            el('div', { class: 'ipi-grow' }, [
                el('div', { class: 'ipi-snapshot__title', text: `Shop · ${o.shop.purpose}` }),
                el('div', { class: 'ipi-snapshot__sub', text: `${o.shop.size} products · ${o.shop.affordable} affordable · ${o.shop.soldOut} sold out` }),
                o.shop.wishlistInShop ? badge(`${o.shop.wishlistInShop} wishlist item(s) in stock`, 'good') : null,
            ]),
            el('div', { class: 'ipi-snapshot__right' }, [
                el('div', { class: 'ipi-snapshot__timer', text: resetLine(o.shop.resetMs) }),
                button('Open Shop', { icon: '🛒', onClick: () => ctx.shell.open({ tab: 'shop' }) }),
            ]),
        ]),
    ])], 'ipi-card--snapshot');

    const effectsCard = inv.effects.length
        ? card([section('Active effects', inv.effects.map(e => el('div', { class: 'ipi-effect' }, [
            el('span', { class: 'ipi-effect__icon', text: e.icon || '🌀' }),
            el('div', { class: 'ipi-grow' }, [
                el('div', { class: 'ipi-effect__name', text: e.name }),
                el('div', { class: 'ipi-effect__desc', text: e.effect }),
                progress(e.progress, { kind: 'accent', label: `${e.remaining} of ${e.total} messages left` }),
            ]),
            button('End', { kind: 'ghost', sm: true, onClick: () => ctx.actions.endEffect(e.id) }),
        ])), { icon: '🌀', hint: 'These are active in the story and are described to the AI.' })])
        : null;

    const achCard = card([section('Next achievement', nextAch
        ? [el('div', { class: 'ipi-ach' }, [
            el('div', { class: 'ipi-ach__icon', text: nextAch.icon }),
            el('div', { class: 'ipi-grow' }, [
                el('div', { class: 'ipi-ach__name', text: nextAch.name }),
                el('div', { class: 'ipi-ach__desc', text: nextAch.desc }),
                progress(nextAch.progress, { kind: 'gold', label: `${fmt(nextAch.current)} / ${fmt(nextAch.n)}` }),
            ]),
        ])]
        : [empty('All achievements unlocked.', '🏅')], { icon: '🏅' })]);

    // ---- quick actions (with an inline manual correction form)
    const amountBox = input('', { type: 'number', placeholder: 'e.g. 250' });
    const quick = card([section('Quick actions', [
        el('div', { class: 'ipi-quickrow' }, [
            button('Scan chat history', { kind: 'ghost', icon: '🔎', title: 'Reward qualifying events in messages that existed before The System was attached', onClick: () => ctx.actions.scanHistory() }),
            button('Retry failed AI analysis', { kind: 'ghost', icon: '♻️', onClick: () => ctx.actions.retryAi() }),
            button('Refresh shop', { kind: 'ghost', icon: '🔄', onClick: () => ctx.actions.refreshShop() }),
            button('AI restock', { kind: 'ghost', icon: '✨', onClick: () => ctx.actions.aiRestock() }),
            button('Export data', { kind: 'ghost', icon: '⬇️', onClick: () => ctx.actions.exportData() }),
            button('Open Shop Memory', { kind: 'ghost', icon: '🧠', onClick: () => ctx.shell.open({ tab: 'memory' }) }),
        ]),
        disclosure('Manual Points correction', [
            el('div', { class: 'ipi-row' }, [
                el('label', { class: 'ipi-field ipi-grow' }, [
                    el('span', { class: 'ipi-field__label', text: 'Amount (negative removes Points)' }),
                    amountBox,
                ]),
                button('Apply', { icon: '✎', onClick: () => {
                    const value = Number(amountBox.value);
                    if (!Number.isFinite(value) || value === 0) { ctx.notify({ kind: 'warning', title: 'Correction', text: 'Enter a non-zero number.' }); return; }
                    ctx.actions.adjustPoints(value);
                    amountBox.value = '';
                } }),
                button('+100', { kind: 'ghost', onClick: () => ctx.actions.adjustPoints(100) }),
                button('−100', { kind: 'ghost', onClick: () => ctx.actions.adjustPoints(-100) }),
            ]),
            el('div', { class: 'ipi-hint', text: 'Corrections are recorded in the transaction ledger and can never push the balance below zero.' }),
        ], { open: false }),
        el('div', { class: 'ipi-hint', text: economyHint(stats.economy, o.currency) }),
    ], { icon: '⚡' })]);

    mount(body, [hero, tiles, shopCard, effectsCard, achCard, assistantCard(ctx), quick].filter(Boolean));
}
