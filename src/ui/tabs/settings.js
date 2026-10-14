// Settings tab: every configurable rule of The System, grouped into sections.
import { el, mount } from '../dom.js';
import { card, section, row, cols, button, badge, empty, input, select, toggle, field, fieldNumber, disclosure } from '../controls.js';
import { categoryDraft, milestoneDraft, intensityDraft, economyDraft, shopDraft, pricePreview, economyHint } from '../viewmodel.js';
import { TABS } from '../shell.js';
import { COLOR_THEMES, GENDERS } from '../../content.js';
import { DIFFICULTY } from '../../pricing.js';
import { listProfiles, PERSONALITIES } from '../../ai.js';
import { localTimeZone, isValidTimeZone } from '../../time.js';
import { fmt } from '../../util.js';

const SCOPES = [
    { value: 'chat', label: 'This chat only (default)' },
    { value: 'character', label: 'Shared across this character / group' },
    { value: 'global', label: 'Shared across every chat' },
];

export function render(body, ctx) {
    mount(body, [
        generalSection(ctx),
        detectionSection(ctx),
        categorySection(ctx),
        intensitySection(ctx),
        milestoneSection(ctx),
        economySection(ctx),
        shopSection(ctx),
        injectionSection(ctx),
        aiSection(ctx),
        assistantSection(ctx),
        interfaceSection(ctx),
        dataSection(ctx),
    ]);
}

/** Mutate settings, persist everything and redraw. */
function set(ctx, mutate, { rerender = true } = {}) {
    mutate(ctx.settings);
    ctx.save({ rerender });
}

// ---------------------------------------------------------------- general
function generalSection(ctx) {
    const s = ctx.settings;
    return card([section('General', [
        row([
            field('System name', input(s.systemName, { onInput: v => set(ctx, x => { x.systemName = v; }, { rerender: false }) })),
            field('Currency name', input(s.currencyName, { onInput: v => set(ctx, x => { x.currencyName = v; }, { rerender: false }) })),
        ]),
        row([
            field('Your gender', select(s.user?.gender || 'unspecified', GENDERS.map(g => ({ value: g.id, label: g.label })),
                { onChange: v => set(ctx, x => { x.user = { ...(x.user || {}), gender: v }; }) }),
                'Only changes the wording of the sexual record in Statistics.'),
            fieldNumber('XP gain', s.levels?.xpMult ?? 1, {
                min: 0, max: 10, step: 0.25,
                onInput: v => set(ctx, x => { x.levels = { ...(x.levels || {}), xpMult: Math.max(0, Number(v) || 0) }; }, { rerender: false }),
                hint: 'Multiplies the XP every act and achievement grants. 1 keeps the tuned default.',
            }),
        ]),
        el('div', { class: 'ipi-field ipi-field--inline' }, [
            toggle(s.enabled, { onChange: v => set(ctx, x => { x.enabled = v; }) }),
            el('span', { class: 'ipi-field__label', text: 'Enable The System in this chat' }),
        ]),
        row([
            field('Progression storage', select(s.scope, SCOPES, { onChange: v => ctx.actions.changeScope('scope', v) }), 'Each chat has independent progression by default.'),
            field('Shop Memory storage', select(s.memoryScope, SCOPES, { onChange: v => ctx.actions.changeScope('memoryScope', v) }), 'Keep these separate unless you explicitly want shared memory.'),
        ]),
        el('div', { class: 'ipi-hint', text: `Active chat: ${ctx.chatLabel}` }),
        el('div', { class: 'ipi-hint', text: `Injected context size: ${ctx.settings.injection.maxChars} characters · AI source: ${s.ai.source === 'profile' ? (s.ai.profileId ? 'Connection profile' : 'profile (none selected)') : 'main API'}` }),
    ], { icon: '⚙️' })]);
}

