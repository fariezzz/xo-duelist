import React from 'react';
import {
  Bomb,
  Dices,
  EyeOff,
  Hourglass,
  PenLine,
  Shield,
  Shuffle,
  Skull,
  Sparkles,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import type { CurseType, SkillType } from '../lib/mechanics';

type MechanicIconProps = {
  size?: LucideProps['size'];
  color?: string;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
};

const SKILL_ICONS: Record<SkillType, { Icon: LucideIcon; color: string }> = {
  BARRIER: { Icon: Shield, color: '#94a3b8' },
  OVERWRITE: { Icon: PenLine, color: '#a78bfa' },
  BOMB: { Icon: Bomb, color: '#ef4444' },
};

const CURSE_ICONS: Record<CurseType, { Icon: LucideIcon; color: string }> = {
  BLIND: { Icon: EyeOff, color: '#94a3b8' },
  SLOW: { Icon: Hourglass, color: '#f59e0b' },
  FUMBLE: { Icon: Dices, color: '#ef4444' },
};

export function SkillIcon({ skill, color, size = 18, strokeWidth = 2.3, className, style }: MechanicIconProps & { skill: SkillType }) {
  const meta = SKILL_ICONS[skill];
  const Icon = meta.Icon;
  return <Icon size={size} color={color ?? meta.color} strokeWidth={strokeWidth} className={className} style={style} />;
}

export function CurseIcon({ curse, color, size = 18, strokeWidth = 2.3, className, style }: MechanicIconProps & { curse: CurseType }) {
  const meta = CURSE_ICONS[curse];
  const Icon = meta.Icon;
  return <Icon size={size} color={color ?? meta.color} strokeWidth={strokeWidth} className={className} style={style} />;
}

export function PowerCellIcon({ color = '#fbbf24', size = 18, strokeWidth = 2.3, className, style }: MechanicIconProps) {
  return <Sparkles size={size} color={color} strokeWidth={strokeWidth} className={className} style={style} />;
}

export function CurseCellIcon({ color = '#ef4444', size = 18, strokeWidth = 2.3, className, style }: MechanicIconProps) {
  return <Skull size={size} color={color} strokeWidth={strokeWidth} className={className} style={style} />;
}

export function ShuffleIcon({ color = '#f59e0b', size = 18, strokeWidth = 2.3, className, style }: MechanicIconProps) {
  return <Shuffle size={size} color={color} strokeWidth={strokeWidth} className={className} style={style} />;
}
