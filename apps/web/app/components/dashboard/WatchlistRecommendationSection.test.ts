import React, { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WatchlistRecommendationCandidate } from '@office-unify/shared-types';
import { WatchlistRecommendationSection } from './WatchlistRecommendationSection';

function sampleRecommendation(overrides: Partial<WatchlistRecommendationCandidate> = {}): WatchlistRecommendationCandidate {
  return {
    recommendationId: 'rec-1',
    symbol: '005930',
    name: '삼성전자',
    market: 'KR',
    reasonCodes: ['theme_match'],
    displayReasons: ['반도체 관심 테마와 연결됩니다.'],
    sourceRefs: [{ sourceType: 'research_report', sourceId: 'r1', label: 'Research' }],
    confidence: 'medium',
    dataStatus: 'degraded',
    alreadyInWatchlist: false,
    approvalStatus: 'pending',
    doNotDo: ['데이터 확인 전 판단하지 않기'],
    nextChecks: ['최근 실적 확인'],
    ...overrides,
  };
}

function childrenOf(node: ReactNode): ReactNode[] {
  if (Array.isArray(node)) return node;
  if (node == null || typeof node === 'boolean') return [];
  return [node];
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!isValidElement(node)) return '';
  return childrenOf((node as ReactElement<{ children?: ReactNode }>).props.children).map(textOf).join('');
}

function findButtons(node: ReactNode): Array<ReactElement<{ children?: ReactNode; onClick?: () => void; disabled?: boolean }>> {
  const found: Array<ReactElement<{ children?: ReactNode; onClick?: () => void; disabled?: boolean }>> = [];
  const visit = (cur: ReactNode) => {
    if (!isValidElement(cur)) return;
    const el = cur as ReactElement<{ children?: ReactNode; onClick?: () => void; disabled?: boolean }>;
    if (el.type === 'button') found.push(el);
    for (const child of childrenOf(el.props.children)) visit(child);
  };
  visit(node);
  return found;
}

describe('WatchlistRecommendationSection', () => {
  it('renders empty state without calling write handlers', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const html = renderToStaticMarkup(
      React.createElement(WatchlistRecommendationSection, {
        recommendations: [],
        onApprove,
        onReject,
      }),
    );
    expect(html).toContain('현재 승인 대기 중인 관심종목 후보가 없습니다.');
    expect(onApprove).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it('calls approve and reject only from explicit buttons', () => {
    const rec = sampleRecommendation();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const tree = WatchlistRecommendationSection({
      recommendations: [rec],
      onApprove,
      onReject,
    });
    expect(onApprove).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();

    const buttons = findButtons(tree);
    const approve = buttons.find((b) => textOf(b).includes('관심종목에 추가'));
    const reject = buttons.find((b) => textOf(b).includes('관련 없음'));
    expect(approve).toBeTruthy();
    expect(reject).toBeTruthy();

    approve?.props.onClick?.();
    reject?.props.onClick?.();
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith(rec);
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledWith(rec);
  });

  it('disables approve/reject while the recommendation is busy', () => {
    const rec = sampleRecommendation();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const tree = WatchlistRecommendationSection({
      recommendations: [rec],
      busyRecommendationId: rec.recommendationId,
      onApprove,
      onReject,
    });
    const buttons = findButtons(tree);
    const approve = buttons.find((b) => textOf(b).includes('처리 중'));
    const reject = buttons.find((b) => textOf(b).includes('관련 없음'));
    expect(approve?.props.disabled).toBe(true);
    expect(reject?.props.disabled).toBe(true);
    approve?.props.onClick?.();
    reject?.props.onClick?.();
    expect(onApprove).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it('wording avoids automated execution claims', () => {
    const html = renderToStaticMarkup(
      React.createElement(WatchlistRecommendationSection, {
        recommendations: [sampleRecommendation()],
        onApprove: vi.fn(),
        onReject: vi.fn(),
      }),
    );
    expect(html).not.toMatch(/자동매매|자동 주문|자동 리밸런싱/);
  });
});
