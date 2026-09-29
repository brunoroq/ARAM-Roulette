import { assets } from '../../assets.ts';

export function DiceMascot({ mood = 'smug', dialogue, className = '' }: { mood?: 'smug' | 'worried'; dialogue?: string; className?: string }) {
  return <aside className={`mascot mascot-${mood} ${className}`}>
    {dialogue && <p className="mascot-bubble">{dialogue}</p>}
    <div className="mascot-art"><img src={mood === 'worried' ? assets.mascotWorried : assets.mascotDefault} alt="" /></div>
  </aside>;
}