// ---------------------------------------------------------------- detection
function detectionSection(ctx) {
    const d = ctx.settings.detection;
    return card([section('Event detection', [
        el('div', { class: 'ipi-field ipi-field--inline' }, [
            toggle(d.enabled, { onChange: v => set(ctx, x => { x.detection.enabled = v; }) }),
            el('span', { class: 'ipi-field__label', text: 'Detect events automatically' }),
        ]),
        row([
            field('Method', select(d.mode, [
                { value: 'keywords', label: 'Keyword rules only (offline, free)' },
                { value: 'hybrid', label: 'Keywords first, AI to confirm' },
                { value: 'ai', label: 'AI analysis for every message' },
            ], { onChange: v => set(ctx, x => { x.detection.mode = v; }) }), 'AI modes use the source configured below.'),
            field('Max events per message', input(d.maxEventsPerMessage, { type: 'number', min: 1, max: 10, onInput: v => set(ctx, x => { x.detection.maxEventsPerMessage = Math.max(1, Math.min(10, Number(v) || 1)); }, { rerender: false }) })),
        ]),
        cols([
            el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(d.scanUser, { onChange: v => set(ctx, x => { x.detection.scanUser = v; }) }), el('span', { class: 'ipi-field__label', text: 'Scan your messages' })]),
            el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(d.scanChar, { onChange: v => set(ctx, x => { x.detection.scanChar = v; }) }), el('span', { class: 'ipi-field__label', text: 'Scan character messages' })]),
            el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(d.ignoreQuoted, { onChange: v => set(ctx, x => { x.detection.ignoreQuoted = v; }) }), el('span', { class: 'ipi-field__label', text: 'Ignore quoted dialogue' })]),
            el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(d.revokeOnDelete, { onChange: v => set(ctx, x => { x.detection.revokeOnDelete = v; }) }), el('span', { class: 'ipi-field__label', text: 'Revoke rewards when a message is deleted' })]),
            el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(d.aiFallback, { onChange: v => set(ctx, x => { x.detection.aiFallback = v; }) }), el('span', { class: 'ipi-field__label', text: 'Fall back to keywords when AI fails' })]),
        ]),
        el('div', { class: 'ipi-hint', text: 'Regenerating, editing or reloading a message never awards the same event twice. Swiping away revokes; swiping back restores.' }),
    ], { icon: '🔍' })]);
}

// ---------------------------------------------------------------- categories
function categorySection(ctx) {
    const cats = ctx.settings.categories;
    const rows = cats.map((c, idx) => el('div', { class: 'ipi-catrow' }, [
        el('span', { class: 'ipi-catrow__icon', text: c.icon || '•' }),
        el('div', { class: 'ipi-grow' }, [
            el('div', { class: 'ipi-catrow__name' }, [el('strong', { text: c.name }), badge(`${c.points} pts`, 'accent'), c.cooldown ? badge(`cooldown ${c.cooldown}`, 'muted') : null, c.enabled ? null : badge('disabled', 'muted')]),
            el('div', { class: 'ipi-catrow__kw', text: c.keywords || '(no keywords)' }),
        ]),
        button(c.enabled ? 'Disable' : 'Enable', { kind: 'ghost', sm: true, onClick: () => set(ctx, x => { x.categories[idx].enabled = !x.categories[idx].enabled; }) }),
        button('Edit', { kind: 'ghost', sm: true, onClick: () => editCategory(ctx, idx) }),
        button('Delete', { kind: 'danger', sm: true, onClick: () => ctx.actions.confirmThen(`Delete the category “${c.name}”? Points already awarded stay in your history.`, () => set(ctx, x => { x.categories.splice(idx, 1); })) }),
    ]));

    return card([section(`Reward categories (${cats.length})`, [
        el('div', { class: 'ipi-hint', text: 'Keywords: “defeat*” matches defeated/defeats, “a * b” allows up to three words between, “re:pattern” uses a regular expression.' }),
        rows.length ? rows : empty('No categories. Add one to start rewarding events.', '🎭'),
        row([button('Add category', { icon: '➕', onClick: () => editCategory(ctx, -1) })]),
    ], { icon: '🎭' })]);
}

