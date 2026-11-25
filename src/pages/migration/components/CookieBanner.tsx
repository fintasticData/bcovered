import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { MIGRATION_BASE } from '../content/site'

const KEY = 'bcovered-migration-cookie-ok'

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  return (
    <div className="mig-cookie" role="dialog" aria-label="Cookie notice">
      <div className="mig-cookie-inner">
        <p>
          We use cookies to improve your experience, analyze site traffic, and serve advertising. By continuing to use
          this website, you consent to our{' '}
          <Link to={`${MIGRATION_BASE}/terms`}>Terms & Conditions</Link>.
        </p>
        <button
          type="button"
          className="mig-btn mig-btn-mint"
          onClick={() => {
            try {
              localStorage.setItem(KEY, '1')
            } catch {
              /* ignore */
            }
            setVisible(false)
          }}
        >
          Got it <Check size={16} />
        </button>
      </div>
    </div>
  )
}
