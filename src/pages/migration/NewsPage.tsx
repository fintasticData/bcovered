import { PageHero } from './components/PageHero'
import { newsItems } from './content/site'

export default function MigrationNewsPage() {
  return (
    <>
      <PageHero title="News" crumbs={[{ label: 'News' }]} />
      <section className="mig-section">
        <div className="mig-wrap">
          <p className="mig-lead" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
            Keep up to date with our latest news & blog articles. Full article bodies will be imported when content
            rights are confirmed; titles and dates below match the live site listing.
          </p>
          <div className="mig-news-grid">
            {newsItems.map((n) => (
              <article key={n.id} id={n.id} className="mig-news-card">
                <div className="mig-news-thumb" />
                <div className="mig-news-body">
                  <time dateTime={n.date}>{n.date}</time>
                  <h3>{n.title}</h3>
                  <p>{n.excerpt}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
