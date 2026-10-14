// Sexual record: per-act tallies derived from the progression counters, worded for the user's
// gender. Pure — no DOM, no SillyTavern imports, so it is fully unit-testable.
//
// The engine already counts every rewarded event per category (progress.counts), so this module
// only has to sum the categories that make up each stat and pick the right wording. Change
// SEX_STATS in content.js to add, remove or reword a stat.
import { SEX_STATS, GENDERS } from './content.js';

const genderKey = g => (GENDERS.some(x => x.id === g) ? g : 'unspecified');

/**
 * @param {object} progress Progression object (uses progress.counts).
 * @param {string} gender   'male' | 'female' | 'other' | 'unspecified'
 * @returns {{id,icon,label,count,points}[]} sorted by count desc, then label.
 */
export function sexStats(progress, gender = 'unspecified') {
    const g = genderKey(gender);
    const counts = progress?.counts || {};
    return SEX_STATS.map(s => {
        const count = s.from.reduce((sum, id) => sum + (counts[id]?.count || 0), 0);
        const points = s.from.reduce((sum, id) => sum + (counts[id]?.points || 0), 0);
        return { id: s.id, icon: s.icon, label: s.label[g] || s.label.unspecified, count, points };
    }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Totals for the sexual record as a whole. */
export function sexTotals(progress) {
    const rows = sexStats(progress);
    return {
        acts: rows.reduce((s, r) => s + r.count, 0),
        tracked: rows.filter(r => r.count > 0).length,
        points: rows.reduce((s, r) => s + r.points, 0),
    };
}
