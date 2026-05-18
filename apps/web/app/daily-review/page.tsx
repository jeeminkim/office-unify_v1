import { DailyReviewClient } from './DailyReviewClient';

export const metadata = {
  title: 'Daily Operations Review',
  description: '오늘의 후보·억제·운영 점검',
};

export default function DailyReviewPage() {
  return <DailyReviewClient />;
}