function editCategory(ctx, idx) {
    const existing = idx >= 0 ? ctx.settings.categories[idx] : { name: '', icon: '•', points: 20, cooldown: 2, tags: '', keywords: '', enabled: true };
    const host = el('div', { class: 'ipi-editor' });
    const values = { ...existing };
    const errBox = el('div', { class: 'ipi-hidden' });
    const showErr = msg => { errBox.className = `ipi-notice ipi-notice--error ${msg ? '' : 'ipi-hidden'}`; errBox.textContent = msg || ''; };

    const nameBox = input(values.name, { placeholder: 'Category name', onInput: v => { values.name = v; } });
    const iconBox = input(values.icon, { placeholder: 'emoji', onInput: v => { values.icon = v; } });
    const pointsBox = input(values.points, { type: 'number', onInput: v => { values.points = v; } });
    const coolBox = input(values.cooldown ?? 0, { type: 'number', onInput: v => { values.cooldown = v; } });
    const tagsBox = input(values.tags, { placeholder: 'kissing, oral', onInput: v => { values.tags = v; } });
    const kwBox = el('textarea', { class: 'ipi-input ipi-input--area', rows: 4 });
    kwBox.value = values.keywords || '';
    kwBox.addEventListener('input', () => { values.keywords = kwBox.value; });

    host.append(
        cols([field('Name', nameBox), field('Icon', iconBox)]),
        cols([field('Base reward', pointsBox, 'Points granted before intensity and economy multipliers.'), field('Cooldown (messages)', coolBox, 'Minimum distance from another event of this category.')]),
        field('Tags', tagsBox, 'Used by the Shop to match products to your interests.'),
        field('Keywords', kwBox, 'One per line or comma separated.'),
        errBox,
        row([
            button(idx >= 0 ? 'Save changes' : 'Create category', {
                icon: '💾',
                onClick: () => {
                    const draft = categoryDraft(values, ctx.settings.categories.filter((_, i) => i !== idx).map(c => c.id));
                    if (!draft.ok) { showErr(draft.error); return; }
                    set(ctx, x => {
                        if (idx >= 0) x.categories[idx] = { ...x.categories[idx], ...draft.category };
                        else x.categories.push(draft.category);
                    });
                    ctx.notify({ kind: 'success', title: 'Categories', text: `“${draft.category.name}” saved.` });
                },
            }),
            idx >= 0 ? button('Cancel', { kind: 'ghost', onClick: () => ctx.rerender() }) : null,
        ]),
    );
    ctx.openEditor(idx >= 0 ? `Edit “${existing.name}”` : 'New reward category', host);
}

// ---------------------------------------------------------------- intensity
function intensitySection(ctx) {
    const tiers = ctx.settings.intensity;
    const rows = tiers.map((t, idx) => el('div', { class: 'ipi-catrow' }, [
        el('div', { class: 'ipi-grow' }, [
            el('div', { class: 'ipi-catrow__name' }, [el('strong', { text: t.label }), badge(`×${t.mult}`, 'accent')]),
            el('div', { class: 'ipi-catrow__kw', text: t.words || '(no trigger words)' }),
        ]),
        button('Edit', { kind: 'ghost', sm: true, onClick: () => editTier(ctx, idx) }),
        button('Delete', { kind: 'danger', sm: true, onClick: () => ctx.actions.confirmThen(`Delete the intensity tier “${t.label}”?`, () => set(ctx, x => { x.intensity.splice(idx, 1); })) }),
    ]));
    return card([section(`Intensity multipliers (${tiers.length})`, [
        el('div', { class: 'ipi-hint', text: 'When a trigger word appears in the same sentence as a detected event, the reward is multiplied. The strongest matching tier wins.' }),
        rows.length ? rows : empty('No intensity tiers — every event pays its base reward.', '📶'),
        row([button('Add tier', { icon: '➕', onClick: () => editTier(ctx, -1) })]),
    ], { icon: '📶' })]);
}

function editTier(ctx, idx) {
    const existing = idx >= 0 ? ctx.settings.intensity[idx] : { label: '', mult: 1.5, words: '' };
    const host = el('div', { class: 'ipi-editor' });
    const values = { ...existing };
    const errBox = el('div', { class: 'ipi-hidden' });
    const labelBox = input(values.label, { placeholder: 'e.g. Major', onInput: v => { values.label = v; } });
    const multBox = input(values.mult, { type: 'number', step: 0.1, onInput: v => { values.mult = v; } });
    const wordsBox = el('textarea', { class: 'ipi-input ipi-input--area', rows: 3 });
    wordsBox.value = values.words || '';
    wordsBox.addEventListener('input', () => { values.words = wordsBox.value; });

    host.append(
        cols([field('Label', labelBox), field('Multiplier', multBox, 'e.g. 1.5 adds 50% to the reward.')]),
        field('Trigger words', wordsBox, 'Comma separated. Matched inside the same sentence as the event.'),
        errBox,
        row([
            button(idx >= 0 ? 'Save changes' : 'Create tier', {
                icon: '💾',
                onClick: () => {
                    const draft = intensityDraft(values, ctx.settings.intensity.filter((_, i) => i !== idx).map(t => t.id));
                    if (!draft.ok) { errBox.className = 'ipi-notice ipi-notice--error'; errBox.textContent = draft.error; return; }
                    set(ctx, x => { if (idx >= 0) x.intensity[idx] = draft.tier; else x.intensity.push(draft.tier); });
                },
            }),
            idx >= 0 ? button('Cancel', { kind: 'ghost', onClick: () => ctx.rerender() }) : null,
        ]),
    );
    ctx.openEditor(idx >= 0 ? `Edit “${existing.label}”` : 'New intensity tier', host);
}

