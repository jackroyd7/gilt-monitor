import { connection } from "next/server";
import NewsFeed from "@/components/NewsFeed";
import { PageHeader } from "@/components/Tiles";
import { NEWS_TOPICS } from "@/config/news";
import { getNews } from "@/lib/news-fetch";

export const metadata = { title: "News · Markets Monitor" };

export default async function NewsPage() {
  await connection(); // fetch (or reuse the 10-minute cache) on each visit
  const news = await getNews();
  return (
    <>
      <PageHeader title="News">
        Headlines from the last week on the topics in <code>config/news.ts</code> (Google News searches plus the Bank of
        England&apos;s own feed). Filter by topic, search, mute words you don&apos;t want, or rank by relevance to gilts and
        UK rates.
      </PageHeader>
      <NewsFeed
        items={news.items}
        topics={NEWS_TOPICS.map((t) => ({ id: t.id, label: t.label }))}
        fetchedAt={news.fetchedAt}
        failures={news.failures}
      />
    </>
  );
}
