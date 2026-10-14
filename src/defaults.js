// Global settings (extension_settings.infinite_points). Progression and Shop memory live elsewhere
// (chat metadata by default) – see storage.js.
import { DEFAULT_CATEGORIES, DEFAULT_INTENSITY, DEFAULT_MILESTONES } from './content.js';
import { clone } from './util.js';

export function defaultSettings() {
    return {
        version: 1,
        enabled: true,
        currencyName: 'Points',
        systemName: 'The System',
        user: { gender: 'unspecified' },   // male | female | other | unspecified — words the sexual record
        levels: { xpMult: 1 },             // global multiplier on all XP gain (1 = the tuned default)
        scope: 'chat',             // progression: chat | character | global
        memoryScope: 'chat',       // shop memory: chat | character | global
        detection: {
            enabled: true,
            mode: 'keywords',      // keywords | ai | hybrid
            aiFallback: true,      // use keywords when AI analysis fails
            scanUser: true,
            scanChar: true,
            ignoreQuoted: false,
            revokeOnDelete: true,
            maxEventsPerMessage: 3,
        },
        categories: clone(DEFAULT_CATEGORIES),
        intensity: clone(DEFAULT_INTENSITY),
        milestones: clone(DEFAULT_MILESTONES),
        achievementBonus: 25,
        economy: { difficulty: 'normal', earnRate: 1, priceMultiplier: 1 },
        shop: {
            timezone: 'local',
            resetTime: '00:00',
            size: 8,
            dailyOfferDiscount: 25,
            manualRefreshesPerDay: 1,
            manualRefreshCost: 0,
            surpriseChance: 0.35,
            useAi: false,
            aiProducts: 6,
        },
        effects: { sceneMessages: 12, dayMessages: 40, weekMessages: 200 },
        ai: { source: 'main', profileId: '', maxTokens: 900 },
        injection: { enabled: true, position: 'chat', depth: 4, maxChars: 1400, includeBalance: true, includePurpose: true, scan: false },
        commands: { enabled: true, passive: true },
        recommendations: { enabled: true },
        assistant: { enabled: true, personality: 'mysterious', name: 'Echo', toasts: true, useAi: false },
        ui: { theme: 'void', accent: '', buttonSize: 56, showButton: true, animations: true, buttonPos: null, notifications: true, startTab: 'overview', compact: false },
        backups: { enabled: true, keep: 20 },
        profiles: {},   // shared progression when scope != chat
        memories: {},   // shared shop memory when memoryScope != chat
    };
}