// ---------------------------------------------------------------- milestones
function milestoneSection(ctx) {
    const ms = ctx.settings.milestones;
    const rows = ms.map((m, idx) => el('div', { class: 'ipi-catrow' }, [
        el('span', { class: 'ipi-catrow__icon', text: m.kind === 'events' ? '🎯' : '📈' }),
        el('div', { class: 'ipi-grow' }, [
            el('div', { class: 'ipi-catrow__name' }, [
                el('strong', { text: m.name }),
                badge(m.kind === 'events' ? 'events' : 'lifetime Points', 'muted'),
                badge(`bonus ${fmt(m.bonus)}`, 'accent'),
                m.enabled ? null : badge('disabled', 'muted'),
            ]),
            el('div', { class: 'ipi-catrow__kw', text: `Reached at ${fmt(m.threshold)}` }),
        ]),
        button(m.enabled ? 'Disable' : 'Enable', { kind: 'ghost', sm: true, onClick: () => set(ctx, x => { x.milestones[idx].enabled = !x.milestones[idx].enabled; }) }),
        button('Edit', { kind: 'ghost', sm: true, onClick: () => editMilestone(ctx, idx) }),
        button('Delete', { kind: 'danger', sm: true, onClick: () => ctx.actions.confirmThen(`Delete the milestone “${m.name}”? Bonuses already granted are kept.`, () => set(ctx, x => { x.milestones.splice(idx, 1); })) }),
    ]));
    return card([section(`Milestones (${ms.length})`, [
        el('div', { class: 'ipi-hint', text: 'Each milestone pays a one-time bonus and can trigger a special discounted Shop offer.' }),
        rows.length ? rows : empty('No milestones configured.', '🎯'),
        row([button('Add milestone', { icon: '➕', onClick: () => editMilestone(ctx, -1) })]),
        row([field('Achievement bonus', input(ctx.settings.achievementBonus, { type: 'number', onInput: v => set(ctx, x => { x.achievementBonus = Math.max(0, Number(v) || 0); }, { rerender: false }) }), 'Points granted for each unlocked achievement.')]),
    ], { icon: '🎯' })]);
}

function editMilestone(ctx, idx) {
    const existing = idx >= 0 ? ctx.settings.milestones[idx] : { name: '', kind: 'lifetime', threshold: 1000, bonus: 100, enabled: true };
    const host = el('div', { class: 'ipi-editor' });
    const values = { ...existing };
    const errBox = el('div', { class: 'ipi-hidden' });
    host.append(
        field('Name', input(values.name, { placeholder: 'e.g. 5,000 lifetime Points', onInput: v => { values.name = v; } })),
        cols([
            field('Counts', select(values.kind, [{ value: 'lifetime', label: 'Lifetime Points' }, { value: 'events', label: 'Events triggered' }], { onChange: v => { values.kind = v; } })),
            field('Threshold', input(values.threshold, { type: 'number', onInput: v => { values.threshold = v; } })),
            field('Bonus', input(values.bonus, { type: 'number', onInput: v => { values.bonus = v; } })),
        ]),
        errBox,
        row([
            button(idx >= 0 ? 'Save changes' : 'Create milestone', {
                icon: '💾',
                onClick: () => {
                    const draft = milestoneDraft(values, ctx.settings.milestones.filter((_, i) => i !== idx).map(m => m.id));
                    if (!draft.ok) { errBox.className = 'ipi-notice ipi-notice--error'; errBox.textContent = draft.error; return; }
                    set(ctx, x => { if (idx >= 0) x.milestones[idx] = draft.milestone; else x.milestones.push(draft.milestone); });
                },
            }),
            idx >= 0 ? button('Cancel', { kind: 'ghost', onClick: () => ctx.rerender() }) : null,
        ]),
    );
    ctx.openEditor(idx >= 0 ? `Edit “${existing.name}”` : 'New milestone', host);
}

