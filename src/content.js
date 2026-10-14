// Default reward rules, achievements and UI color themes.
//
// ADULTS ONLY. This content set is written for fictional roleplay between fictional adult
// characters. Every category below is a lewd act the System rewards; every product the Shop
// stocks is a lewd aid. Nothing here is a combat, quest or crafting system by design.
//
// `keywords` are matched by detect.js. Syntax: comma separated, `word*` is a prefix wildcard,
// `a * b` allows up to three words between, `re:<regex>` is a raw expression on its own line.
// Reward scales with intimacy: the deeper the act, the more Points the System grants.

// Every category carries TWO independent values:
//   points — the spendable reward. Drives prices, the balance and the economy. Editable, and
//            multiplied by the earn rate, so the user can inflate or deflate it freely.
//   xp     — the level reward. Hand-tuned per act for DIFFICULTY, EXTREMENESS and AVAILABILITY,
//            and deliberately NOT derived from points, so no economy setting or bought multiplier
//            can move the level track. XP is never spent, so a level only ever climbs.
//
// The XP scale is much steeper than the Points scale, because a level should reflect what you have
// actually done rather than how rich you are. Roughly:
//   1–5    ambient: flirting, kissing, touching, peeping on someone
//   6–12   a real scene: undressing, oral, toys, being tied up, overstimulation
//   14–20  extreme or hard to arrange: penetration, choking, watersports, your own climax
//   22–35  rare and elaborate: breeding, finishing inside, double penetration, a full orgy
// So an orgy (35) is worth seven times a peep (5), and thirty-five times a wink (1).
// Intensity multiplies XP exactly as it multiplies Points, and revoking an act takes its XP back.
export const DEFAULT_CATEGORIES = [
    { id: 'flirt', name: 'Flirtation', icon: '💋', enabled: true, points: 5, xp: 1, cooldown: 1, tags: 'teasing,charm',
        keywords: 'flirt*, tease*, wink*, suggestive, innuendo, bit * lip, biting * lip, batted * lashes, leaned in close, husky voice' },
    { id: 'kiss', name: 'Kissing', icon: '😘', enabled: true, points: 10, xp: 2, cooldown: 1, tags: 'kissing,intimacy',
        keywords: 'kiss*, kissing, made out, making out, locked lips, deepened the kiss, smooch*, necking' },
    { id: 'touch', name: 'Intimate Touch', icon: '🔥', enabled: true, points: 15, xp: 4, cooldown: 1, tags: 'touching,intimacy',
        keywords: 'caress*, fondl*, grope*, cuddl*, hands roam*, ran * hand* over, pressed * against, straddl*, straddled, felt * up' },
    { id: 'masturbation', name: 'Solo Play', icon: '✊', enabled: true, points: 15, xp: 3, cooldown: 1, tags: 'solo,masturbation',
        keywords: 'jerked off, jerking off, masturbat*, touched * self, fingers * self, played with * self, stroked * cock, rubbed * clit, came in * hand, finished on * hand' },
    { id: 'massage', name: 'Massage & Oiling', icon: '💆', enabled: true, points: 15, xp: 4, cooldown: 2, tags: 'body,oil',
        keywords: 'massag*, oiled * body, oiled * skin, oiled * back, rubbed * oil, warm oil, slick with oil, kneaded *, worked * knots' },
    { id: 'strip', name: 'Undressing', icon: '👗', enabled: true, points: 20, xp: 5, cooldown: 2, tags: 'undressing,reveal',
        keywords: 'undress*, strip*, peeled off, unbutton*, unzip*, unhook*, slid * straps, bared * skin, topless, naked, down to * underwear' },
    { id: 'scent', name: 'Scent Play', icon: '👃', enabled: true, points: 20, xp: 4, cooldown: 2, tags: 'fetish,scent',
        keywords: 'smelled * panties, sniffed * panties, inhaled * scent, huffed *, buried * face in * panties, smelled * clothes, musk' },
    { id: 'talk', name: 'Dirty Talk', icon: '🗣️', enabled: true, points: 20, xp: 4, cooldown: 1, tags: 'verbal,teasing',
        keywords: 'dirty talk, made * say it, said it out loud, told * exactly what, whispered * what * would do, described what * would do, made * beg, talked * through it, every filthy thing' },
    { id: 'voyeur', name: 'Voyeurism', icon: '🔭', enabled: true, points: 25, xp: 5, cooldown: 2, tags: 'fetish,voyeur',
        keywords: 'peep*, peeping, spied on, spying on, watched * undress, watched * shower, watched * bathe, hidden and watched, through the window, watched from the dark' },
    { id: 'fetish_feet', name: 'Feet', icon: '🦶', enabled: true, points: 25, xp: 5, cooldown: 2, tags: 'fetish,feet',
        keywords: 'bare feet, soles, toes, footjob, licked * toes, kissed * feet, soles of * feet' },
    { id: 'fetish_roleplay', name: 'Roleplay & Costumes', icon: '🎭', enabled: true, points: 25, xp: 5, cooldown: 2, tags: 'fetish,roleplay',
        keywords: 'costume, uniform, roleplay, role-play, played along, maid outfit, school uniform, cosplay' },
    { id: 'dressup', name: 'Outfit Control', icon: '🎀', enabled: true, points: 25, xp: 6, cooldown: 2, tags: 'fetish,dressup',
        keywords: 'made * wear, dressed * in, dressed * up like, put * in * outfit, chose * outfit, picked * clothes, chose what * wore, laid out * clothes' },
    { id: 'oral_give', name: 'Giving Oral', icon: '👄', enabled: true, points: 30, xp: 8, cooldown: 2, tags: 'oral,give',
        keywords: 'gave head, gave * head, sucked * off, took * in * mouth, lapped at, blew *, on * knees for' },
    { id: 'oral_receive', name: 'Receiving Oral', icon: '🫦', enabled: true, points: 30, xp: 8, cooldown: 2, tags: 'oral,receive',
        keywords: 'went down on you, ate * out, between your legs, received head, got head, took you in * mouth, sucked you off, licked you' },
    { id: 'theft', name: 'Panty Raid', icon: '🩲', enabled: true, points: 30, xp: 7, cooldown: 3, tags: 'fetish,theft',
        keywords: 'stole * underwear, stole * panties, took * panties, pocketed * panties, pocketed * underwear, stole * bra, kept * underwear, as a souvenir, trophy from * room' },
    { id: 'fetish_toys', name: 'Toys & Devices', icon: '🔌', enabled: true, points: 30, xp: 7, cooldown: 2, tags: 'fetish,toys',
        keywords: 'vibrator, dildo, plug, strap-on, buzzed against, pressed the toy, inserted * into you' },
    { id: 'edging', name: 'Edging & Denial', icon: '⏸️', enabled: true, points: 30, xp: 9, cooldown: 3, tags: 'fetish,edging',
        keywords: 'edging, right at the edge, denied *, denial, ruined *, stopped just before, held * back from, begged to come, not allowed to come' },
    { id: 'dom', name: 'Power Exchange', icon: '⛓️', enabled: true, points: 35, xp: 10, cooldown: 3, tags: 'dominance,submission',
        keywords: 'at * mercy, obey*, submi*, dominat*, on all fours, gave in to, commanded * to, ordered * to' },
    { id: 'impact', name: 'Impact Play', icon: '🖐️', enabled: true, points: 35, xp: 10, cooldown: 3, tags: 'fetish,impact',
        keywords: 'spank*, paddl*, flogged, flogging, whipped, whipping, caning, riding crop, belt across, reddened * skin, welts, handprint on, over * knee' },
    { id: 'fetish_bondage', name: 'Bondage & Restraint', icon: '🪢', enabled: true, points: 35, xp: 9, cooldown: 2, tags: 'fetish,bondage',
        keywords: 'bound, tied * up, restrained, rope*, handcuff*, cuffs, shibari, hogtied, spreader bar, blindfolded, gagged' },
    { id: 'cumplay', name: 'Cum Play', icon: '🍶', enabled: true, points: 35, xp: 9, cooldown: 2, tags: 'fetish,cumplay',
        keywords: 'facial, came on *, came across *, snowball*, licked * off, swallowed * load, covered in cum, dripping with' },
    { id: 'public', name: 'Exhibitionism', icon: '👁️', enabled: true, points: 40, xp: 12, cooldown: 3, tags: 'public,risk',
        keywords: 'in public, out in the open, where * could see, an audience, spectators, in front of others, risked being seen, half-hidden' },
    { id: 'fetish_degradation', name: 'Degradation', icon: '📢', enabled: true, points: 40, xp: 11, cooldown: 3, tags: 'fetish,degradation',
        keywords: 'humiliat*, degrad*, called * slut, called * whore, begged for, on display, filthy, pathetic, worthless' },
    { id: 'overstim', name: 'Overstimulation', icon: '⚡', enabled: true, points: 40, xp: 11, cooldown: 3, tags: 'fetish,overstim',
        keywords: 'overstimulat*, too sensitive, kept going after, ruined orgasm, forced * orgasm, multiple orgasms' },
    { id: 'climax_other', name: 'Their Climax', icon: '😵', enabled: true, points: 40, xp: 10, cooldown: 2, tags: 'climax,other',
        keywords: 'she came, he came, they came, her orgasm, his orgasm, climaxed around, came undone, spasmed around, their release' },
    { id: 'hypno', name: 'Hypnotic Play', icon: '🌀', enabled: true, points: 40, xp: 12, cooldown: 3, tags: 'fetish,hypno',
        keywords: 'hypnoti*, trance, under * spell, mindless, blank and obedient, count backwards, deep under, entranced, conditioned to' },
    { id: 'penetrate_give', name: 'Penetrating', icon: '🍆', enabled: true, points: 45, xp: 15, cooldown: 2, tags: 'penetration,give',
        keywords: 'thrust* into, pushed inside *, slid inside *, buried * in *, pounded *, fucked *, hammered into, drove * into' },
    { id: 'penetrate_receive', name: 'Being Penetrated', icon: '🔞', enabled: true, points: 45, xp: 15, cooldown: 2, tags: 'penetration,receive',
        keywords: 'inside you, inside her, inside him, took * inside, impaled *, filled you, rode * hard, on top of you, straddled you' },
    { id: 'corrupt', name: 'Corruption', icon: '😇', enabled: true, points: 45, xp: 14, cooldown: 4, tags: 'fetish,corruption',
        keywords: 'corrupt*, ruined * innocence, taught * to, made * into a, turned * into, debauched *, broke * in' },
    { id: 'breath', name: 'Breath Play', icon: '😮‍💨', enabled: true, points: 45, xp: 14, cooldown: 3, tags: 'fetish,breath',
        keywords: 'hand around * throat, hand * throat, choked, choking, squeezed * throat, throat * grip, cut off * air, breath play, could not breathe, gasping for air' },
    { id: 'watersports', name: 'Watersports', icon: '🚿', enabled: true, points: 50, xp: 18, cooldown: 3, tags: 'fetish,watersports',
        keywords: 'watersports, golden shower, pissed on, urinated, relieved * on' },
    { id: 'cuckold', name: 'Watching Them Taken', icon: '👀', enabled: true, points: 50, xp: 16, cooldown: 4, tags: 'fetish,cuckold',
        keywords: 'cuckold*, made * watch, let * watch, watched * take *, watched * fuck, watched * ride, watched * with another, watched * used, shared * with * friend' },
    { id: 'breeding', name: 'Breeding & Risk', icon: '🍼', enabled: true, points: 55, xp: 22, cooldown: 4, tags: 'fetish,breeding',
        keywords: 'breed *, breeding, put a baby, risk of pregnancy, no protection, without protection, raw and inside, fertilis*, knock * up, fill * with * seed' },
    { id: 'climax_self', name: 'Your Climax', icon: '💦', enabled: true, points: 55, xp: 18, cooldown: 2, tags: 'climax,self',
        keywords: 'you came, you climax*, you finished, you orgasm*, your release, you unravelled, came hard for' },
    { id: 'creampie', name: 'Finishing Inside', icon: '💧', enabled: true, points: 60, xp: 24, cooldown: 3, tags: 'creampie,risk',
        keywords: 'came inside, finished inside, filled * up, creampie, emptied * into, spilled inside, pumped * into' },
    { id: 'double', name: 'Double Penetration', icon: '👐', enabled: true, points: 65, xp: 30, cooldown: 4, tags: 'extreme,double',
        keywords: 'double penetration, double-penetrat*, both * at once, at both ends, spitroast, one in each, filled * both' },
    { id: 'group', name: 'Group & Orgy', icon: '👥', enabled: true, points: 70, xp: 35, cooldown: 4, tags: 'group,orgy',
        keywords: 'threesome, foursome, orgy, both of them, all three, joined in, shared * between, one on each side, took turns, one after another, gangbang' },
];

