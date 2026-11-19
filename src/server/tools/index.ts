import { jobTools } from '../jobs/jobTools'
import { approvalTools } from './approval'
import { assessmentTools } from './assessment'
import { businessTools } from './business'
import { communicationTools } from './communication'
import { coverageTools } from './coverage'
import { customerTools } from './customer'
import { leadTools } from './lead'
import { quoteTools } from './quote'
import { registerTools } from './registry'
import { riskTools } from './risk'
import { taskTools } from './task'
import { twinTools } from './twin'
import { underwritingTools } from './underwriting'
import { adviserTools } from './adviser'
import { controlsTools } from './controls'
import { fundsTools } from './funds'
import { specialistTools } from './specialist'
import { lifeTools } from './life'
import { personTools } from './person'
import { routeTools } from './route'

function boot() {
  registerTools([
    ...personTools,
    ...routeTools,
    ...adviserTools,
    ...lifeTools,
    ...controlsTools,
    ...fundsTools,
    ...specialistTools,
    ...customerTools,
    ...leadTools,
    ...quoteTools,
    ...approvalTools,
    ...communicationTools,
    ...jobTools,
    ...businessTools,
    ...riskTools,
    ...twinTools,
    ...assessmentTools,
    ...coverageTools,
    ...underwritingTools,
    ...taskTools,
  ])
}

boot()

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    boot()
  })
}

export { invokeTool, listTools } from './registry'