// ---------------------------------------------------------------- economy
function economySection(ctx) {
    const e = ctx.settings.economy;
    const preview = pricePreview({ power: 4, utility: 6, type: 'permanent', duration: 'permanent', rarity: 'uncommon' }, e);
    const cheap = pricePreview({ power: 1, utility: 6, type: 'consumable', duration: 'instant', rarity: 'common' }, e);
    const strong = pricePreview({ power: 9, utility: 9, type: 'permanent', duration: 'permanent', rarity: 'premium' }, e);
    const reality = pricePreview({ power: 10, utility: 10, type: 'consumable', duration: 'instant', rarity: 'premium', realityAltering: true }, e);

    const apply = () => {
        const draft = economyDraft({ difficulty: e.difficulty, earnRate: e.earnRate, priceMultiplier: e.priceMultiplier });
        if (!draft.ok) { ctx.notify({ kind: 'error', title: 'Economy', text: draft.error }); return; }
        Object.assign(ctx.settings.economy, draft.economy);
        ctx.save({ rerender: true });
        ctx.actions.economyChanged();
    };

    return card([section('Fair and balanced pricing', [
        el('div', { class: 'ipi-hint', text: 'Prices always come from a fixed formula (power, utility, rarity, permanence, uses). These settings scale that formula — they never look at your balance.' }),
        cols([
            field('Difficulty', select(e.difficulty, Object.entries(DIFFICULTY).map(([value, d]) => ({ value, label: `${d.label} — prices ×${d.price}, earning ×${d.earn}` })), { onChange: v => { e.difficulty = v; apply(); } })),
            field('Earning rate', input(e.earnRate, { type: 'number', step: 0.1, min: 0.1, max: 10, onInput: v => { e.earnRate = Number(v); } }), 'Multiplies every reward (0.1–10).'),
            field('Price multiplier', input(e.priceMultiplier, { type: 'number', step: 0.1, min: 0.1, max: 10, onInput: v => { e.priceMultiplier = Number(v); } }), 'Multiplies every price (0.1–10).'),
        ]),
        row([button('Apply economy changes', { icon: '⚖️', onClick: apply })]),
        el('div', { class: 'ipi-hint', text: 'Changing these settings re-prices today\'s Shop only after you confirm — otherwise new prices start with the next rotation.' }),
        el('div', { class: 'ipi-grid2' }, [
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Typical cheap consumable' }), el('strong', { text: `${cheap.priceText} ${ctx.settings.currencyName}` })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Mid-tier permanent upgrade' }), el('strong', { text: `${preview.priceText} ${ctx.settings.currencyName}` })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Powerful permanent ability' }), el('strong', { text: `${strong.priceText} ${ctx.settings.currencyName}` })]),
            el('div', { class: 'ipi-detailrow' }, [el('span', { text: 'Reality-altering effect' }), el('strong', { text: `${reality.priceText} ${ctx.settings.currencyName}` })]),
        ]),
        el('div', { class: 'ipi-hint', text: economyHint(ctx.actions.economySnapshot(), ctx.settings.currencyName) }),
        disclosure('Formula details', [
            el('div', { class: 'ipi-hint', text: 'base = 10 × power^1.7 × rarity × duration × type × (0.75 + utility×0.05) × uses^0.85 × (2.5 if reality-altering)' }),
            el('div', { class: 'ipi-hint', text: 'Rarity: common ×1.0, uncommon ×1.6, rare ×2.8, premium ×5.0. Duration: instant ×0.45, scene ×0.7, day ×1.0, week ×1.8, permanent ×4.0.' }),
            el('div', { class: 'ipi-hint', text: 'Suggested prices from the AI are ignored — they are only logged as a warning when they differ greatly from the formula.' }),
        ]),
    ], { icon: '⚖️' })]);
}

