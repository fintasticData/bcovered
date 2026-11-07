import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowRight, Building2, CheckCircle2, PlusCircle, XCircle } from 'lucide-react'
import { getProduct, personalProducts } from '../data/products'
import { rand } from '../lib/quote'
import NotFound from './NotFound'

export default function ProductPage() {
  const { slug } = useParams()
  if (slug === 'business') return <Navigate to="/business" replace />
  const product = getProduct(slug)
  if (!product) return <NotFound />

  const others = personalProducts.filter((p) => p.slug !== product.slug).slice(0, 3)

  return (
    <>
      <section className="container-x grid grid-cols-1 items-center gap-12 py-14 lg:grid-cols-2 lg:py-20">
        <div className="animate-rise space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
            <product.icon className="h-4 w-4" /> {product.name}
          </span>
          <h1 className="font-display text-5xl leading-tight font-bold text-brand-900">{product.tagline}</h1>
          <p className="text-lg text-ink/70">
            Compare {product.name.toLowerCase()} from leading insurers, with cover starting from{' '}
            <strong className="text-brand-800">{rand(product.fromPrice)} per month</strong>.
          </p>
          <div className="flex flex-wrap gap-3">
            {product.slug === 'car' ? (
              <>
                <Link to="/assist" className="btn-primary">
                  Start an AI-assisted assessment <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to={`/quote?product=${product.slug}`} className="btn-ghost">Prefer a form?</Link>
              </>
            ) : (
              <Link to={`/quote?product=${product.slug}`} className="btn-primary">
                Get a quote <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            <Link to="/contact" className="btn-ghost">Speak to an adviser</Link>
          </div>
        </div>
        <img src={product.image} alt="" className="aspect-[4/3] w-full rounded-[2rem] object-cover shadow-xl" />
      </section>

      <section className="bg-white py-16">
        <div className="container-x grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="card p-7 lg:col-span-1">
            <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold text-brand-900">
              <CheckCircle2 className="h-5 w-5 text-brand-500" /> What’s covered
            </h2>
            <ul className="space-y-3 text-sm text-ink/75">
              {product.covers.map((c) => (
                <li key={c} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />{c}</li>
              ))}
            </ul>
          </div>
          <div className="card p-7">
            <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold text-brand-900">
              <PlusCircle className="h-5 w-5 text-gold-500" /> Optional extras
            </h2>
            <div className="flex flex-wrap gap-2">
              {product.extras.map((e) => (
                <span key={e} className="rounded-full bg-gold-300/30 px-3 py-1.5 text-xs font-medium text-brand-900">{e}</span>
              ))}
            </div>
          </div>
          <div className="card p-7">
            <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold text-brand-900">
              <XCircle className="h-5 w-5 text-red-500" /> Typical exclusions
            </h2>
            <ul className="space-y-3 text-sm text-ink/75">
              {product.exclusions.map((x) => (
                <li key={x} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />{x}</li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-ink/50">
              General descriptions only, not policy wording. Cover and exclusions vary by insurer – your broker will walk you through the actual policy.
            </p>
          </div>
        </div>
      </section>

      <section className="container-x py-16">
        <h2 className="mb-6 font-display text-3xl font-bold text-brand-900">You might also need</h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {others.map((p) => (
            <Link key={p.slug} to={`/insurance/${p.slug}`} className="card group flex items-center gap-4 p-5 transition hover:shadow-lg">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700"><p.icon className="h-6 w-6" /></span>
              <span className="flex-1">
                <span className="block font-semibold text-brand-900">{p.name}</span>
                <span className="text-sm text-ink/60">From {rand(p.fromPrice)} pm</span>
              </span>
              <ArrowRight className="h-4 w-4 text-brand-500 transition group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
        <Link
          to="/business"
          className="group mt-5 flex flex-col gap-3 rounded-3xl bg-brand-900 p-6 text-white transition hover:bg-brand-800 sm:flex-row sm:items-center"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-gold-300"><Building2 className="h-6 w-6" /></span>
          <span className="flex-1">
            <span className="block font-semibold">Insuring a business?</span>
            <span className="text-sm text-brand-100/80">Business cover for 14 industries, from sole traders to multi-site groups, coordinated by a broker.</span>
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-gold-300">
            Explore business insurance <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </span>
        </Link>
      </section>
    </>
  )
}
