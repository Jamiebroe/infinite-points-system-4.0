// Statistics tab: totals, category breakdown, character histories and daily earnings.
import { el, mount } from '../dom.js';
import { card, section, cols, statTile, badge, empty, progress, chip } from '../controls.js';
import { statsModel, levelModel } from '../viewmodel.js';
import { fmt } from '../../util.js';

export function render(body, ctx) {
    if (!ctx.ready) { mount(body, [card([empty('Open a chat to see Statistics.', '📊')])]); return; }
    const s = statsModel({ settings: ctx.settings, progress: ctx.progress, memory: ctx.memory, achievements: ctx.achievements });

    const tiles = card([cols(s.cards.map(c => statTile(c.label, c.value, c.hint)), 'ipi-cols--tiles')]);

    const lv = levelModel(ctx.progress?.xp || 0);
    const levelCard = card([section(`${lv.icon} ${lv.name}`, [
        el('div', { class: 'ipi-quickrow' }, [
            chip(`level ${lv.level}`, { kind: 'accent' }),
            chip(`${fmt(lv.xp)} XP`, { kind: 'muted' }),
            chip(`stock: ${lv.rarities.join(' · ')}`, { kind: 'muted' }),
            lv.rareBoost > 1 ? chip(`rare ×${lv.rareBoost}`, { kind: 'muted' }) : null,
        ]),
        lv.next
            ? progress(lv.progress, { label: `${fmt(lv.toNext)} XP to ${lv.next} (level ${lv.nextLevel})` })
            : el('div', { class: 'ipi-hint', text: 'Highest level reached.' }),
        lv.unlocksAtNext.length
            ? el('div', { class: 'ipi-hint', text: `Reaching level ${lv.nextLevel} unlocks ${lv.unlocksAtNext.join(' and ')} products in the Shop.` })
            : null,
        el('div', { class: 'ipi-hint', text: 'XP comes from every act — scaled by how extreme it is, exactly like Points — and from every achievement. It is never spent, so your level only climbs. Your level decides which products the Shop is allowed to stock.' }),
    ], { icon: '🎖️' })]);

    const sexCard = card([section('Sexual record', s.sex.length
        ? s.sex.map(r => el('div', { class: 'ipi-bar-row' }, [
            el('span', { class: 'ipi-bar-row__icon', text: r.icon }),
            el('div', { class: 'ipi-grow' }, [
                el('div', { class: 'ipi-bar-row__top' }, [
                    el('strong', { text: r.label }),
                    el('span', { class: 'ipi-muted', text: `${fmt(r.points)} ${ctx.settings.currencyName}` }),
                ]),
                progress(r.share, { kind: 'accent' }),
            ]),
            badge(fmt(r.count), 'muted'),
        ]))
        : [empty('No acts recorded yet.', '💦')],
    { icon: '💦', hint: `${s.sexTotals.tracked}/${s.sex.length} tracked · ${fmt(s.sexTotals.acts)} acts in total · worded for your configured gender` })]);

    const daily = card([section('Points earned per day', s.dailySeries.length
        ? [el('div', { class: 'ipi-bars' }, s.dailySeries.map((d, i) => el('div', {
            class: 'ipi-bars__bar', style: { height: `${Math.max(3, d.height)}%` },
            title: `${s.daily[i].day}: ${fmt(d.value)}`,
        }))),
        el('div', { class: 'ipi-bars__labels' }, s.daily.map(d => el('span', { text: d.day.slice(5) })))]
        : [empty('No earnings recorded yet. Play a scene and events will be rewarded automatically.', '📈')],
    { icon: '📈', hint: s.economy.measured ? `Measured average: ${fmt(s.economy.expectedDaily)}/day` : 'Uses the baseline until enough days are recorded' })]);

    const categories = card([section('Reward categories', s.categories.length
        ? s.categories.map(c => el('div', { class: 'ipi-bar-row' }, [
            el('span', { class: 'ipi-bar-row__icon', text: c.icon }),
            el('div', { class: 'ipi-grow' }, [
                el('div', { class: 'ipi-bar-row__top' }, [
                    el('strong', { text: c.name }),
                    el('span', { class: 'ipi-muted', text: `${c.count} event(s) · ${fmt(c.points)} ${ctx.settings.currencyName} · last ${c.lastText}` }),
                ]),
                progress(c.share, { kind: 'accent' }),
            ]),
            badge(`${c.share}%`, 'muted'),
        ]))
        : [empty('No events detected yet.', '🎭')], { icon: '🎭', hint: 'Share of all Points earned' })]);

    const characters = card([section('Character histories', s.characters.length
        ? s.characters.map(c => el('div', { class: 'ipi-char' }, [
            el('div', { class: 'ipi-char__head' }, [
                el('strong', { text: c.name }),
                el('span', { class: 'ipi-muted', text: `${c.count} event(s) · ${fmt(c.points)} ${ctx.settings.currencyName}` }),
                el('span', { class: 'ipi-muted', text: `last ${c.lastText}` }),
            ]),
            c.cats.length ? el('div', { class: 'ipi-quickrow' }, c.cats.map(x => chip(`${x.catId} ×${x.n}`, { kind: 'muted' }))) : null,
            ...c.recent.map(r => el('div', { class: 'ipi-char__recent' }, [
                el('span', { class: 'ipi-muted', text: r.whenText }),
                el('span', { text: `${r.catName} +${r.points}` }),
                el('span', { class: 'ipi-truncate', text: r.snippet }),
            ])),
        ]))
        : [empty('No character histories yet.', '👥')], { icon: '👥' })]);

    const memoryCard = card([section('Shop Memory at a glance', [
        el('div', { class: 'ipi-grid2' }, [
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Purpose' }), el('strong', { text: s.memory.purpose })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Tracked preferences' }), el('strong', { text: String(s.memory.preferences) })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Locked categories' }), el('strong', { text: String(s.memory.locked) })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Banned terms' }), el('strong', { text: String(s.memory.restrictions) })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Wishlist' }), el('strong', { text: String(s.memory.wishlist) })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Products tracked' }), el('strong', { text: String(s.memory.tracked) })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Rotations remembered' }), el('strong', { text: String(s.memory.rotations) })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Setting notes' }), el('strong', { text: String(s.memory.settingNotes) })]),
        ]),
        s.memory.topPrefs.length ? el('div', { class: 'ipi-quickrow' }, s.memory.topPrefs.map(p => chip(`${p.tag} ${p.score > 0 ? '+' : ''}${p.score}${p.locked ? ' 🔒' : ''}`, { kind: p.locked ? 'accent' : 'muted' }))) : null,
    ], { icon: '🧠', hint: 'Full control lives in the Shop Memory tab' })]);

    const econCard = card([section('Economy', [
        el('div', { class: 'ipi-grid2' }, [
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Difficulty' }), el('strong', { text: s.economy.difficulty })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Earning rate' }), el('strong', { text: `×${s.economy.earnRate}` })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Price multiplier' }), el('strong', { text: `×${s.economy.priceMultiplier}` })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Expected daily earnings' }), el('strong', { text: fmt(s.economy.expectedDaily) })]),
        ]),
        el('div', { class: 'ipi-hint', text: 'Prices never depend on your current balance — only on the product and these settings.' }),
    ], { icon: '⚖️' })]);

    mount(body, [tiles, levelCard, sexCard, daily, categories, characters, memoryCard, econCard]);
}