// ---------------------------------------------------------------- daily shop
function shopSection(ctx) {
    const sh = ctx.settings.shop;
    const apply = () => {
        const draft = shopDraft({ ...sh });
        if (!draft.ok) { ctx.notify({ kind: 'error', title: 'Shop', text: draft.error }); return; }
        Object.assign(ctx.settings.shop, draft.shop);
        ctx.save({ rerender: true });
        ctx.notify({ kind: 'success', title: 'Shop', text: 'Daily rotation settings saved.' });
    };

    return card([section('Daily shop rotation', [
        cols([
            field('Timezone', input(sh.timezone, { placeholder: 'local', onInput: v => { sh.timezone = v; } }), `Use "local" for your browser timezone. Detected: ${localTimeZone()}${isValidTimeZone(sh.timezone) ? '' : ' — the current value is invalid and will fall back to UTC.'}`),
            field('Reset time (HH:MM)', input(sh.resetTime, { placeholder: '00:00', onInput: v => { sh.resetTime = v; } }), 'The rotation changes at this wall-clock time in the chosen timezone.'),
            field('Products per rotation', input(sh.size, { type: 'number', min: 4, max: 16, onInput: v => { sh.size = Number(v); } })),
        ]),
        cols([
            field('Daily offer discount %', input(sh.dailyOfferDiscount, { type: 'number', min: 0, max: 90, onInput: v => { sh.dailyOfferDiscount = Number(v); } })),
            field('Manual refreshes per day', input(sh.manualRefreshesPerDay, { type: 'number', min: 0, max: 20, onInput: v => { sh.manualRefreshesPerDay = Number(v); } })),
            field('Refresh cost', input(sh.manualRefreshCost, { type: 'number', min: 0, onInput: v => { sh.manualRefreshCost = Number(v); } }), `In ${ctx.settings.currencyName}.`),
        ]),
        cols([
            field('Surprise chance', input(sh.surpriseChance, { type: 'number', step: 0.05, min: 0, max: 1, onInput: v => { sh.surpriseChance = Number(v); } }), 'Chance that a rotation includes an off-theme item (0–1).'),
            field('AI products per rotation', input(sh.aiProducts, { type: 'number', min: 2, max: 10, onInput: v => { sh.aiProducts = Number(v); } })),
        ]),
        el('div', { class: 'ipi-field ipi-field--inline' }, [
            toggle(sh.useAi, { onChange: v => { sh.useAi = v; ctx.save(); } }),
            el('span', { class: 'ipi-field__label', text: 'Use the AI to generate contextual products' }),
            el('span', { class: 'ipi-field__hint', text: ctx.aiAvailable ? 'Validated and re-priced before use.' : 'Needs an AI source (Settings → AI).' }),
        ]),
        row([button('Save rotation settings', { icon: '💾', onClick: apply })]),
        el('div', { class: 'ipi-hint', text: 'Refreshing never removes anything you own: purchased items stay in your Inventory forever, and Shop Memory survives every rotation.' }),
    ], { icon: '🗓' })]);
}

// ---------------------------------------------------------------- AI context
function injectionSection(ctx) {
    const inj = ctx.settings.injection;
    return card([section('What the AI knows', [
        el('div', { class: 'ipi-field ipi-field--inline' }, [
            toggle(inj.enabled, { onChange: v => set(ctx, x => { x.injection.enabled = v; }) }),
            el('span', { class: 'ipi-field__label', text: 'Send System status to the AI' }),
        ]),
        cols([
            field('Position', select(inj.position, [{ value: 'chat', label: 'In chat, at depth' }, { value: 'prompt', label: 'After the story string' }], { onChange: v => set(ctx, x => { x.injection.position = v; }) }), 'Kept in a separate slot, so World Info and Author\'s Note are unaffected.'),
            field('Depth', input(inj.depth, { type: 'number', min: 0, max: 50, onInput: v => set(ctx, x => { x.injection.depth = Math.max(0, Math.min(50, Number(v) || 0)); }, { rerender: false }) })),
            field('Max characters', input(inj.maxChars, { type: 'number', min: 300, max: 6000, onInput: v => set(ctx, x => { x.injection.maxChars = Math.max(300, Math.min(6000, Number(v) || 1400)); }, { rerender: false }) })),
        ]),
        cols([
            el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(inj.includeBalance, { onChange: v => set(ctx, x => { x.injection.includeBalance = v; }) }), el('span', { class: 'ipi-field__label', text: 'Include the balance' })]),
            el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(inj.includePurpose, { onChange: v => set(ctx, x => { x.injection.includePurpose = v; }) }), el('span', { class: 'ipi-field__label', text: 'Include the Shop purpose' })]),
            el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(inj.scan, { onChange: v => set(ctx, x => { x.injection.scan = v; }) }), el('span', { class: 'ipi-field__label', text: 'Let World Info scan this text' })]),
        ]),
        disclosure('Preview of what is sent', [el('pre', { class: 'ipi-preview', text: ctx.injectionPreview() || '(nothing — open a chat first)' })], { open: false }),
        el('div', { class: 'ipi-hint', text: 'Purchased abilities, equipment and active effects are listed so the AI treats them as real. The AI is told never to invent purchases or change your balance.' }),
    ], { icon: '🧠' })]);
}

