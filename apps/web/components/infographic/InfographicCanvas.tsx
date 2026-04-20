"use client";

import { useEffect, useMemo, useRef } from 'react';
import type { InfographicSpec } from '@office-unify/shared-types';
import { IndustryStructureExportSvg } from './IndustryStructureExportSvg';
import { MarketOpinionExportSvg } from './MarketOpinionExportSvg';
import {
  resolveExportTemplate,
  templateDisplayName,
} from '../../lib/infographic/exportLayout';

const WIDTH = 794;
const HEIGHT = 1123;

type Props = {
  spec: InfographicSpec;
  /** true일 때만 SVG 하단에 경고·상세 메타(디버그) 표시. PNG 기본은 false */
  showExportDebug?: boolean;
  /** 개발·QA용: 선택된 저장 템플릿 라벨을 SVG 밖에서 표시 */
  showExportTemplateHint?: boolean;
  showSaveButton?: boolean;
  onBeforeSave?: () => boolean | Promise<boolean>;
  onRenderReadyChange?: (ready: boolean) => void;
};

export function InfographicCanvas({
  spec,
  showExportDebug = false,
  showExportTemplateHint = true,
  showSaveButton = true,
  onBeforeSave,
  onRenderReadyChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const exportTemplate = useMemo(
    () => resolveExportTemplate(spec.sourceMeta.articlePattern, spec.sourceMeta.resultMode),
    [spec.sourceMeta.articlePattern, spec.sourceMeta.resultMode],
  );

  useEffect(() => {
    onRenderReadyChange?.(Boolean(svgRef.current));
    return () => onRenderReadyChange?.(false);
  }, [onRenderReadyChange]);

  const handleSavePng = async () => {
    if (!svgRef.current) return;
    if (onBeforeSave) {
      const allowed = await onBeforeSave();
      if (!allowed) return;
    }
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH * 2;
      canvas.height = HEIGHT * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `${spec.industry || 'infographic'}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    };
    image.src = url;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">A4 비율 고정 템플릿 렌더</p>
        {showSaveButton ? (
          <button
            type="button"
            onClick={() => void handleSavePng()}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            PNG 저장
          </button>
        ) : null}
      </div>
      {showExportTemplateHint ? (
        <p className="text-[11px] text-slate-500">
          저장 템플릿: <span className="font-medium text-slate-700">{templateDisplayName(exportTemplate)}</span>
          {showExportDebug ? (
            <span className="text-slate-400"> · export 디버그 메타 표시</span>
          ) : (
            <span className="text-slate-400"> · PNG는 디바이스 스트립만(디버그 끔)</span>
          )}
        </p>
      ) : null}
      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        <svg ref={svgRef} width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="infographic export">
          {exportTemplate === 'industry_structure' ? (
            <IndustryStructureExportSvg spec={spec} showExportDebug={showExportDebug} />
          ) : (
            <MarketOpinionExportSvg spec={spec} showExportDebug={showExportDebug} />
          )}
        </svg>
      </div>
    </div>
  );
}
