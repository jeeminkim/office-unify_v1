import type { InfographicZone } from '@office-unify/shared-types';
import { wrapTextLines } from './svgText';

type Props = {
  zone: InfographicZone;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function ZoneCard({ zone, x, y, width, height }: Props) {
  const titleLines = wrapTextLines(zone.name, 18, 2);
  const itemText = zone.items.slice(0, 5).join(' · ') || '정보 없음';
  const itemLines = wrapTextLines(itemText, 30, 3);
  const keywordText = zone.visualKeywords.slice(0, 4).join(' / ');
  const keywordLines = wrapTextLines(keywordText || '키워드 없음', 30, 2);

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={12} fill="#ffffff" stroke="#dbe4f0" />
      {titleLines.map((line, i) => (
        <text key={`title-${i}`} x={x + 14} y={y + 24 + i * 16} fontSize={13} fontWeight={700} fill="#1f3b63">
          {line}
        </text>
      ))}
      {itemLines.map((line, i) => (
        <text key={`item-${i}`} x={x + 14} y={y + 62 + i * 15} fontSize={11} fill="#334155">
          {line}
        </text>
      ))}
      {keywordLines.map((line, i) => (
        <text key={`kw-${i}`} x={x + 14} y={y + height - 24 + i * 14} fontSize={10} fill="#64748b">
          {line}
        </text>
      ))}
    </g>
  );
}