// ---------------------------------------------------------------- AI source
function aiSection(ctx) {
    const ai = ctx.settings.ai;
    const profiles = listProfiles();
    return card([section('AI source', [
        el('div', { class: 'ipi-hint', text: 'Used for optional event analysis, product generation, purpose interpretation and assistant commentary. Keyword rules and the built-in catalog always work without it.' }),
        cols([
            field('Source', select(ai.source, [
                { value: 'main', label: 'Main API (SillyTavern\'s current model)' },
                { value: 'profile', label: 'Connection profile' },
            ], { onChange: v => set(ctx, x => { x.ai.source = v; }) })),
            field('Connection profile', select(ai.profileId, [{ value: '', label: profiles.length ? '— select a profile —' : '— no profiles found —' }, ...profiles.map(p => ({ value: p.id, label: p.name }))], { onChange: v => set(ctx, x => { x.ai.profileId = v; }) }), profiles.length ? `${profiles.length} profile(s) available.` : 'Install the Connection Manager extension to use profiles.'),
            field('Max response tokens', input(ai.maxTokens, { type: 'number', min: 100, max: 4000, onInput: v => set(ctx, x => { x.ai.maxTokens = Math.max(100, Math.min(4000, Number(v) || 900)); }, { rerender: false }) })),
        ]),
        el('div', { class: 'ipi-hint', text: 'If a request fails, existing data is kept, keyword rules take over, and you can add events manually from the History tab.' }),
        row([button('Retry failed AI analysis', { kind: 'ghost', icon: '♻️', onClick: () => ctx.actions.retryAi() })]),
    ], { icon: '🤖' })]);
}

// ---------------------------------------------------------------- assistant
function assistantSection(ctx) {
    const a = ctx.settings.assistant;
    return card([section('Private shop assistant', [
        el('div', { class: 'ipi-hint', text: 'The assistant is invisible and inaudible to story characters, never buys anything on your behalf, and can be muted completely.' }),
        el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(a.enabled, { onChange: v => set(ctx, x => { x.assistant.enabled = v; }) }), el('span', { class: 'ipi-field__label', text: 'Enable the assistant' })]),
        cols([
            field('Name', input(a.name, { onInput: v => set(ctx, x => { x.assistant.name = v; }, { rerender: false }) })),
            field('Personality', select(a.personality, Object.keys(PERSONALITIES).map(p => ({ value: p, label: `${p[0].toUpperCase()}${p.slice(1)} — ${PERSONALITIES[p]}` })), { onChange: v => set(ctx, x => { x.assistant.personality = v; }) })),
        ]),
        cols([
            el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(a.toasts, { onChange: v => set(ctx, x => { x.assistant.toasts = v; }) }), el('span', { class: 'ipi-field__label', text: 'Comment as notifications' })]),
            el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(a.useAi, { onChange: v => set(ctx, x => { x.assistant.useAi = v; }) }), el('span', { class: 'ipi-field__label', text: 'Let the AI rephrase its comments' })]),
        ]),
    ], { icon: '💬' })]);
}