/**
 * Categories that count toward the 'fetishes' achievement condition. Keep this in step with
 * DEFAULT_CATEGORIES when you add or rename a kink category — `a_fetish_all` reads its target
 * count straight from this array, so the two can never drift apart.
 */
export const FETISH_IDS = [
    'fetish_bondage', 'fetish_toys', 'fetish_feet', 'fetish_degradation', 'fetish_roleplay',
    'watersports', 'voyeur', 'theft', 'scent', 'cumplay', 'overstim', 'corrupt',
    'edging', 'hypno', 'breeding', 'impact', 'breath', 'cuckold', 'dressup',
];

/**
 * XP granted for one act in a category: the category's hand-tuned `xp`, or — for a category the
 * user made themselves and never gave an `xp` — a fraction of its Points value, so custom
 * categories still level you up without any extra configuration.
 */
export function categoryXp(cat) {
    const tuned = Number(cat?.xp);
    if (Number.isFinite(tuned)) return Math.max(0, tuned);
    return Math.max(0, Number(cat?.points) || 0) * XP_PER_POINT;
}

export const DEFAULT_INTENSITY = [
    { id: 'minor', label: 'Tender', mult: 0.75, words: 'softly, gently, slowly, teasingly, barely, lightly, shyly, tentatively' },
    { id: 'major', label: 'Heated', mult: 1.5, words: 'eagerly, hungrily, desperately, greedily, urgently, intensely, rough*, breathless' },
    { id: 'epic', label: 'Overwhelming', mult: 2, words: 'overwhelming, mind-blanking, earth-shattering, relentless, merciless, insatiable, ruined, unstoppable' },
];

