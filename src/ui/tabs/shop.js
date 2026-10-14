// Shop tab: today's rotation, purpose control, wishlist, recommendations and pricing transparency.
import { el, mount } from '../dom.js';
import { card, row, section, button, chip, badge, empty, progress, disclosure, input } from '../controls.js';
import { shopModel, resetLine, economyHint } from '../viewmodel.js';
import { assistantCard } from '../assistant.js';
import { THEMES } from '../../catalog/index.js';
import { fmt } from '../../util.js';

let filter = 'all';

const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'affordable', label: 'Can afford' },
    { id: 'wishlist', label: 'Wishlist' },
    { id: 'rare', label: 'Rare+' },
    { id: 'permanent', label: 'Permanent' },
];

export function render(body, ctx) {
    if (!ctx.ready) { mount(body, [card([empty('Open a chat to use the Shop.', '🛒')])]); return; }
    if (!ctx.rotation) { mount(body, [card([empty('The Shop is being prepared…', '🛒')])]); return; }

    const m = shopModel({ settings: ctx.settings, progress: ctx.progress, memory: ctx.memory, rotation: ctx.rotation, resetMs: ctx.resetMs });

    // ---- purpose control
    let purposeText = '';
    const purposeBox = input('', { placeholder: 'e.g. "change the shop to supernatural abilities"' });
    const purposeInput = el('label', { class: 'ipi-field ipi-grow' }, [
        el('span', { class: 'ipi-field__label', text: 'Change the Shop purpose (natural language)' }),
        purposeBox,
        el('span', { class: 'ipi-field__hint', text: 'You can also do this in chat, e.g. [System: change the shop to blackmail material].' }),
    ]);
    purposeBox.addEventListener('input', () => { purposeText = purposeBox.value; });
    purposeBox.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
    const submit = () => {
        const text = purposeText.trim();
        if (!text) return;
        purposeBox.value = ''; purposeText = '';
        ctx.actions.changePurpose(text);
    };

    const purposeCard = card([
        row([
            el('div', { class: 'ipi-grow' }, [
                el('div', { class: 'ipi-purpose__label', text: m.purpose.label }),
                el('div', { class: 'ipi-purpose__sub', text: m.purpose.theme === 'custom' ? `custom purpose — ${m.purpose.custom}` : `built-in theme · set by ${m.purpose.setBy}` }),
                el('div', { class: 'ipi-purpose__row' }, [
                    badge(`${m.items.length} products`, ''),
                    badge(`${m.affordable} affordable`, m.affordable ? 'good' : 'muted'),
                    m.banned.length ? badge(`${m.banned.length} banned`, 'warn') : null,
                    chip(resetLine(m.resetMs), { kind: 'accent' }),
                ]),
            ]),
            el('div', { class: 'ipi-purpose__actions' }, [
                button('Refresh', { kind: 'ghost', icon: '🔄', title: 'Replace today\'s products (owned items are never affected)', onClick: () => ctx.actions.refreshShop() }),
                button('AI restock', { kind: 'ghost', icon: '✨', title: 'Generate extra products for today with your configured AI', onClick: () => ctx.actions.aiRestock() }),
            ]),
        ]),
        row([purposeInput, button('Apply', { icon: '➜', onClick: submit })]),
        el('div', { class: 'ipi-quickrow' }, [
            ...Object.entries(THEMES).map(([id, t]) => chip(`${t.icon} ${t.label}`, {
                active: m.purpose.theme === id, onClick: () => ctx.actions.setPurposeTheme(id),
            })),
        ]),
    ], 'ipi-card--purpose');

    // ---- filters
    const filtersCard = el('div', { class: 'ipi-filters' }, FILTERS.map(f => chip(f.label, {
        active: filter === f.id,
        onClick: () => { filter = f.id; ctx.rerender(); },
    })));

    const items = m.items.filter(i => {
        if (filter === 'affordable') return i.canBuy;
        if (filter === 'wishlist') return i.wished;
        if (filter === 'rare') return i.rarity === 'rare' || i.rarity === 'premium';
        if (filter === 'permanent') return i.type === 'permanent' || i.type === 'equipment';
        return true;
    });

    const grid = el('div', { class: 'ipi-grid' }, items.length
        ? items.map(i => productCard(i, ctx))
        : [empty('Nothing matches this filter.', '🔍')]);

    // ---- recommendations from Shop Memory
    const recs = ctx.actions.recommendations?.() || [];
    const recCard = recs.length
        ? card([section('Recommended for you', recs.map(r => el('div', { class: 'ipi-rec' }, [
            el('span', { class: 'ipi-rec__icon', text: r.product.icon || '✦' }),
            el('div', { class: 'ipi-grow' }, [
                el('div', { class: 'ipi-rec__name' }, [
                    r.product.name,
                    r.inShop ? badge("in today's Shop", 'good') : null,
                    r.product.rarity === 'premium' ? badge('premium', 'warn') : null,
                ]),
                el('div', { class: 'ipi-rec__why', text: r.why }),
            ]),
            badge(fmt(r.product.price), ''),
        ])), { icon: '🧭', hint: 'Based on your Shop Memory. Each explanation says why the item fits.' })])
        : null;

    // ---- banned products
    const bannedCard = m.banned.length
        ? card([section('Banned from the Shop', [
            el('div', { class: 'ipi-quickrow' }, m.banned.map(b => chip(`${b} ✕`, { kind: 'warn', title: 'Click to lift this ban', onClick: () => ctx.actions.unban(b) }))),
            el('div', { class: 'ipi-hint', text: 'Click a ban to lift it, or say "[System: allow weapons again]" in chat.' }),
        ], { icon: '🚫' })])
        : null;

    // ---- wishlist items currently in stock
    const wishCard = m.wishlist.length
        ? card([section("Wishlist items in today's Shop", [
            el('div', { class: 'ipi-quickrow' }, m.wishlist.map(k => {
                const item = m.items.find(i => i.key === k);
                return chip(`${item.icon} ${item.name} · ${item.priceText}`, { kind: 'good', onClick: () => ctx.actions.buy(k) });
            })),
        ], { icon: '⭐' })])
        : null;

    mount(body, [
        purposeCard,
        filtersCard,
        grid,
        wishCard,
        recCard,
        bannedCard,
        assistantCard(ctx),
        card([section('How prices work', [
            el('div', { class: 'ipi-hint', text: economyHint(m.economy, m.currency) }),
            el('div', { class: 'ipi-hint', text: 'Prices come from a fixed formula based on power, utility, rarity, permanence and uses — never from your balance. AI-generated products are validated and re-priced before they appear.' }),
        ], { icon: '⚖️' })]),
    ].filter(Boolean));
}

