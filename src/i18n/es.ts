import type { Messages } from './en.ts';

export const es: Messages = {
  app: {
    title: 'ARAM Roulette', brandPrefix: 'ARAM', brandName: 'ROULETTE', mode: 'ARAM: MAYHEM',
    description: 'Seis oportunidades para tomar pésimas decisiones. Una selección de objetos para ARAM independiente del juego.',
    language: 'Idioma', english: 'English', spanish: 'Español',
    footer: 'HECHO PARA LAS MALAS IDEAS.',
    dataVersion: (version: string) => `Sin conexión · Data Dragon ${version}`,
    disclaimer: 'ARAM Roulette no cuenta con el respaldo de Riot Games. League of Legends y sus ilustraciones pertenecen a Riot Games.',
    error: 'La ruleta se atascó. Inténtalo de nuevo.', back: 'Volver a los campeones',
  },
  welcome: {
    eyebrow: 'UNA PÉSIMA IDEA. AHORA JUGABLE.',
    title: 'ARAM', accent: 'ROULETTE!', tagline: 'EQUÍPATE SIN PENSAR.',
    intro: 'Seis elecciones. Tres reintentos. Cero consejos profesionales.',
    rulesTitle: 'LEE ESTO. O NO.',
    rules: ['Elige a tu campeón', 'Hechizos al azar', 'Elige 1 de 2 objetos', 'El objeto #2 son botas', '3 reintentos. Y punto.', 'Arrepiéntete de todo'],
    start: '¡QUE EMPIECE EL CAOS!', note: 'No necesitas talento. Ese es el problema.',
  },
  champions: {
    eyebrow: '01 / LA VÍCTIMA DEL SORTEO', title: '¿Quién te tocó?',
    intro: 'Trae a tu campeón. Deja la guía de objetos en casa.', search: 'Buscar campeones', placeholder: 'Buscar campeones…',
    count: (count: number) => `${count} ${count === 1 ? 'campeón' : 'campeones'}`,
    roster: 'Campeones', empty: 'No encontramos campeones. Prueba con otro nombre.',
    selected: 'TU CÓMPLICE', stamp: 'ELECCIÓN CUESTIONABLE',
    choose: 'Elige a tu cómplice para las malas decisiones.', start: 'GIRAR LA RULETA',
  },
  spells: {
    swap: 'CAMBIAR D / F', swapHint: 'Los hechizos no. Las teclas sí.',
    eyebrow: '02 / EL DESTINO HA HABLADO', title: 'Estos son tus hechizos.',
    intro: (champion: string) => `${champion}, tendrás que arreglártelas con esto.`,
    dealt: 'TE TOCÓ. NO SE CAMBIA.',
    note: 'Estos hechizos ya no se cambian. Ahora viene lo realmente cuestionable.', start: 'ELEGIR MIS OBJETOS',
  },
  draft: {
    regret: 'Esto huele a arrepentimiento.',
    standard: { eyebrow: 'ELIGE TU VENENO', title: 'Elige tu próximo error.', note: 'Uno se queda. El otro se va. No hay vuelta atrás.' },
    boots: { eyebrow: 'PONTE LAS BOTAS', title: 'El caos empieza por los pies.', note: 'La única compra sensata que vas a hacer.' },
    build: 'OBJETO', versus: 'VS!', lock: 'ME LO QUEDO', lockItem: (name: string) => `Quedarme con ${name}`,
    gold: (amount: string) => `${amount} DE ORO`, reroll: 'CAMBIAR AMBOS', left: (count: number) => `${count} RESTANTES`,
    hopeful: 'Seguro que los siguientes salen mejores.', exhausted: 'Se acabaron los cambios. Elige tu veneno.',
    rerolls: 'REINTENTOS', details: (name: string) => `Detalles: ${name}`, noDetails: 'No hay más detalles disponibles.',
    damage: 'TU DESASTRE HASTA AHORA', lockedCount: (count: number, size: number) => `${count} de ${size} confirmados`,
  },
  tray: { label: 'Objetos confirmados', locked: 'CONFIRMADO', next: 'SIGUIENTE', unknown: 'POR DECIDIR', gold: (amount: string) => `${amount} de oro` },
  mascot: { welcome: 'Confía en mí. Soy un dado.', empty: 'Uy.', final: 'No veo ningún problema.' },
  final: {
    eyebrow: '04 / NO SE ACEPTAN DEVOLUCIONES', title: 'Tu cuestionable', accent: 'obra maestra.',
    intro: 'Tomaste seis decisiones. Nadie dijo que fueran buenas.',
    cost: (amount: string) => `${amount} de oro invertidos en tus malas ideas.`,
    newBuild: 'OTRA PARTIDA', change: 'CAMBIAR CAMPEÓN', note: 'Sal ahí y desconcierta a todo el mundo.',
  },
};