/** The user's own configuration. `gender` only changes how the sexual record is worded. */
export const GENDERS = [
    { id: 'unspecified', label: 'Not specified' },
    { id: 'male', label: 'Male' },
    { id: 'female', label: 'Female' },
    { id: 'other', label: 'Other / non-binary' },
];

/**
 * The sexual record shown in the Statistics tab. Each entry sums the event counts of one or more
 * reward categories, and is worded for the user's gender — a male user sees "Blowjobs received",
 * a female user sees "Times eaten out" for the same tally.
 *
 * `from` holds category ids; if you rename a category, update the id here too.
 */
export const SEX_STATS = [
    { id: 'orgasms', icon: '💦', from: ['climax_self'],
        label: { male: 'Orgasms', female: 'Orgasms', other: 'Orgasms', unspecified: 'Orgasms' } },
    { id: 'oral_received', icon: '🫦', from: ['oral_receive'],
        label: { male: 'Blowjobs received', female: 'Times eaten out', other: 'Oral received', unspecified: 'Oral received' } },
    { id: 'oral_given', icon: '👄', from: ['oral_give'],
        label: { male: 'Times you went down on someone', female: 'Times you sucked cock', other: 'Oral given', unspecified: 'Oral given' } },
    { id: 'penetrated', icon: '🔞', from: ['penetrate_receive'],
        label: { male: 'Times you were penetrated', female: 'Times you were fucked', other: 'Times penetrated', unspecified: 'Times penetrated' } },
    { id: 'penetrating', icon: '🍆', from: ['penetrate_give'],
        label: { male: 'Times you fucked someone', female: 'Times you rode someone', other: 'Times you penetrated', unspecified: 'Times you penetrated' } },
    { id: 'creampies', icon: '💧', from: ['creampie'],
        label: { male: 'Creampies given', female: 'Creampies received', other: 'Creampies', unspecified: 'Creampies' } },
    { id: 'partners_climax', icon: '😵', from: ['climax_other'],
        label: { male: "Partners' orgasms caused", female: "Partners' orgasms caused", other: "Partners' orgasms", unspecified: "Partners' orgasms" } },
    { id: 'orgies', icon: '👥', from: ['group'],
        label: { male: 'Orgies & group scenes', female: 'Orgies & group scenes', other: 'Orgies & group scenes', unspecified: 'Orgies & group scenes' } },
    { id: 'bondage', icon: '🪢', from: ['fetish_bondage'],
        label: { male: 'Times tied up or restrained', female: 'Times tied up or restrained', other: 'Bondage acts', unspecified: 'Bondage acts' } },
    { id: 'degraded', icon: '📢', from: ['fetish_degradation'],
        label: { male: 'Degrading acts', female: 'Times degraded', other: 'Degrading acts', unspecified: 'Degrading acts' } },
    { id: 'toys', icon: '🔌', from: ['fetish_toys'],
        label: { male: 'Toys used on someone', female: 'Toys used on you', other: 'Toys used', unspecified: 'Toys used' } },
    { id: 'feet', icon: '🦶', from: ['fetish_feet'],
        label: { male: 'Foot acts', female: 'Foot acts', other: 'Foot acts', unspecified: 'Foot acts' } },
    { id: 'public_acts', icon: '👁️', from: ['public'],
        label: { male: 'Public acts', female: 'Public acts', other: 'Public acts', unspecified: 'Public acts' } },
    { id: 'watersports', icon: '🚿', from: ['watersports'],
        label: { male: 'Watersports', female: 'Watersports', other: 'Watersports', unspecified: 'Watersports' } },
    { id: 'roleplay', icon: '🎭', from: ['fetish_roleplay'],
        label: { male: 'Costume & roleplay scenes', female: 'Costume & roleplay scenes', other: 'Costume & roleplay scenes', unspecified: 'Costume & roleplay scenes' } },
    { id: 'voyeurism', icon: '🔭', from: ['voyeur'],
        label: { male: 'Times you peeped on someone', female: 'Times you peeped on someone', other: 'Voyeurism', unspecified: 'Voyeurism' } },
    { id: 'theft', icon: '🩲', from: ['theft'],
        label: { male: 'Panties stolen', female: 'Underwear stolen', other: 'Things stolen', unspecified: 'Things stolen' } },
    { id: 'scent', icon: '👃', from: ['scent'],
        label: { male: 'Times you sniffed their things', female: 'Times you sniffed their things', other: 'Scent play', unspecified: 'Scent play' } },
    { id: 'cumplay', icon: '🍶', from: ['cumplay'],
        label: { male: 'Facials given', female: 'Facials received', other: 'Cum play', unspecified: 'Cum play' } },
    { id: 'overstim', icon: '⚡', from: ['overstim'],
        label: { male: 'Times you overstimulated someone', female: 'Times you were overstimulated', other: 'Overstimulation', unspecified: 'Overstimulation' } },
    { id: 'corrupt', icon: '😇', from: ['corrupt'],
        label: { male: 'People corrupted', female: 'People corrupted', other: 'Corruption', unspecified: 'Corruption' } },
    { id: 'masturbation', icon: '✊', from: ['masturbation'],
        label: { male: 'Times you got yourself off', female: 'Times you got yourself off', other: 'Solo play', unspecified: 'Solo play' } },
    { id: 'edging', icon: '⏸️', from: ['edging'],
        label: { male: 'Times you edged or denied someone', female: 'Times you were edged or denied', other: 'Edging & denial', unspecified: 'Edging & denial' } },
    { id: 'hypno', icon: '🌀', from: ['hypno'],
        label: { male: 'People you put under', female: 'Times you were put under', other: 'Hypnotic play', unspecified: 'Hypnotic play' } },
    { id: 'breeding', icon: '🍼', from: ['breeding'],
        label: { male: 'Times you bred someone', female: 'Times you were bred', other: 'Breeding & risk', unspecified: 'Breeding & risk' } },
    { id: 'double', icon: '👐', from: ['double'],
        label: { male: 'Double penetration scenes', female: 'Double penetration scenes', other: 'Double penetration', unspecified: 'Double penetration' } },
    { id: 'kisses', icon: '😘', from: ['kiss'],
        label: { male: 'Kisses', female: 'Kisses', other: 'Kisses', unspecified: 'Kisses' } },
    { id: 'undressed', icon: '👗', from: ['strip'],
        label: { male: 'Times you got someone undressed', female: 'Times you were undressed', other: 'Undressing', unspecified: 'Undressing' } },
    { id: 'penetration_total', icon: '🔗', from: ['penetrate_give', 'penetrate_receive'],
        label: { male: 'Penetration acts, either way', female: 'Penetration acts, either way', other: 'Penetration acts', unspecified: 'Penetration acts' } },
    { id: 'power', icon: '⛓️', from: ['dom'],
        label: { male: 'Times you took control', female: 'Times you gave up control', other: 'Power exchange', unspecified: 'Power exchange' } },
    { id: 'impact', icon: '🖐️', from: ['impact'],
        label: { male: 'Times you spanked someone', female: 'Times you were spanked', other: 'Impact play', unspecified: 'Impact play' } },
    { id: 'talk', icon: '🗣️', from: ['talk'],
        label: { male: 'Times you talked someone through it', female: 'Times you were talked through it', other: 'Dirty talk', unspecified: 'Dirty talk' } },
    { id: 'massage', icon: '💆', from: ['massage'],
        label: { male: 'Massages given', female: 'Massages received', other: 'Massage & oiling', unspecified: 'Massage & oiling' } },
    { id: 'breath', icon: '😮‍💨', from: ['breath'],
        label: { male: 'Times you took their breath', female: 'Times your breath was taken', other: 'Breath play', unspecified: 'Breath play' } },
    { id: 'cuckold', icon: '👀', from: ['cuckold'],
        label: { male: 'Times you watched them taken', female: 'Times you were watched', other: 'Watching them taken', unspecified: 'Watching them taken' } },
    { id: 'dressup', icon: '🎀', from: ['dressup'],
        label: { male: 'Times you dressed someone up', female: 'Times you were dressed up', other: 'Outfit control', unspecified: 'Outfit control' } },
];