function productCard(i, ctx) {
    const canBuy = i.canBuy;
    const cls = `ipi-product ipi-product--${i.rarity}${i.soldOut ? ' ipi-product--sold' : ''}${i.wished ? ' ipi-product--wished' : ''}`;
    return el('article', { class: cls, 'data-key': i.key }, [
        el('header', { class: 'ipi-product__head' }, [
            el('div', { class: 'ipi-product__icon', text: i.icon }),
            el('div', { class: 'ipi-grow' }, [
                el('div', { class: 'ipi-product__name', text: i.name }),
                el('div', { class: 'ipi-product__meta' }, [
                    badge(i.rarityLabel, `rarity-${i.rarity}`),
                    badge(i.typeLabel),
                    i.showDuration ? badge(i.durationLabel) : null,
                    i.realityAltering ? badge('reality-altering', 'warn') : null,
                ]),
            ]),
            el('button', {
                class: `ipi-star ${i.wished ? 'ipi-star--on' : ''}`,
                title: i.wished ? 'Remove from wishlist' : 'Save to wishlist',
                onClick: () => ctx.actions.wish(i.key),
            }, [el('span', { text: i.wished ? '★' : '☆' })]),
        ]),
        el('p', { class: 'ipi-product__desc', text: i.description }),
        el('div', { class: 'ipi-product__effect', text: i.effect }),
        el('div', { class: 'ipi-product__tags' }, (i.tags || []).slice(0, 5).map(t => chip(`#${t}`, { kind: 'muted', title: `Tell the System you like ${t} products`, onClick: () => ctx.actions.prefer(t) }))),
        el('footer', { class: 'ipi-product__foot' }, [
            el('div', { class: 'ipi-price' }, [
                i.offer ? el('span', { class: 'ipi-price__was', text: i.listPriceText }) : null,
                el('span', { class: 'ipi-price__now', text: i.priceText }),
                el('span', { class: 'ipi-price__unit', text: ctx.settings.currencyName }),
                i.offer ? badge(i.offerLabel, 'good') : null,
            ]),
            el('div', { class: 'ipi-product__stock' }, [
                badge(i.stockLabel, i.soldOut ? 'warn' : 'muted'),
                i.ownedQty ? badge(`owned ×${i.ownedQty}`, 'good') : null,
                badge(i.bandLabel, `band-${i.band}`),
            ]),
            el('div', { class: 'ipi-product__buy' }, [
                button(i.soldOut ? 'Sold out' : i.alreadyOwned ? 'Owned' : canBuy ? 'Buy' : 'Not enough', {
                    icon: canBuy ? '🛒' : i.soldOut ? '⛔' : '🔒',
                    disabled: !canBuy,
                    onClick: () => ctx.actions.buy(i.key),
                }),
            ]),
        ]),
        i.why ? el('div', { class: 'ipi-product__why', text: `In the Shop because: ${i.why}` }) : null,
        disclosure('Details & price explanation', [
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Power' }), el('strong', { text: `${i.power}/10` })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Utility' }), el('strong', { text: `${i.utility}/10` })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Uses' }), el('strong', { text: String(i.uses) })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Source' }), el('strong', { text: i.sourceLabel })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Family' }), el('strong', { text: `${i.family} · tier ${i.tier}` })]),
            el('div', { class: 'ipi-detailrow ipi-detailrow--wrap' }, [el('span', { text: 'Price formula' }), el('strong', { text: i.priceWhy })]),
            el('div', { class: 'ipi-hint', text: 'Buying asks for confirmation, deducts exactly this price once, and adds the item to your Inventory immediately.' }),
        ], { open: false }),
    ]);
}
