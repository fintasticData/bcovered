import { Link } from 'react-router-dom'
import { Award, HeartHandshake, ShieldCheck, Users } from 'lucide-react'

const stats = [
  { value: '15+', label: 'Years advising' },
  { value: '12,000', label: 'Policies managed' },
  { value: '8', label: 'Insurer partners' },
  { value: '96%', label: 'Client retention' },
]

const values = [
  { icon: ShieldCheck, title: 'Integrity first', body: 'We disclose our commission and always recommend what’s right for you.' },
  { icon: HeartHandshake, title: 'Real relationships', body: 'You get a named adviser – not a call centre queue.' },
  { icon: Award, title: 'Qualified experts', body: 'Every adviser is RE5 qualified and FAIS fit-and-proper.' },
  { icon: Users, title: 'Community minded', body: 'We support road-safety and fire-prevention projects across SA.' },
]

const team = [
  { name: 'Nomsa Dlamini', role: 'Founder & Key Individual', img: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=600&q=70' },
  { name: 'Pieter Botha', role: 'Head of Personal Lines', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=70' },
  { name: 'Lerato Khumalo', role: 'Claims Manager', img: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=70' },
  { name: 'Ravi Pillay', role: 'Commercial Lines Specialist', img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=70' },
]

export default function AboutPage() {
  return (
    <>
      <section className="container-x grid grid-cols-1 gap-10 py-16 lg:grid-cols-2 lg:py-24">
        <div className="animate-rise">
          <p className="eyebrow mb-2">About BCovered</p>
          <h1 className="font-display text-5xl leading-tight font-bold text-brand-900">Insurance advice, the way it should be.</h1>
        </div>
        <div className="space-y-4 text-lg leading-relaxed text-ink/70">
          <p>
            BCovered was founded on a simple idea: insurance should be easy to understand, fairly priced and there for you when life happens.
          </p>
          <p>
            As an independent, authorised financial services provider, we compare cover across South Africa’s leading insurers and give honest advice – then stay by your side for every renewal and every claim.
          </p>
        </div>
      </section>

      <section className="border-y border-brand-800/10 bg-white py-12">
        <div className="container-x grid grid-cols-2 gap-8 text-center md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="font-display text-4xl font-bold text-brand-800">{s.value}</p>
              <p className="mt-1 text-sm text-ink/60">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x py-20">
        <h2 className="mb-10 font-display text-4xl font-bold text-brand-900">What we stand for</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((v) => (
            <div key={v.title} className="card p-6">
              <v.icon className="h-7 w-7 text-brand-500" />
              <h3 className="mt-4 font-semibold text-brand-900">{v.title}</h3>
              <p className="mt-1 text-sm text-ink/60">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="container-x">
          <h2 className="mb-10 font-display text-4xl font-bold text-brand-900">Meet the team</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((t) => (
              <figure key={t.name}>
                <img src={t.img} alt={t.name} className="aspect-square w-full rounded-3xl object-cover" />
                <figcaption className="mt-4">
                  <p className="font-semibold text-brand-900">{t.name}</p>
                  <p className="text-sm text-ink/60">{t.role}</p>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-6 text-xs text-ink/40">Team members are fictional and photos are stock imagery.</p>
        </div>
      </section>

      <section className="container-x py-20 text-center">
        <h2 className="font-display text-3xl font-bold text-brand-900">Let’s find you better cover</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/quote" className="btn-primary">Get a quote</Link>
          <Link to="/contact" className="btn-ghost">Contact us</Link>
        </div>
      </section>
    </>
  )
}