/**
 * Levels, driven by XP rather than by Points. XP is earned per act from the category's own tuned
 * `xp` value, and per achievement unlocked, and it is never spent, so your level only ever climbs.
 * `min` is the cumulative XP needed to reach that level.
 *
 * A level is also the Shop's unlock gate: `rarities` lists the product rarities the Shop may stock,
 * and `rareBoost` multiplies the selection weight of rare and premium products. So a new player
 * never sees the expensive end of the catalogue, and it opens up as they level.
 */
export const LEVELS = [
    { level: 1, min: 0, name: 'Virgin', icon: '🕊️', rarities: ['common', 'uncommon', 'rare'], rareBoost: 1 },
    { level: 2, min: 80, name: 'Curious', icon: '🜂', rarities: ['common', 'uncommon', 'rare'], rareBoost: 1 },
    { level: 3, min: 200, name: 'Flirt', icon: '✦', rarities: ['common', 'uncommon', 'rare'], rareBoost: 1 },
    { level: 4, min: 380, name: 'Tease', icon: '✧', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 1.2 },
    { level: 5, min: 620, name: 'Minx', icon: '❖', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 1.4 },
    { level: 6, min: 920, name: 'Wanton', icon: '✵', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 1.5 },
    { level: 7, min: 1300, name: 'Lecher', icon: '✹', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 1.6 },
    { level: 8, min: 1750, name: 'Libertine', icon: '✷', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 1.9 },
    { level: 9, min: 2300, name: 'Pervert', icon: '✺', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 2.0 },
    { level: 10, min: 2950, name: 'Deviant', icon: '❃', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 2.2 },
    { level: 11, min: 3750, name: 'Depraved', icon: '❋', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 2.4 },
    { level: 12, min: 4700, name: 'Debauched', icon: '✱', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 2.6 },
    { level: 13, min: 5800, name: 'Corrupt', icon: '✲', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 2.8 },
    { level: 14, min: 7100, name: 'Degenerate', icon: '❂', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 3.0 },
    { level: 15, min: 8600, name: 'Vicious', icon: '❊', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 3.2 },
    { level: 16, min: 10300, name: 'Shameless', icon: '✴️', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 3.4 },
    { level: 17, min: 12200, name: 'Monstrous', icon: '❈', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 3.6 },
    { level: 18, min: 14300, name: 'Abyssal', icon: '❉', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 3.8 },
    { level: 19, min: 16600, name: 'Incarnate', icon: '✳️', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 4.0 },
    { level: 20, min: 19200, name: 'Unbound', icon: '👑', rarities: ['common', 'uncommon', 'rare', 'premium'], rareBoost: 4.5 },
];

