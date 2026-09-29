export const en = {
  app: {
    title: 'ARAM Roulette', brandPrefix: 'ARAM', brandName: 'ROULETTE', mode: 'ARAM: MAYHEM',
    description: 'Six opportunities to make terrible decisions. A standalone ARAM item draft.',
    language: 'Language', english: 'English', spanish: 'Español',
    footer: 'BUILT FOR BAD IDEAS.',
    dataVersion: (version: string) => `Offline · Data Dragon ${version}`,
    disclaimer: 'ARAM Roulette isn’t endorsed by Riot Games. League of Legends and its artwork belong to Riot Games.',
    error: 'The roulette hit a snag. Please try again.', back: 'Back to champions',
  },
  welcome: {
    eyebrow: 'A VERY BAD IDEA. NOW PLAYABLE.',
    title: 'ARAM', accent: 'ROULETTE!', tagline: 'BUILD LIKE AN IDIOT.',
    intro: 'Six choices. Three rerolls. Absolutely no professional advice.',
    rulesTitle: 'READ THIS. OR DON’T.',
    rules: ['Pick your champion', 'Get random spells', 'Choose 1 of 2 items', 'Item #2 is always boots', '3 rerolls. That’s it.', 'Regret everything'],
    start: 'LET’S GAMBLE!', note: 'No skill required. That’s the problem.',
  },
  champions: {
    eyebrow: '01 / THE UNLUCKY VOLUNTEER', title: 'Who did you get?',
    intro: 'Bring your champion. Leave your build guide behind.', search: 'Search champions', placeholder: 'Search champions…',
    count: (count: number) => `${count} ${count === 1 ? 'champion' : 'champions'}`,
    roster: 'Champions', empty: 'No champions found. Try another name.',
    selected: 'YOUR ACCOMPLICE', stamp: 'QUESTIONABLE CHOICE',
    choose: 'Choose your partner in bad decisions.', start: 'START ROULETTE',
  },
  spells: {
    swap: 'SWAP D / F', swapHint: 'The spells stay. The keys don’t have to.',
    eyebrow: '02 / FATE HAS SPOKEN', title: 'Your spells are dealt.',
    intro: (champion: string) => `${champion}, meet your new coping mechanisms.`,
    dealt: 'DEALT. NO TAKEBACKS.',
    note: 'Locked for this build. Now for the truly questionable part.', start: 'DRAFT MY ITEMS',
  },
  draft: {
    regret: 'Probably going to regret this.',
    standard: { eyebrow: 'PICK YOUR POISON', title: 'Choose your next mistake.', note: 'One stays. One goes. Your choice is permanent.' },
    boots: { eyebrow: 'GET YOUR SHOES', title: 'Time to pick your kicks.', note: 'Time for the only sensible purchase you’ll make.' },
    build: 'BUILD', versus: 'VS!', lock: 'LOCK IT IN', lockItem: (name: string) => `Lock in ${name}`,
    gold: (amount: string) => `${amount} GOLD`, reroll: 'REROLL BOTH', left: (count: number) => `${count} LEFT`,
    hopeful: 'Surely the next two will be better.', exhausted: 'Out of second thoughts. Pick your poison.',
    rerolls: 'REROLLS', details: (name: string) => `Details: ${name}`, noDetails: 'No extra details available.',
    damage: 'YOUR CURRENT DISASTER', lockedCount: (count: number, size: number) => `${count} of ${size} locked`,
  },
  tray: { label: 'Locked build items', locked: 'LOCKED', next: 'UP NEXT', unknown: 'UNKNOWN', gold: (amount: string) => `${amount} gold` },
  mascot: { welcome: 'Trust me. I’m a die.', empty: 'Uh oh.', final: 'I see nothing wrong here.' },
  final: {
    eyebrow: '04 / ABSOLUTELY NO REFUNDS', title: 'Your questionable', accent: 'masterpiece.',
    intro: 'Six decisions were made. We’re not saying they were good ones.',
    cost: (amount: string) => `${amount} gold worth of commitment.`,
    newBuild: 'RUN IT AGAIN', change: 'CHANGE CHAMPION', note: 'Go forth. Confuse everyone.',
  },
};

export type Messages = typeof en;
