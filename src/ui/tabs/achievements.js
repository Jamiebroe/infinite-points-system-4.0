// Achievements tab: unlocked badges, upcoming achievements and milestone bonuses.
import { el, mount } from '../dom.js';
import { card, section, cols, badge, empty, progress, row } from '../controls.js';
import { achievementModel } from '../viewmodel.js';
import { fmt } from '../../util.js';

export function render(body, ctx) {
    if (!ctx.ready) { mount(body, [card([empty('Open a chat to see Achievements.', '🏅')])]); return; }
    const a = achievementModel({ settings: ctx.settings, progress: ctx.progress, achievements: ctx.achievements });

    const head = card([el('div', { class: 'ipi-achhead' }, [
        el('div', { class: 'ipi-achhead__icon', text: '🏅' }),
        el('div', { class: 'ipi-grow' }, [
            el('div', { class: 'ipi-achhead__title', text: `${a.count} of ${a.total} achievements unlocked` }),
            progress(a.total ? (a.count / a.total) * 100 : 0, { kind: 'gold' }),
            el('div', { class: 'ipi-hint', text: `Each achievement grants ${fmt(a.bonus)} ${ctx.settings.currencyName}.` }),
        ]),
    ])], 'ipi-card--hero');

    const unlocked = card([section(`Unlocked (${a.unlocked.length})`, a.unlocked.length
        ? [cols(a.unlocked.map(u => el('div', { class: 'ipi-badgecard ipi-badgecard--on' }, [
            el('div', { class: 'ipi-badgecard__icon', text: u.icon }),
            el('div', { class: 'ipi-badgecard__name', text: u.name }),
            el('div', { class: 'ipi-badgecard__desc', text: u.desc }),
            badge(u.atText, 'good'),
        ])), 'ipi-cols--badges')]
        : [empty('None yet — trigger your first event.', '✨')], { icon: '✨' })]);

    const locked = card([section(`Still locked (${a.locked.length})`, a.locked.length
        ? [cols(a.locked.map(u => el('div', { class: 'ipi-badgecard' }, [
            el('div', { class: 'ipi-badgecard__icon ipi-badgecard__icon--dim', text: u.icon }),
            el('div', { class: 'ipi-badgecard__name', text: u.name }),
            el('div', { class: 'ipi-badgecard__desc', text: u.desc }),
            progress(u.progress, { kind: 'accent', label: `${fmt(u.current)} / ${fmt(u.n)}` }),
        ])), 'ipi-cols--badges')]
        : [empty('Everything unlocked. Impressive.', '👑')], { icon: '🔒' })]);

    const milestones = card([section('Milestones', a.milestones.length
        ? a.milestones.map(m => el('div', { class: `ipi-milestone${m.reached ? ' ipi-milestone--done' : ''}${m.enabled ? '' : ' ipi-milestone--off'}` }, [
            row([
                el('div', { class: 'ipi-grow' }, [
                    el('div', { class: 'ipi-milestone__name' }, [m.name, m.reached ? badge('reached', 'good') : m.enabled ? null : badge('disabled', 'muted')]),
                    el('div', { class: 'ipi-hint', text: `${m.kind === 'events' ? 'Events triggered' : 'Lifetime Points'} · target ${fmt(m.threshold)} · bonus ${fmt(m.bonus)}` }),
                    progress(m.progress, { kind: 'gold' }),
                ]),
                el('span', { class: 'ipi-muted', text: m.reached ? m.atText : `${fmt(m.current)} / ${fmt(m.threshold)}` }),
            ]),
        ]))
        : [empty('No milestones configured.', '🎯')], { icon: '🎯', hint: 'Milestones can also add a special Shop offer when reached' })]);

    mount(body, [head, unlocked, locked, milestones]);
}
