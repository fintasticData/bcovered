import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section className="container-x py-28 text-center">
      <p className="font-display text-7xl font-bold text-gold-400">404</p>
      <h1 className="mt-4 font-display text-3xl font-bold text-brand-900">This page isn’t covered</h1>
      <p className="mt-2 text-ink/60">The page you’re looking for doesn’t exist or has moved.</p>
      <Link to="/" className="btn-dark mt-8">Back to home</Link>
    </section>
  )
}