/**
 * Fallback XP per Point, used only for a category that carries no hand-tuned `xp` of its own —
 * i.e. one the user added themselves. Every built-in category sets `xp` explicitly instead.
 */
export const XP_PER_POINT = 0.25;

/**
 * Fallback XP for an achievement that declares no `xp` of its own. Every built-in achievement sets
 * `xp` to a value scaled to how hard it is to earn, so this only covers user-added ones.
 */
export const XP_PER_ACHIEVEMENT = 25;

/** The level object for a cumulative XP total. Always returns a level. */
export function levelFor(xp = 0) {
    let out = LEVELS[0];
    for (const l of LEVELS) if (Number(xp) >= l.min) out = l;
    return out;
}

/** May the Shop stock this rarity at the given XP total? */
export function levelAllows(xp, rarity) {
    return levelFor(xp).rarities.includes(rarity);
}

export const DEFAULT_MILESTONES = [
    { id: 'm_life_500', name: 'Marked by the System', kind: 'lifetime', threshold: 500, bonus: 50, enabled: true },
    { id: 'm_life_2500', name: "The System's Favourite", kind: 'lifetime', threshold: 2500, bonus: 200, enabled: true },
    { id: 'm_life_10000', name: 'Depravity Incarnate', kind: 'lifetime', threshold: 10000, bonus: 750, enabled: true },
    { id: 'm_ev_10', name: 'Ten Indiscretions', kind: 'events', threshold: 10, bonus: 40, enabled: true },
    { id: 'm_ev_50', name: 'Fifty Indiscretions', kind: 'events', threshold: 50, bonus: 150, enabled: true },
    { id: 'm_ev_200', name: 'Two Hundred Indiscretions', kind: 'events', threshold: 200, bonus: 500, enabled: true },
];

