// Every Route definition registers itself on import. Adding a Route means adding a definition file here.
import './motorQuotes'
import './policySetup'
import './policyChange'
import './policyRenew'
import './policyCancel'
import './claimRegister'
import './claimProgress'
import './claimResolve'

export * from './definitions'
export * from './engine'
export { businessKeyOf } from './definitions'