// ---------------------------------------------------------------- interface
function interfaceSection(ctx) {
    const ui = ctx.settings.ui;
    const themeOptions = Object.entries(COLOR_THEMES).map(([value, t]) => ({ value, label: t.label }));
    return card([section('Interface', [
        cols([
            field('Theme', select(ui.theme, themeOptions, { onChange: v => set(ctx, x => { x.ui.theme = v; }) })),
            field('Accent override', input(ui.accent, { placeholder: '#c77dff (blank = theme default)', onInput: v => set(ctx, x => { x.ui.accent = v; }) })),
            field('Button size (px)', input(ui.buttonSize, { type: 'number', min: 40, max: 96, onInput: v => set(ctx, x => { x.ui.buttonSize = Number(v); }, { rerender: false }) })),
        ]),
        cols([
            el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(ui.animations !== false, { onChange: v => set(ctx, x => { x.ui.animations = v; }) }), el('span', { class: 'ipi-field__label', text: 'Animations and effects' })]),
            el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(ui.notifications !== false, { onChange: v => set(ctx, x => { x.ui.notifications = v; }) }), el('span', { class: 'ipi-field__label', text: 'Show notifications' })]),
            el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(ui.compact, { onChange: v => set(ctx, x => { x.ui.compact = v; }) }), el('span', { class: 'ipi-field__label', text: 'Compact mode' })]),
            el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(ui.showButton !== false, { onChange: v => set(ctx, x => { x.ui.showButton = v; }) }), el('span', { class: 'ipi-field__label', text: 'Show the floating button' })]),
        ]),
        cols([
            field('Tab shown on open', select(ui.startTab, TABS.map(t => ({ value: t.id, label: t.label })), { onChange: v => set(ctx, x => { x.ui.startTab = v; }) })),
            field('Button position', el('div', { class: 'ipi-row' }, [
                badge(ui.buttonPos ? `${Math.round(ui.buttonPos.x)}, ${Math.round(ui.buttonPos.y)}` : 'default', 'muted'),
                button('Reset position', { kind: 'ghost', sm: true, onClick: () => ctx.actions.resetButtonPos() }),
            ]), 'Drag the floating button anywhere; the position is remembered.'),
        ]),
        el('div', { class: 'ipi-hint', text: 'Keyboard: Ctrl+Shift+S opens or closes the System, Escape closes it. The panel never blocks the chat input.' }),
    ], { icon: '🎨' })]);
}

// ---------------------------------------------------------------- data & safety
function dataSection(ctx) {
    const b = ctx.settings.backups;
    return card([section('Backups, import & export', [
        el('div', { class: 'ipi-field ipi-field--inline' }, [toggle(b.enabled, { onChange: v => set(ctx, x => { x.backups.enabled = v; }) }), el('span', { class: 'ipi-field__label', text: 'Keep automatic local backups' })]),
        row([
            field('Backups kept per chat', input(b.keep, { type: 'number', min: 1, max: 100, onInput: v => set(ctx, x => { x.backups.keep = Math.max(1, Math.min(100, Number(v) || 20)); }, { rerender: false }) })),
        ]),
        el('div', { class: 'ipi-quickrow' }, [
            button('Export everything', { icon: '⬇️', onClick: () => ctx.actions.exportData() }),
            button('Export Shop Memory only', { kind: 'ghost', icon: '🧠', onClick: () => ctx.actions.exportMemory() }),
            button('Import from file', { kind: 'ghost', icon: '⬆️', onClick: () => ctx.actions.importData() }),
            button('Snapshot now', { kind: 'ghost', icon: '📸', onClick: () => ctx.actions.snapshot() }),
        ]),
        el('div', { class: 'ipi-hint', text: 'Exports are plain JSON containing progression, inventory, achievements, the ledger and Shop Memory. Nothing leaves your browser.' }),
        disclosure('Where data is stored', [
            el('div', { class: 'ipi-hint', text: 'Progression: ' + scopeText(ctx.settings.scope) }),
            el('div', { class: 'ipi-hint', text: 'Shop Memory: ' + scopeText(ctx.settings.memoryScope) }),
            el('div', { class: 'ipi-hint', text: 'Chat-scoped data is saved inside the chat file, so it survives page refreshes, restarts and chat switching. A local backup copy is kept in the browser for recovery.' }),
        ]),
        disclosure('Danger zone', [
            el('div', { class: 'ipi-hint', text: 'These actions are irreversible. Export first if you are unsure.' }),
            el('div', { class: 'ipi-quickrow' }, [
                button('Clear this chat\'s progression', { kind: 'danger', icon: '⚠️', onClick: () => ctx.actions.confirmThen('Delete all Points, inventory, achievements and history for this chat? Shop Memory is kept.', () => ctx.actions.resetProgression()) }),
                button('Reset all settings to defaults', { kind: 'danger', icon: '⚠️', onClick: () => ctx.actions.confirmThen('Reset every setting (categories, shop, economy, interface) to its default value? Progression and Shop Memory are kept.', () => ctx.actions.resetSettings()) }),
            ]),
        ]),
    ], { icon: '🛟' })]);
}

function scopeText(scope) {
    return scope === 'chat' ? 'this chat only (independent progression)' : scope === 'character' ? 'shared across this character\'s / group\'s chats' : 'shared across every chat';
}