/** `cond` is a key evaluated by metric() in model.js – never code. */
export const ACHIEVEMENTS = [
    { id: 'a_first_event', icon: '✨', name: 'System Online', desc: 'Earn your first Points from a lewd act.', cond: 'events', n: 1, xp: 10 },
    { id: 'a_events_25', icon: '🔥', name: 'Appetite', desc: 'Trigger 25 lewd events.', cond: 'events', n: 25, xp: 40 },
    { id: 'a_events_100', icon: '🌋', name: 'Insatiable', desc: 'Trigger 100 lewd events.', cond: 'events', n: 100, xp: 150 },
    { id: 'a_partners_1', icon: '💞', name: 'Initiated', desc: 'Take your first partner.', cond: 'partners', n: 1, xp: 15 },
    { id: 'a_partners_3', icon: '👥', name: 'Collector', desc: 'Take 3 different partners.', cond: 'partners', n: 3, xp: 50 },
    { id: 'a_partners_5', icon: '🏡', name: 'Menagerie', desc: 'Take 5 different partners.', cond: 'partners', n: 5, xp: 90 },
    { id: 'a_partners_10', icon: '🏰', name: 'Legion', desc: 'Take 10 different partners.', cond: 'partners', n: 10, xp: 200 },
    { id: 'a_first_buy', icon: '🛒', name: 'First Toy', desc: 'Buy anything from the Shop.', cond: 'purchases', n: 1, xp: 10 },
    { id: 'a_buy_10', icon: '🛍️', name: 'Well Equipped', desc: 'Make 10 purchases.', cond: 'purchases', n: 10, xp: 35 },
    { id: 'a_perm_1', icon: '💠', name: 'Ascended', desc: 'Own a permanent enhancement.', cond: 'permanents', n: 1, xp: 60 },
    { id: 'a_perm_5', icon: '🧬', name: 'Transcendent', desc: 'Own 5 permanent enhancements.', cond: 'permanents', n: 5, xp: 200 },
    { id: 'a_rare', icon: '💎', name: 'Connoisseur', desc: 'Buy a rare or premium product.', cond: 'rareBuy', n: 1, xp: 40 },
    { id: 'a_premium', icon: '💳', name: 'Premium Member', desc: 'Buy a premium product.', cond: 'premiumBuy', n: 1, xp: 80 },
    { id: 'a_life_1000', icon: '📊', name: 'Thousandfold', desc: 'Earn 1,000 lifetime Points.', cond: 'lifetime', n: 1000, xp: 60 },
    { id: 'a_life_10000', icon: '🌌', name: 'Infinite Depravity', desc: 'Earn 10,000 lifetime Points.', cond: 'lifetime', n: 10000, xp: 250 },
    { id: 'a_saver', icon: '🏦', name: 'Hoarder', desc: 'Hold 2,000 Points at once.', cond: 'balance', n: 2000, xp: 50 },
    { id: 'a_cats_5', icon: '🎭', name: 'Versatile', desc: 'Trigger 5 different kinds of act.', cond: 'categories', n: 5, xp: 30 },
    { id: 'a_wish', icon: '⭐', name: 'Wish Granted', desc: 'Buy an item from your wishlist.', cond: 'wishBuy', n: 1, xp: 40 },

    // ---- level unlocks (XP-driven)
    { id: 'a_level_5', icon: '❖', name: 'Minx', desc: 'Reach level 5.', cond: 'level', n: 5, xp: 60 },
    { id: 'a_level_10', icon: '❃', name: 'Deviant', desc: 'Reach level 10.', cond: 'level', n: 10, xp: 150 },
    { id: 'a_level_15', icon: '❊', name: 'Vicious', desc: 'Reach level 15.', cond: 'level', n: 15, xp: 300 },
    { id: 'a_level_20', icon: '👑', name: 'Unbound', desc: 'Reach level 20, the highest the System tracks.', cond: 'level', n: 20, xp: 600 },

    // ---- specific acts. `cat:<id>` counts events in one reward category.
    { id: 'a_orgy_1', icon: '👥', name: 'First Orgy', desc: 'Take part in your first group scene.', cond: 'cat:group', n: 1, xp: 60 },
    { id: 'a_orgy_10', icon: '🎪', name: 'Centre of Attention', desc: 'Take part in 10 group scenes.', cond: 'cat:group', n: 10, xp: 200 },
    { id: 'a_orgy_50', icon: '🌪️', name: 'Anything That Moves', desc: 'Take part in 50 group scenes.', cond: 'cat:group', n: 50, xp: 500 },
    { id: 'a_creampie_1', icon: '💧', name: 'Filled', desc: 'Finish inside someone for the first time.', cond: 'cat:creampie', n: 1, xp: 40 },
    { id: 'a_creampie_25', icon: '🫗', name: 'Breeding Ground', desc: 'Finish inside 25 times.', cond: 'cat:creampie', n: 25, xp: 150 },
    { id: 'a_oral_recv_25', icon: '🫦', name: 'Spoiled', desc: 'Receive oral 25 times.', cond: 'cat:oral_receive', n: 25, xp: 100 },
    { id: 'a_oral_give_25', icon: '👄', name: 'Diligent', desc: 'Give oral 25 times.', cond: 'cat:oral_give', n: 25, xp: 100 },
    { id: 'a_orgasms_50', icon: '💦', name: 'Fifty Releases', desc: 'Climax 50 times.', cond: 'cat:climax_self', n: 50, xp: 90 },
    { id: 'a_orgasms_200', icon: '🌊', name: 'Ruined', desc: 'Climax 200 times.', cond: 'cat:climax_self', n: 200, xp: 300 },
    { id: 'a_penetrated_50', icon: '🍆', name: 'Well Used', desc: 'Be penetrated 50 times.', cond: 'cat:penetrate_receive', n: 50, xp: 120 },
    { id: 'a_penetrating_50', icon: '🔥', name: 'Relentless', desc: 'Penetrate someone 50 times.', cond: 'cat:penetrate_give', n: 50, xp: 120 },
    { id: 'a_bondage_1', icon: '🪢', name: 'Bound', desc: 'Tie someone up, or be tied up.', cond: 'cat:fetish_bondage', n: 1, xp: 30 },
    { id: 'a_bondage_15', icon: '⛓️', name: 'Shibari Adept', desc: '15 bondage scenes.', cond: 'cat:fetish_bondage', n: 15, xp: 90 },
    { id: 'a_toys_1', icon: '🔌', name: 'Hardware', desc: 'Bring a toy into it.', cond: 'cat:fetish_toys', n: 1, xp: 25 },
    { id: 'a_toys_15', icon: '🎛️', name: 'Wired Up', desc: '15 toy scenes.', cond: 'cat:fetish_toys', n: 15, xp: 70 },
    { id: 'a_feet_1', icon: '🦶', name: 'Toe the Line', desc: 'Indulge a foot fetish.', cond: 'cat:fetish_feet', n: 1, xp: 20 },
    { id: 'a_public_1', icon: '👁️', name: 'Exhibitionist', desc: 'Do it somewhere you could be seen.', cond: 'cat:public', n: 1, xp: 30 },
    { id: 'a_public_10', icon: '📢', name: 'No Shame', desc: '10 public acts.', cond: 'cat:public', n: 10, xp: 90 },
    { id: 'a_degrade_1', icon: '🐕', name: 'Debased', desc: 'Debase someone, or be debased.', cond: 'cat:fetish_degradation', n: 1, xp: 30 },
    { id: 'a_degrade_20', icon: '📉', name: 'Nothing Left', desc: '20 degrading acts.', cond: 'cat:fetish_degradation', n: 20, xp: 110 },
    { id: 'a_roleplay_1', icon: '🎭', name: 'Method Actor', desc: 'Fuck in costume.', cond: 'cat:fetish_roleplay', n: 1, xp: 25 },
    { id: 'a_watersports_1', icon: '🚿', name: 'Soaked', desc: 'Indulge in watersports.', cond: 'cat:watersports', n: 1, xp: 60 },
    { id: 'a_voyeur_1', icon: '🔭', name: 'Peeping Tom', desc: 'Watch someone who does not know you are there.', cond: 'cat:voyeur', n: 1, xp: 20 },
    { id: 'a_voyeur_15', icon: '🪟', name: 'Window Watcher', desc: '15 times peeping on someone.', cond: 'cat:voyeur', n: 15, xp: 70 },
    { id: 'a_panties_1', icon: '🩲', name: 'Panty Thief', desc: 'Steal a pair of panties.', cond: 'cat:theft', n: 1, xp: 20 },
    { id: 'a_panties_10', icon: '🗄️', name: 'Drawer Raider', desc: 'Steal 10 pairs.', cond: 'cat:theft', n: 10, xp: 60 },
    { id: 'a_panties_50', icon: '🏆', name: 'Collection Complete', desc: 'Steal 50 pairs.', cond: 'cat:theft', n: 50, xp: 200 },
    { id: 'a_scent_1', icon: '👃', name: 'Scent Hound', desc: 'Bury your face in their things.', cond: 'cat:scent', n: 1, xp: 20 },
    { id: 'a_scent_20', icon: '🌫️', name: 'Obsessed', desc: '20 times sniffing their things.', cond: 'cat:scent', n: 20, xp: 80 },
    { id: 'a_cumplay_1', icon: '🍶', name: 'Glazed', desc: 'Finish on someone rather than in them.', cond: 'cat:cumplay', n: 1, xp: 30 },
    { id: 'a_cumplay_25', icon: '💧', name: 'Messy', desc: '25 cum play acts.', cond: 'cat:cumplay', n: 25, xp: 100 },
    { id: 'a_overstim_1', icon: '⚡', name: 'Too Much', desc: 'Keep going after they have finished.', cond: 'cat:overstim', n: 1, xp: 35 },
    { id: 'a_overstim_20', icon: '🔋', name: 'Relentless Machine', desc: '20 overstimulation scenes.', cond: 'cat:overstim', n: 20, xp: 100 },
    { id: 'a_corrupt_1', icon: '😇', name: 'Bad Influence', desc: 'Corrupt someone.', cond: 'cat:corrupt', n: 1, xp: 45 },
    { id: 'a_corrupt_10', icon: '🕳️', name: 'Ruined Them', desc: 'Corrupt 10 people.', cond: 'cat:corrupt', n: 10, xp: 150 },
    // ---- the later additions
    { id: 'a_impact_1', icon: '🖐️', name: 'Over the Knee', desc: 'Spank someone, or be spanked.', cond: 'cat:impact', n: 1, xp: 30 },
    { id: 'a_impact_25', icon: '🧨', name: 'Red Handed', desc: '25 impact play scenes.', cond: 'cat:impact', n: 25, xp: 120 },
    { id: 'a_talk_1', icon: '🗣️', name: 'Say It', desc: 'Make someone say it out loud.', cond: 'cat:talk', n: 1, xp: 15 },
    { id: 'a_talk_25', icon: '📣', name: 'Filthy Mouth', desc: '25 scenes of dirty talk.', cond: 'cat:talk', n: 25, xp: 70 },
    { id: 'a_massage_1', icon: '💆', name: 'Hands On', desc: 'Work someone over with your hands.', cond: 'cat:massage', n: 1, xp: 15 },
    { id: 'a_massage_20', icon: '🫧', name: 'Slick', desc: '20 massages or oiling scenes.', cond: 'cat:massage', n: 20, xp: 60 },
    { id: 'a_breath_1', icon: '😮‍💨', name: 'Out of Air', desc: 'Take someone\'s breath away, literally.', cond: 'cat:breath', n: 1, xp: 45 },
    { id: 'a_breath_15', icon: '🌬️', name: 'Lightheaded', desc: '15 breath play scenes.', cond: 'cat:breath', n: 15, xp: 110 },
    { id: 'a_cuckold_1', icon: '👀', name: 'Watching', desc: 'Watch them be taken by someone else.', cond: 'cat:cuckold', n: 1, xp: 60 },
    { id: 'a_cuckold_10', icon: '🎟️', name: 'Front Row', desc: '10 scenes you only watched.', cond: 'cat:cuckold', n: 10, xp: 180 },
    { id: 'a_dressup_1', icon: '🎀', name: 'Dolled Up', desc: 'Decide what someone wears.', cond: 'cat:dressup', n: 1, xp: 20 },
    { id: 'a_dressup_20', icon: '👗', name: 'Wardrobe', desc: '20 outfit control scenes.', cond: 'cat:dressup', n: 20, xp: 70 },
    { id: 'a_fetish_5', icon: '🧷', name: 'Connoisseur of Vice', desc: 'Indulge 5 different fetishes.', cond: 'fetishes', n: 5, xp: 80 },
    { id: 'a_fetish_all', icon: '⚜️', name: 'Depraved Beyond Measure', desc: 'Indulge every fetish the System tracks.', cond: 'fetishes', n: FETISH_IDS.length, xp: 500 },
];

export const COLOR_THEMES = {
    void: { label: 'Void', accent: '#c77dff', accent2: '#5ee7ff', bg: '#09060f', panel: '#150f22', text: '#f1e9ff', muted: '#9f8fbf' },
    azure: { label: 'Azure', accent: '#4fa3ff', accent2: '#8a5cff', bg: '#0b1020', panel: '#121a33', text: '#e6ecff', muted: '#8a97c2' },
    crimson: { label: 'Crimson', accent: '#ff4f6d', accent2: '#ff9f43', bg: '#14080c', panel: '#221018', text: '#ffe9ee', muted: '#c08a98' },
    emerald: { label: 'Emerald', accent: '#2fe39b', accent2: '#2fb3e3', bg: '#07130f', panel: '#0e2119', text: '#e5fff4', muted: '#87b8a3' },
    gold: { label: 'Gold', accent: '#ffcc4d', accent2: '#ff7a3d', bg: '#14100a', panel: '#221b10', text: '#fff6e0', muted: '#bfa77a' },
    light: { label: 'Daylight', accent: '#5b5bf0', accent2: '#e0529c', bg: '#f4f5fb', panel: '#ffffff', text: '#1d1f33', muted: '#6b6f8f' },
};
