// Shop Memory tab: view, edit and clear everything the Shop remembers. Never touches progression.
import { el, mount } from '../dom.js';
import { card, section, row, button, chip, badge, empty, input, disclosure } from '../controls.js';
import { memoryModel } from '../viewmodel.js';
import { THEMES } from '../../catalog/index.js';

export function render(body, ctx) {
    if (!ctx.ready) { mount(body, [card([empty('Open a chat to manage Shop Memory.', '🧠')])]); return; }
    const m = memoryModel({ memory: ctx.memory, settings: ctx.settings, rotation: ctx.rotation });

    // ---- purpose
    let purposeText = '';
    const purposeBox = input('', { placeholder: 'e.g. "stealth and spy gadgets for a modern city"' });
    purposeBox.addEventListener('input', () => { purposeText = purposeBox.value; });
    const applyPurpose = () => {
        const t = purposeText.trim();
        if (!t) return;
        purposeBox.value = ''; purposeText = '';
        ctx.actions.changePurpose(t);
    };
    purposeBox.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); applyPurpose(); } });

    const purposeCard = card([section('Shop purpose', [
        el('div', { class: 'ipi-grid2' }, [
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Current' }), el('strong', { text: m.purpose.label })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Theme' }), el('strong', { text: m.purpose.theme === 'custom' ? `custom — ${m.purpose.custom}` : m.purpose.theme })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Set by' }), el('strong', { text: m.purpose.setBy })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Changed' }), el('strong', { text: m.purpose.setAtText })]),
        ]),
        row([el('label', { class: 'ipi-field ipi-grow' }, [el('span', { class: 'ipi-field__label', text: 'New purpose (natural language)' }), purposeBox]), button('Change', { icon: '➜', onClick: applyPurpose })]),
        el('div', { class: 'ipi-quickrow' }, [
            chip('↩ Reset to General Depravity', { kind: 'ghost', onClick: () => ctx.actions.changePurpose('general depravity') }),
        ]),
        m.purpose.history.length
            ? disclosure(`Purpose history (${m.purpose.history.length})`, m.purpose.history.map(h => el('div', { class: 'ipi-detailrow' }, [el('span', { text: h.whenText }), el('strong', { text: `${h.label} (${h.theme})` })])))
            : null,
    ], { icon: '🎯', hint: 'The purpose persists until you change it and is never overwritten silently' })]);

    // ---- locked categories
    const lockedCard = card([section('Locked preferred categories', [
        el('div', { class: 'ipi-hint', text: 'Locked categories always appear in every rotation. Click to toggle.' }),
        el('div', { class: 'ipi-quickrow' }, Object.entries(THEMES).map(([id, t]) => chip(`${t.icon} ${t.label}`, {
            active: m.locked.includes(id), onClick: () => ctx.actions.toggleLock(id),
        }))),
    ], { icon: '🔒' })]);

    // ---- preferences
    const prefRows = m.allPrefs.map(p => el('div', { class: 'ipi-prefrow' }, [
        el('strong', { class: 'ipi-grow', text: p.tag }),
        badge(`score ${p.score}`, p.score > 0 ? 'good' : p.score < 0 ? 'warn' : 'muted'),
        badge(p.source === 'user' ? 'you set this' : 'learned', p.source === 'user' ? 'accent' : 'muted'),
        p.locked ? badge('locked', 'accent') : null,
        button(p.locked ? 'Unlock' : 'Lock', { kind: 'ghost', sm: true, onClick: () => ctx.actions.setPref(p.tag, p.score, !p.locked) }),
        button('Forget', { kind: 'danger', sm: true, onClick: () => ctx.actions.deletePref(p.tag) }),
    ]));
    let newTag = '', newScore = '';
    const tagBox = input('', { placeholder: 'e.g. teleport', onInput: v => { newTag = v; } });
    const scoreBox = input('', { type: 'number', placeholder: 'e.g. 8', onInput: v => { newScore = v; } });
    const prefCard = card([section(`Remembered preferences (${m.allPrefs.length})`, [
        prefRows.length ? prefRows : empty('Nothing learned yet. Buying, viewing and ignoring products builds this list.', '🧩'),
        row([
            el('label', { class: 'ipi-field ipi-grow' }, [el('span', { class: 'ipi-field__label', text: 'Prefer a tag' }), tagBox]),
            el('label', { class: 'ipi-field' }, [el('span', { class: 'ipi-field__label', text: 'Weight (-20…50)' }), scoreBox]),
            button('Add / update', { icon: '➕', onClick: () => {
                if (!newTag.trim()) return;
                ctx.actions.setPref(newTag.trim(), Number(newScore) || 10, false);
                tagBox.value = ''; scoreBox.value = ''; newTag = ''; newScore = '';
            } }),
        ]),
    ], { icon: '🧩', hint: 'You can edit or delete anything the Shop has learned' })]);

    // ---- restrictions
    let banText = '';
    const banBox = input('', { placeholder: 'e.g. weapons, romance, time travel', onInput: v => { banText = v; } });
    banBox.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); addBan(); } });
    const addBan = () => {
        const t = banText.trim();
        if (!t) return;
        ctx.actions.ban(t);
        banBox.value = ''; banText = '';
    };
    const banCard = card([section('Never sell these', [
        m.restrictions.length
            ? el('div', { class: 'ipi-quickrow' }, m.restrictions.map(b => chip(`${b} ✕`, { kind: 'warn', title: 'Lift this ban', onClick: () => ctx.actions.unban(b) })))
            : empty('No restrictions. Say "[System: don\'t sell weapons]" in chat or add one here.', '🚫'),
        row([el('label', { class: 'ipi-field ipi-grow' }, [el('span', { class: 'ipi-field__label', text: 'Add a restriction' }), banBox]), button('Ban', { icon: '🚫', kind: 'danger', onClick: addBan })]),
    ], { icon: '🚫' })]);

    // ---- wishlist
    const wishCard = card([section(`Wishlist (${m.wishlist.length})`, m.wishlist.length
        ? m.wishlist.map(w => el('div', { class: 'ipi-prefrow' }, [
            el('strong', { class: 'ipi-grow', text: w.name }),
            badge(w.priceText, 'muted'),
            badge(`added ${w.addedText}`, 'muted'),
            w.inShop ? badge("in today's Shop", 'good') : badge('not in stock', 'muted'),
            w.inShop ? button('Buy now', { sm: true, icon: '🛒', onClick: () => ctx.actions.buy(w.key) }) : null,
            button('Remove', { kind: 'danger', sm: true, onClick: () => ctx.actions.unwish(w.key) }),
        ]))
        : empty('Wishlist is empty. Click the ☆ on any Shop product to save it — the System will tell you when it returns.', '⭐'),
    { icon: '⭐' })]);

    // ---- comeback list (wanted but unaffordable)
    const comebackCard = m.unaffordable.length
        ? card([section('Wanted but unaffordable', [
            el('div', { class: 'ipi-hint', text: 'These items were offered while you could not afford them. The Shop tries to bring them back later.' }),
            ...m.unaffordable.map(u => el('div', { class: 'ipi-prefrow' }, [
                el('strong', { class: 'ipi-grow', text: u.name }),
                badge(u.priceText, 'muted'),
                badge(`offered ${u.day}`, 'muted'),
                button('Forget', { kind: 'danger', sm: true, onClick: () => ctx.actions.forgetProduct(u.key) }),
            ])),
        ], { icon: '⏳' })])
        : null;

    // ---- remembered AI products
    const productCard = card([section(`Remembered generated products (${m.rememberedProducts.length})`, m.rememberedProducts.length
        ? m.rememberedProducts.slice(0, 40).map(p => el('div', { class: 'ipi-prefrow' }, [
            el('strong', { class: 'ipi-grow', text: p.name }),
            badge(p.rarityLabel, 'muted'),
            badge(p.priceText, 'muted'),
            badge(p.source, 'muted'),
            badge(p.genDay, 'muted'),
            button('Forget', { kind: 'danger', sm: true, onClick: () => ctx.actions.forgetProduct(p.key) }),
        ]))
        : empty('No AI products generated yet. Enable AI in Settings → Shop to generate contextual products.', '✨'),
    { icon: '✨', hint: 'Remembered so the same products are not generated twice' })]);

    // ---- setting notes + interests
    let noteText = '';
    const noteBox = input('', { placeholder: 'e.g. the story is set in modern Tokyo', onInput: v => { noteText = v; } });
    const noteCard = card([section('Remembered setting details', [
        el('div', { class: 'ipi-hint', text: 'These notes are given to the AI when generating products so they fit your world.' }),
        m.settingNotes.length
            ? m.settingNotes.map(s => el('div', { class: 'ipi-prefrow' }, [
                el('span', { class: 'ipi-grow', text: s.text }),
                badge(s.source, 'muted'),
                badge(s.whenText, 'muted'),
                button('Delete', { kind: 'danger', sm: true, onClick: () => ctx.actions.deleteSettingNote(s.id) }),
            ]))
            : empty('No setting notes yet. One is added automatically from the character card when a chat is first opened.', '📝'),
        row([el('label', { class: 'ipi-field ipi-grow' }, [el('span', { class: 'ipi-field__label', text: 'Add a setting note' }), noteBox]),
            button('Add', { icon: '➕', onClick: () => { if (!noteText.trim()) return; ctx.actions.addSettingNote(noteText.trim()); noteBox.value = ''; noteText = ''; } })]),
        m.interests.length
            ? disclosure(`Soft interest hints from chat (${m.interests.length})`, [
                el('div', { class: 'ipi-quickrow' }, m.interests.map(i => chip(`“${i.text}”`, { kind: 'muted', title: `Noticed ${i.whenText}`, onClick: () => ctx.actions.prefer(i.text) }))),
                el('div', { class: 'ipi-hint', text: 'These come from ordinary narration (e.g. “I wish I had…”). They are hints only and never change the Shop on their own.' }),
            ])
            : null,
    ], { icon: '📝' })]);

    // ---- product interactions
    const interactCard = card([section(`Products the Shop remembers (${m.interactions.length})`, [
        el('div', { class: 'ipi-hint', text: 'Views, purchases and ignores build your preferences. "Forget" removes the entry without deleting anything you own.' }),
        el('div', { class: 'ipi-intertable' }, m.interactions.slice(0, 60).map(it => el('div', { class: 'ipi-intertable__row' }, [
            el('span', { class: 'ipi-grow ipi-truncate', text: it.name, title: it.key }),
            badge(`👁 ${it.views}`, 'muted'),
            badge(`🛒 ${it.buys}`, it.buys ? 'good' : 'muted'),
            badge(`💤 ${it.ignored}`, 'muted'),
            badge(`⭐ ${it.wished}`, it.wished ? 'accent' : 'muted'),
            badge(it.lastSeenText, 'muted'),
            button('Forget', { kind: 'danger', sm: true, onClick: () => ctx.actions.forgetProduct(it.key) }),
        ]))),
    ], { icon: '👁' })]);

    // ---- rotation history + log
    const historyCard = card([section(`Rotation history (${m.rotations.length})`, m.rotations.length
        ? m.rotations.slice(0, 14).map(r => el('div', { class: 'ipi-prefrow' }, [
            el('strong', { text: r.day }),
            el('span', { class: 'ipi-grow ipi-muted ipi-truncate', text: r.names.join(', ') }),
            badge(`${r.count} items`, 'muted'),
        ]))
        : empty('No rotations recorded yet.', '🗓'), { icon: '🗓', hint: 'Used to avoid repeating the same inventory' })]);

    const logCard = card([section(`Change log (${m.log.length})`, m.log.length
        ? m.log.slice(0, 30).map(l => el('div', { class: 'ipi-prefrow' }, [badge(l.whenText, 'muted'), el('span', { class: 'ipi-grow', text: l.text })]))
        : empty('Nothing logged yet.', '📜'), { icon: '📜', hint: 'Everything the Shop Memory changed, in plain language' })]);

    // ---- memory management / danger zone
    const manageCard = card([section('Memory management', [
        el('div', { class: 'ipi-hint', text: 'These actions only affect Shop Memory. Your balance, inventory, achievements and transaction history are never touched.' }),
        el('div', { class: 'ipi-quickrow' }, [
            button('Clear purchase-based learning', { kind: 'ghost', icon: '🧹', onClick: () => ctx.actions.clearLearning() }),
            button('Export Shop Memory', { kind: 'ghost', icon: '⬇️', onClick: () => ctx.actions.exportMemory() }),
            button('Import Shop Memory', { kind: 'ghost', icon: '⬆️', onClick: () => ctx.actions.importMemory() }),
            button('Reset Shop Memory', { kind: 'danger', icon: '⚠️', onClick: () => ctx.actions.resetMemory() }),
        ]),
        disclosure('What exactly is stored?', [
            el('div', { class: 'ipi-hint', text: 'purpose (theme, label, custom text, history) · preferences with scores and locks · banned terms · locked categories · wishlist · per-product views/purchases/ignores · products you could not afford · generated products · remembered setting notes · soft interest hints · the last 30 rotations · this change log.' }),
            el('div', { class: 'ipi-hint', text: 'Storage scope: ' + (ctx.settings.memoryScope === 'chat' ? 'this chat only' : ctx.settings.memoryScope === 'character' ? 'shared across this character\'s chats' : 'shared across all chats') + '.' }),
        ]),
    ], { icon: '🗄' })]);

    mount(body, [
        purposeCard, lockedCard, prefCard, banCard, wishCard,
        comebackCard, productCard, noteCard, interactCard, historyCard, logCard, manageCard,
    ].filter(Boolean));
}


