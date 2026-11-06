import { jobTools } from '../jobs/jobTools'
import { approvalTools } from './approval'
import { businessTools } from './business'
import { communicationTools } from './communication'
import { customerTools } from './customer'
import { leadTools } from './lead'
import { quoteTools } from './quote'
import { registerTools } from './registry'
import { riskTools } from './risk'
import { taskTools } from './task'
import { underwritingTools } from './underwriting'

registerTools([
  ...customerTools,
  ...leadTools,
  ...quoteTools,
  ...approvalTools,
  ...communicationTools,
  ...jobTools,
  ...businessTools,
  ...riskTools,
  ...underwritingTools,
  ...taskTools,
])

export { invokeTool, listTools } from './registry'
